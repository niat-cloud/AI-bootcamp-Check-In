import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { planTeams } from '../lib/allocation.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { generateTeamsAndSeats } from '../services/teams.js';

export const eventsRouter = Router();

const EVENT_COLUMNS = `id, name, event_date AS "date", event_time AS "time", status,
  expected_students AS "expectedStudents", team_size AS "teamSize", seat_labels AS "seatLabels",
  team_name_prefix AS "teamNamePrefix", active_pool_size AS "activePoolSize",
  pool_fill_threshold AS "poolFillThreshold", created_at AS "createdAt",
  activated_at AS "activatedAt", completed_at AS "completedAt"`;

const eventInput = z.object({
  name: z.string().trim().min(1, 'Event name is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date is required'),
  time: z.string().trim().default(''),
  expectedStudents: z.coerce.number().int().min(0),
  teamSize: z.coerce.number().int().min(2).max(8),
  seatLabels: z.array(z.string().trim().min(1).max(4)),
  teamNamePrefix: z.string().trim().min(1).default('Team'),
  activePoolSize: z.coerce.number().int().min(1),
  poolFillThreshold: z.coerce.number().gt(0).max(1),
});

function validateLabels(v: { teamSize: number; seatLabels: string[] }) {
  if (v.seatLabels.length !== v.teamSize) {
    throw badRequest(`Seat labels must have exactly ${v.teamSize} entries (one per seat at a table).`);
  }
  if (new Set(v.seatLabels.map((l) => l.toUpperCase())).size !== v.seatLabels.length) {
    throw badRequest('Seat labels must be unique.');
  }
}

export async function loadEvent(id: number) {
  const { rows: [event] } = await pool.query(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = $1`, [id]);
  if (!event) throw notFound('Event');
  return event;
}

eventsRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT ${EVENT_COLUMNS},
       (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.event_id = events.id) AS "participantCount",
       (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.event_id = events.id AND ep.seat_id IS NOT NULL) AS "checkedInCount"
     FROM events ORDER BY event_date DESC, id DESC`,
  );
  res.json(rows);
});

/** The event the app is working on: the active one, else the newest draft. */
eventsRouter.get('/current', async (_req, res) => {
  const { rows: [event] } = await pool.query(
    `SELECT ${EVENT_COLUMNS} FROM events WHERE status IN ('active', 'draft')
     ORDER BY (status = 'active') DESC, created_at DESC LIMIT 1`,
  );
  res.json(event ?? null);
});

eventsRouter.get('/:id', async (req, res) => {
  res.json(await loadEvent(Number(req.params.id)));
});

eventsRouter.post('/', async (req, res) => {
  const v = eventInput.parse(req.body);
  validateLabels(v);
  const { rows: [event] } = await pool.query(
    `INSERT INTO events (name, event_date, event_time, expected_students, team_size, seat_labels,
       team_name_prefix, active_pool_size, pool_fill_threshold)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${EVENT_COLUMNS}`,
    [v.name, v.date, v.time, v.expectedStudents, v.teamSize, v.seatLabels, v.teamNamePrefix, v.activePoolSize, v.poolFillThreshold],
  );
  res.status(201).json(event);
});

eventsRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const current = await loadEvent(id);
  if (current.status === 'completed') throw new AppError(409, 'EVENT_LOCKED', 'A completed event cannot be edited.');
  const v = eventInput.parse({ ...current, ...req.body });
  validateLabels(v);
  if (current.status === 'active') {
    // Once seating has started, only descriptive fields may change.
    const seatingChanged = v.teamSize !== current.teamSize
      || v.seatLabels.join() !== current.seatLabels.join()
      || v.teamNamePrefix !== current.teamNamePrefix;
    if (seatingChanged) throw new AppError(409, 'EVENT_LOCKED', 'Team size and seat labels cannot change after the event is activated.');
  }
  const { rows: [event] } = await pool.query(
    `UPDATE events SET name = $2, event_date = $3, event_time = $4, expected_students = $5, team_size = $6,
       seat_labels = $7, team_name_prefix = $8, active_pool_size = $9, pool_fill_threshold = $10
     WHERE id = $1 RETURNING ${EVENT_COLUMNS}`,
    [id, v.name, v.date, v.time, v.expectedStudents, v.teamSize, v.seatLabels, v.teamNamePrefix, v.activePoolSize, v.poolFillThreshold],
  );
  res.json(event);
});

eventsRouter.delete('/:id', async (req, res) => {
  const event = await loadEvent(Number(req.params.id));
  if (event.status !== 'draft') throw new AppError(409, 'EVENT_LOCKED', 'Only draft events can be deleted.');
  await pool.query('DELETE FROM events WHERE id = $1', [event.id]);
  res.json({ ok: true });
});

eventsRouter.post('/:id/activate', async (req, res) => {
  const id = Number(req.params.id);
  const result = await withTransaction(async (client) => {
    const { rows: [event] } = await client.query('SELECT status FROM events WHERE id = $1 FOR UPDATE', [id]);
    if (!event) throw notFound('Event');
    if (event.status !== 'draft') throw new AppError(409, 'BAD_STATUS', `Event is already ${event.status}.`);
    const { rows: [other] } = await client.query(`SELECT name FROM events WHERE status = 'active' AND id <> $1`, [id]);
    if (other) throw new AppError(409, 'OTHER_ACTIVE', `"${other.name}" is still active. Complete it before activating a new event.`);
    const rooms = await client.query('SELECT 1 FROM rooms WHERE event_id = $1', [id]);
    if (!rooms.rowCount) throw badRequest('Add at least one room before activating.');
    const teams = await generateTeamsAndSeats(client, id);
    await client.query(`UPDATE events SET status = 'active', activated_at = now() WHERE id = $1`, [id]);
    return { teams };
  });
  res.json({ ...(await loadEvent(id)), teamsCreated: result.teams });
});

eventsRouter.post('/:id/complete', async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = await pool.query(
    `UPDATE events SET status = 'completed', completed_at = now() WHERE id = $1 AND status = 'active'`,
    [id],
  );
  if (!rowCount) throw new AppError(409, 'BAD_STATUS', 'Only an active event can be completed.');
  res.json(await loadEvent(id));
});

// ---- Rooms ----

const roomInput = z.object({
  name: z.string().trim().min(1, 'Room name is required'),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1'),
  priority: z.coerce.number().int().min(1),
});

async function assertDraft(eventId: number) {
  const event = await loadEvent(eventId);
  if (event.status !== 'draft') throw new AppError(409, 'EVENT_LOCKED', 'Rooms are locked once the event is activated.');
  return event;
}

eventsRouter.get('/:id/rooms', async (req, res) => {
  const eventId = Number(req.params.id);
  const event = await loadEvent(eventId);
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.capacity, r.priority,
       (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.room_id = r.id) AS used,
       (SELECT COUNT(*)::int FROM teams t WHERE t.room_id = r.id) AS "teamCount"
     FROM rooms r WHERE r.event_id = $1 ORDER BY r.priority`,
    [eventId],
  );
  // Preview of tables per room (before activation, teamCount is still 0).
  const plan = planTeams(rows, event.teamSize);
  for (const room of rows) {
    const teams = plan.filter((t) => t.roomId === room.id);
    room.plannedTeams = teams.length;
    room.firstTeam = teams[0]?.teamNumber ?? null;
    room.lastTeam = teams.at(-1)?.teamNumber ?? null;
    room.partialTeamSeats = room.capacity % event.teamSize;
  }
  res.json(rows);
});

eventsRouter.post('/:id/rooms', async (req, res) => {
  const eventId = Number(req.params.id);
  await assertDraft(eventId);
  const v = roomInput.parse(req.body);
  try {
    const { rows: [room] } = await pool.query(
      'INSERT INTO rooms (event_id, name, capacity, priority) VALUES ($1, $2, $3, $4) RETURNING *',
      [eventId, v.name, v.capacity, v.priority],
    );
    res.status(201).json(room);
  } catch (err: any) {
    if (err.code === '23505') throw badRequest(`Another room already has priority ${v.priority}.`);
    throw err;
  }
});

eventsRouter.patch('/:id/rooms/:roomId', async (req, res) => {
  const eventId = Number(req.params.id);
  await assertDraft(eventId);
  const v = roomInput.parse(req.body);
  try {
    const { rows: [room] } = await pool.query(
      'UPDATE rooms SET name = $3, capacity = $4, priority = $5 WHERE id = $2 AND event_id = $1 RETURNING *',
      [eventId, Number(req.params.roomId), v.name, v.capacity, v.priority],
    );
    if (!room) throw notFound('Room');
    res.json(room);
  } catch (err: any) {
    if (err.code === '23505') throw badRequest(`Another room already has priority ${v.priority}.`);
    throw err;
  }
});

eventsRouter.delete('/:id/rooms/:roomId', async (req, res) => {
  const eventId = Number(req.params.id);
  await assertDraft(eventId);
  await pool.query('DELETE FROM rooms WHERE id = $2 AND event_id = $1', [eventId, Number(req.params.roomId)]);
  res.json({ ok: true });
});
