import type { PoolClient } from 'pg';
import { withTransaction, type Db } from '../db/pool.js';
import { planRoomTeams, seatLabelsFor } from '../lib/allocation.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';

// Every write here locks the event row first: the same lock the kiosk takes before seating a student,
// so room changes and live check-ins never interleave.

export interface RoomInput {
  name: string;
  capacity: number;
  teamSize?: number | null;
  isActive?: boolean;
  priority?: number;
}

interface LockedEvent {
  id: number;
  status: 'draft' | 'active' | 'completed';
  team_size: number;
  seat_labels: string[];
}

async function lockEditableEvent(client: PoolClient, eventId: number): Promise<LockedEvent> {
  const { rows: [event] } = await client.query(
    'SELECT id, status, team_size, seat_labels FROM events WHERE id = $1 FOR UPDATE',
    [eventId],
  );
  if (!event) throw notFound('Event');
  if (event.status === 'completed') {
    throw new AppError(409, 'EVENT_LOCKED', 'This event is completed. Its rooms can no longer be changed.');
  }
  return event;
}

export async function logAllocation(db: Db, eventId: number, action: string, details: object, actor?: string) {
  await db.query(
    'INSERT INTO allocation_log (event_id, action, details, created_by) VALUES ($1, $2, $3, $4)',
    [eventId, action, JSON.stringify(details), actor ?? null],
  );
}

async function occupiedSeats(client: PoolClient, roomId: number): Promise<number> {
  const { rows: [r] } = await client.query(
    `SELECT COUNT(*)::int AS n FROM seats s JOIN teams t ON t.id = s.team_id
     WHERE t.room_id = $1 AND s.status = 'assigned'`,
    [roomId],
  );
  return r.n;
}

/**
 * Make a room's tables and seats match its approved capacity and team size.
 * Grows by topping up the last table, then adding tables numbered after the room's highest.
 * Shrinks only by removing empty seats from the end of the room; occupied seats are never touched.
 */
export async function syncRoomSeats(client: PoolClient, roomId: number): Promise<{ teams: number; seats: number }> {
  const { rows: [room] } = await client.query(
    `SELECT r.id, r.event_id, r.capacity, COALESCE(r.team_size, e.team_size) AS team_size, e.seat_labels
     FROM rooms r JOIN events e ON e.id = r.event_id WHERE r.id = $1`,
    [roomId],
  );
  if (!room) throw notFound('Room');
  const size: number = room.team_size;
  const labels = seatLabelsFor(size, room.seat_labels);

  const { rows } = await client.query(
    `SELECT t.id AS team_id, t.team_number, s.id AS seat_id, s.label, s.position, s.status
     FROM teams t LEFT JOIN seats s ON s.team_id = t.id
     WHERE t.room_id = $1 ORDER BY t.team_number, s.position`,
    [roomId],
  );
  const teams: { id: number; teamNumber: number; seats: { id: number; label: string; position: number; status: string }[] }[] = [];
  for (const r of rows) {
    let team = teams.at(-1);
    if (!team || team.id !== r.team_id) teams.push((team = { id: r.team_id, teamNumber: r.team_number, seats: [] }));
    if (r.seat_id) team.seats.push({ id: r.seat_id, label: r.label, position: r.position, status: r.status });
  }

  // Team size changed since the tables were built: rebuild, but only if nobody is seated here yet.
  const mismatched = teams.some((t, i) => t.seats.length > size || (i < teams.length - 1 && t.seats.length !== size));
  if (mismatched) {
    if (teams.some((t) => t.seats.some((s) => s.status === 'assigned'))) {
      throw new AppError(409, 'TEAM_SIZE_LOCKED',
        'Students are already seated in this room, so its team size cannot change. Create a new room for a different team size.');
    }
    await client.query('DELETE FROM teams WHERE room_id = $1', [roomId]);
    teams.length = 0;
  }

  const current = teams.reduce((n, t) => n + t.seats.length, 0);
  const target: number = room.capacity;

  if (target > current) {
    let remaining = target - current;
    const last = teams.at(-1);
    if (last && last.seats.length < size) {
      const add = Math.min(size - last.seats.length, remaining);
      const newLabels = labels.slice(last.seats.length, last.seats.length + add);
      await client.query(
        `INSERT INTO seats (event_id, team_id, label, position)
         SELECT $1, $2, label, $3 + ord FROM unnest($4::text[]) WITH ORDINALITY AS l(label, ord)`,
        [room.event_id, last.id, last.seats.length, newLabels],
      );
      await client.query('UPDATE teams SET capacity = $2 WHERE id = $1', [last.id, last.seats.length + add]);
      remaining -= add;
    }
    if (remaining > 0) {
      const offset = teams.reduce((m, t) => Math.max(m, t.teamNumber), 0);
      const plan = planRoomTeams(remaining, size).map((t) => ({ ...t, teamNumber: t.teamNumber + offset }));
      const { rows: created } = await client.query(
        `INSERT INTO teams (event_id, room_id, team_number, capacity)
         SELECT $1, $2, n, c FROM unnest($3::int[], $4::int[]) AS p(n, c) RETURNING id`,
        [room.event_id, roomId, plan.map((t) => t.teamNumber), plan.map((t) => t.capacity)],
      );
      await client.query(
        `INSERT INTO seats (event_id, team_id, label, position)
         SELECT t.event_id, t.id, l.label, l.ord
         FROM teams t CROSS JOIN LATERAL unnest($2::text[]) WITH ORDINALITY AS l(label, ord)
         WHERE t.id = ANY($1::int[]) AND l.ord <= t.capacity`,
        [created.map((c) => c.id), labels],
      );
    }
  } else if (target < current) {
    // Remove seats from the end of the room only, and only if they are empty.
    const fromEnd = teams.flatMap((t) => t.seats.map((s) => ({ ...s, team: t }))).reverse().slice(0, current - target);
    const occupied = fromEnd.filter((s) => s.status === 'assigned');
    if (occupied.length) {
      const codes = occupied.map((s) => `${s.team.teamNumber}${s.label}`).reverse().join(', ');
      throw new AppError(409, 'CAPACITY_CONFLICT',
        `Seats ${codes} at the end of this room are occupied. Capacity can only shrink by removing empty seats from the last tables.`);
    }
    await client.query('DELETE FROM seats WHERE id = ANY($1::int[])', [fromEnd.map((s) => s.id)]);
    await client.query(
      `UPDATE teams t SET capacity = sub.n
       FROM (SELECT team_id, COUNT(*)::int AS n FROM seats WHERE team_id = ANY($1::int[]) GROUP BY team_id) sub
       WHERE t.id = sub.team_id`,
      [teams.map((t) => t.id)],
    );
    await client.query(
      'DELETE FROM teams t WHERE t.room_id = $1 AND NOT EXISTS (SELECT 1 FROM seats s WHERE s.team_id = t.id)',
      [roomId],
    );
  }

  const { rows: [after] } = await client.query(
    `SELECT COUNT(DISTINCT t.id)::int AS teams, COUNT(s.id)::int AS seats
     FROM teams t LEFT JOIN seats s ON s.team_id = t.id WHERE t.room_id = $1`,
    [roomId],
  );
  return after;
}

function validate(input: RoomInput) {
  if (!input.name.trim()) throw badRequest('Room name is required.');
  if (!Number.isInteger(input.capacity) || input.capacity < 1) throw badRequest('Approved capacity must be at least 1 seat.');
  if (input.capacity > 2000) throw badRequest('Approved capacity looks too large (max 2000 per room).');
  if (input.teamSize != null && (input.teamSize < 2 || input.teamSize > 8)) throw badRequest('Students per team must be between 2 and 8.');
}

export function createRoom(eventId: number, input: RoomInput, actor?: string) {
  validate(input);
  return withTransaction(async (client) => {
    const event = await lockEditableEvent(client, eventId);
    const { rows: [{ max }] } = await client.query('SELECT COALESCE(MAX(priority), 0)::int AS max FROM rooms WHERE event_id = $1', [eventId]);
    const priority = Math.min(Math.max(1, input.priority ?? max + 1), max + 1);
    // Insert at the requested priority; rooms at or after it move down one place.
    await client.query('SET CONSTRAINTS rooms_event_id_priority_key DEFERRED');
    await client.query('UPDATE rooms SET priority = priority + 1 WHERE event_id = $1 AND priority >= $2', [eventId, priority]);
    const teamSize = input.teamSize && input.teamSize !== event.team_size ? input.teamSize : null;
    const { rows: [room] } = await client.query(
      `INSERT INTO rooms (event_id, name, capacity, priority, team_size, is_active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [eventId, input.name.trim(), input.capacity, priority, teamSize, input.isActive ?? true],
    );
    const layout = event.status === 'active' ? await syncRoomSeats(client, room.id) : null;
    await logAllocation(client, eventId, 'room.created', { roomId: room.id, name: input.name.trim(), capacity: input.capacity, priority, layout }, actor);
    return { id: room.id, layout };
  });
}

export function updateRoom(eventId: number, roomId: number, input: RoomInput & { confirmReduction?: boolean }, actor?: string) {
  validate(input);
  return withTransaction(async (client) => {
    const event = await lockEditableEvent(client, eventId);
    const { rows: [before] } = await client.query(
      'SELECT id, name, capacity, priority, team_size, is_active FROM rooms WHERE id = $1 AND event_id = $2',
      [roomId, eventId],
    );
    if (!before) throw notFound('Room');
    const occupied = await occupiedSeats(client, roomId);

    if (input.capacity < occupied) {
      throw new AppError(409, 'CAPACITY_BELOW_OCCUPANCY',
        `${occupied} students are already seated in this room, so approved capacity cannot go below ${occupied}.`);
    }
    if (input.capacity < before.capacity && !input.confirmReduction) {
      throw new AppError(409, 'CONFIRM_REQUIRED',
        `This removes ${before.capacity - input.capacity} approved seats. Confirm to continue; only empty seats are removed.`);
    }

    const teamSize = input.teamSize === undefined
      ? before.team_size
      : input.teamSize && input.teamSize !== event.team_size ? input.teamSize : null;
    if ((teamSize ?? event.team_size) !== (before.team_size ?? event.team_size) && occupied > 0) {
      throw new AppError(409, 'TEAM_SIZE_LOCKED',
        'Students are already seated in this room, so its team size cannot change. Create a new room for a different team size.');
    }

    const { rows: [{ max }] } = await client.query('SELECT MAX(priority)::int AS max FROM rooms WHERE event_id = $1', [eventId]);
    if (input.priority !== undefined) input.priority = Math.min(Math.max(1, input.priority), max);
    await client.query('SET CONSTRAINTS rooms_event_id_priority_key DEFERRED');
    if (input.priority !== undefined && input.priority !== before.priority) {
      // Swap with whichever room currently holds the requested priority.
      await client.query('UPDATE rooms SET priority = $3 WHERE event_id = $1 AND priority = $2', [eventId, input.priority, before.priority]);
    }
    await client.query(
      `UPDATE rooms SET name = $2, capacity = $3, team_size = $4, is_active = $5, priority = $6, updated_at = now()
       WHERE id = $1`,
      [roomId, input.name.trim(), input.capacity, teamSize, input.isActive ?? before.is_active, input.priority ?? before.priority],
    );
    const layout = event.status === 'active' ? await syncRoomSeats(client, roomId) : null;
    await logAllocation(client, eventId, 'room.updated', {
      roomId,
      before: { name: before.name, capacity: before.capacity, priority: before.priority, teamSize: before.team_size, isActive: before.is_active },
      after: { name: input.name.trim(), capacity: input.capacity, priority: input.priority ?? before.priority, teamSize, isActive: input.isActive ?? before.is_active },
      layout,
    }, actor);
    return { id: roomId, layout };
  });
}

export function moveRoom(eventId: number, roomId: number, direction: 'up' | 'down', actor?: string) {
  return withTransaction(async (client) => {
    await lockEditableEvent(client, eventId);
    const { rows } = await client.query('SELECT id, priority FROM rooms WHERE event_id = $1 ORDER BY priority', [eventId]);
    const i = rows.findIndex((r) => r.id === roomId);
    if (i === -1) throw notFound('Room');
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= rows.length) return { moved: false };
    await client.query('SET CONSTRAINTS rooms_event_id_priority_key DEFERRED');
    await client.query('UPDATE rooms SET priority = $2, updated_at = now() WHERE id = $1', [rows[i].id, rows[j].priority]);
    await client.query('UPDATE rooms SET priority = $2, updated_at = now() WHERE id = $1', [rows[j].id, rows[i].priority]);
    await logAllocation(client, eventId, 'room.reordered', { roomId, direction, from: rows[i].priority, to: rows[j].priority }, actor);
    return { moved: true };
  });
}

export function deleteRoom(eventId: number, roomId: number, actor?: string) {
  return withTransaction(async (client) => {
    await lockEditableEvent(client, eventId);
    const { rows: [room] } = await client.query('SELECT name, priority FROM rooms WHERE id = $1 AND event_id = $2', [roomId, eventId]);
    if (!room) throw notFound('Room');
    const occupied = await occupiedSeats(client, roomId);
    if (occupied > 0) {
      throw new AppError(409, 'ROOM_OCCUPIED',
        `${occupied} students are seated in ${room.name}. A room with seated students cannot be removed; disable it instead to stop new allocations.`);
    }
    await client.query('DELETE FROM rooms WHERE id = $1', [roomId]);
    // Close the gap in priorities.
    await client.query('UPDATE rooms SET priority = priority - 1 WHERE event_id = $1 AND priority > $2', [eventId, room.priority]);
    await logAllocation(client, eventId, 'room.deleted', { roomId, name: room.name }, actor);
    return { ok: true };
  });
}

/**
 * Seat everyone on the waiting list, in arrival order, into the first free seats:
 * rooms by priority (enabled rooms only), then table number, then seat position.
 * Idempotent: only waiting students are touched, so running it twice changes nothing the second time.
 */
export function allocateWaiting(eventId: number, actor?: string) {
  return withTransaction(async (client) => {
    const { rows: [event] } = await client.query('SELECT id, status FROM events WHERE id = $1 FOR UPDATE', [eventId]);
    if (!event) throw notFound('Event');
    if (event.status !== 'active') {
      throw new AppError(409, 'EVENT_NOT_ACTIVE', 'Allocation is only possible while the event is active.');
    }
    const { rows: placed } = await client.query(
      `WITH free AS (
         SELECT s.id AS seat_id, s.label, t.id AS team_id, t.room_id,
                row_number() OVER (ORDER BY r.priority, t.team_number, s.position) AS rn
         FROM seats s JOIN teams t ON t.id = s.team_id JOIN rooms r ON r.id = t.room_id
         WHERE s.event_id = $1 AND s.status = 'available' AND r.is_active),
       waiting AS (
         SELECT id AS ep_id, row_number() OVER (ORDER BY arrived_at NULLS LAST, id) AS rn
         FROM event_participants WHERE event_id = $1 AND status = 'waiting' AND seat_id IS NULL),
       pairs AS (SELECT * FROM waiting JOIN free USING (rn)),
       taken AS (
         UPDATE seats s SET status = 'assigned', event_participant_id = p.ep_id
         FROM pairs p WHERE s.id = p.seat_id AND s.status = 'available' RETURNING s.id)
       UPDATE event_participants ep
       SET seat_id = p.seat_id, seat_label = p.label, team_id = p.team_id, room_id = p.room_id,
           status = 'checked_in', check_in_time = COALESCE(ep.arrived_at, now()), assigned_at = now()
       FROM pairs p WHERE ep.id = p.ep_id
       RETURNING ep.id, p.room_id`,
      [eventId],
    );
    const { rows: [left] } = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM event_participants WHERE event_id = $1 AND status = 'waiting') AS waiting,
         (SELECT COUNT(*)::int FROM seats s JOIN teams t ON t.id = s.team_id JOIN rooms r ON r.id = t.room_id
          WHERE s.event_id = $1 AND s.status = 'available' AND r.is_active) AS available`,
      [eventId],
    );
    const byRoom: Record<number, number> = {};
    for (const p of placed) byRoom[p.room_id] = (byRoom[p.room_id] ?? 0) + 1;
    if (placed.length) await logAllocation(client, eventId, 'allocation.waiting', { allocated: placed.length, byRoom, stillWaiting: left.waiting }, actor);
    return { allocated: placed.length, stillWaiting: left.waiting, availableSeats: left.available, byRoom };
  });
}
