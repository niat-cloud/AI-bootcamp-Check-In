import type { PoolClient } from 'pg';
import { withTransaction, type Db } from '../db/pool.js';
import { pickTeam, type TeamState } from '../lib/allocation.js';
import { AppError, notFound } from '../lib/errors.js';
import { maskPhone } from '../lib/phone.js';

// Queries here are deliberately combined: the database may be ~150 ms away, so every round-trip counts.

export interface SeatAssignment {
  eventParticipantId: number;
  alreadyAssigned: boolean;
  participant: {
    name: string;
    schoolCollege: string;
    className: string | null;
    location?: string | null;
    phone: string;
    registrationType: string;
  };
  room: string | null;
  teamNumber: number | null;
  teamName: string | null;
  seatLabel: string | null;
  seatCode: string | null;
  members: { label: string; name: string | null; isSelf: boolean }[];
}

/** Read a participant's seat (if any) for display, in one query. Phone is masked. */
export async function getAssignment(db: Db, eventParticipantId: number, alreadyAssigned = false): Promise<SeatAssignment> {
  const { rows: [row] } = await db.query(
    `SELECT ep.id, ep.registration_type, ep.seat_label,
            p.name, p.school_college, p.class, p.location, p.phone,
            r.name AS room_name, t.team_number, e.team_name_prefix,
            COALESCE((
              SELECT json_agg(json_build_object('label', s.label, 'name', mp.name, 'epId', s.event_participant_id) ORDER BY s.position)
              FROM seats s
              LEFT JOIN event_participants mep ON mep.id = s.event_participant_id
              LEFT JOIN participants mp ON mp.id = mep.participant_id
              WHERE s.team_id = ep.team_id
            ), '[]'::json) AS members
     FROM event_participants ep
     JOIN participants p ON p.id = ep.participant_id
     JOIN events e ON e.id = ep.event_id
     LEFT JOIN rooms r ON r.id = ep.room_id
     LEFT JOIN teams t ON t.id = ep.team_id
     WHERE ep.id = $1`,
    [eventParticipantId],
  );
  if (!row) throw notFound('Participant');

  return {
    eventParticipantId: row.id,
    alreadyAssigned,
    participant: {
      name: row.name,
      schoolCollege: row.school_college,
      className: row.class,
      location: row.location ?? null,
      phone: maskPhone(row.phone),
      registrationType: row.registration_type,
    },
    room: row.room_name,
    teamNumber: row.team_number,
    teamName: row.team_number ? `${row.team_name_prefix} ${row.team_number}` : null,
    seatLabel: row.seat_label,
    seatCode: row.team_number ? `${row.team_number}${row.seat_label}` : null,
    // Every seat at the table; empty seats have name = null ("waiting for teammate").
    members: (row.members as { label: string; name: string | null; epId: number | null }[]).map((m) => ({
      label: m.label,
      name: m.name ? m.name.split(/\s+/)[0] : null,
      isSelf: m.epId === row.id,
    })),
  };
}

/**
 * Permanently assign a seat to a participant. Idempotent: a participant who already has a seat gets
 * that same seat back with alreadyAssigned = true. Must run inside a transaction.
 * If `expectedEventId` is given, the participant must belong to that event.
 */
export async function assignSeatTx(
  client: PoolClient,
  eventParticipantId: number,
  options: { expectedEventId?: number; rng?: () => number } = {},
): Promise<SeatAssignment> {
  // 1. Lock the event row. Every seat assignment for the event takes this lock, so they run one at a time.
  const { rows: [event] } = await client.query(
    `SELECT e.id, e.status, e.active_pool_size, e.pool_fill_threshold
     FROM events e JOIN event_participants ep ON ep.event_id = e.id
     WHERE ep.id = $1 FOR UPDATE OF e`,
    [eventParticipantId],
  );
  if (!event || (options.expectedEventId !== undefined && event.id !== options.expectedEventId)) {
    throw new AppError(404, 'NOT_FOUND', 'Student not found in the current event.');
  }
  if (event.status !== 'active') {
    throw new AppError(409, 'EVENT_NOT_ACTIVE',
      event.status === 'completed' ? 'This event has been completed. No new seats can be assigned.' : 'This event has not been activated yet.');
  }

  // 2. Under the lock (fresh snapshot): existing seat? Otherwise the first room by priority with a free
  //    seat, and the occupancy of every table in it.
  const { rows } = await client.query(
    `WITH room AS (
       SELECT r.id FROM rooms r
       WHERE r.event_id = $2 AND EXISTS (
         SELECT 1 FROM seats s JOIN teams t ON t.id = s.team_id
         WHERE t.room_id = r.id AND s.status = 'available')
       ORDER BY r.priority LIMIT 1)
     SELECT (SELECT seat_id FROM event_participants WHERE id = $1) AS existing_seat,
            (SELECT id FROM room) AS room_id,
            t.id, t.team_number, t.capacity,
            COUNT(s.id) FILTER (WHERE s.status = 'assigned')::int AS assigned
     FROM (SELECT 1) one
     LEFT JOIN teams t ON t.room_id = (SELECT id FROM room)
     LEFT JOIN seats s ON s.team_id = t.id
     GROUP BY t.id
     ORDER BY t.team_number`,
    [eventParticipantId, event.id],
  );
  if (rows[0]?.existing_seat) return getAssignment(client, eventParticipantId, true);

  const roomId: number | null = rows[0]?.room_id ?? null;
  const teams: TeamState[] = rows.filter((t) => t.id).map((t) => ({
    id: t.id, teamNumber: t.team_number, capacity: t.capacity, assigned: t.assigned,
  }));
  const team = roomId ? pickTeam(teams, event.active_pool_size, Number(event.pool_fill_threshold), options.rng) : null;
  if (!team) {
    throw new AppError(409, 'VENUE_FULL', 'Venue capacity reached. All configured seats are occupied. Please contact the event organizer.');
  }

  // 3. Take the first free seat at that table and record it on both sides, in one statement.
  const { rowCount } = await client.query(
    `WITH seat AS (
       SELECT id, label FROM seats WHERE team_id = $2 AND status = 'available'
       ORDER BY position LIMIT 1 FOR UPDATE),
     taken AS (
       UPDATE seats s SET status = 'assigned', event_participant_id = $1
       FROM seat WHERE s.id = seat.id RETURNING s.id, s.label)
     UPDATE event_participants ep
     SET seat_id = taken.id, seat_label = taken.label, team_id = $2, room_id = $3,
         status = 'checked_in', check_in_time = now(), assigned_at = now()
     FROM taken WHERE ep.id = $1`,
    [eventParticipantId, team.id, roomId],
  );
  if (rowCount !== 1) throw new Error('Seat assignment failed to update');

  return getAssignment(client, eventParticipantId, false);
}

export function assignSeat(eventParticipantId: number): Promise<SeatAssignment> {
  return withTransaction((client) => assignSeatTx(client, eventParticipantId));
}
