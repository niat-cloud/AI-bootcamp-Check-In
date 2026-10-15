import { Router, type Request } from 'express';
import { z } from 'zod';
import { pool, withTransaction, type Db } from '../db/pool.js';
import { planRoomTeams } from '../lib/allocation.js';
import { adminOf, canAccessLocation, eventScope, isSuper, type AdminUser } from '../lib/auth.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { assertSlug, dateSlug, uniqueEventSlug } from '../lib/slug.js';
import { allocateWaiting, createRoom, deleteRoom, moveRoom, updateRoom } from '../services/rooms.js';
import { generateTeamsAndSeats } from '../services/teams.js';

export const eventsRouter = Router();

const EVENT_COLUMNS = `e.id, e.name, e.event_date AS "date", e.event_time AS "time", e.status,
  e.expected_students AS "expectedStudents", e.team_size AS "teamSize", e.seat_labels AS "seatLabels",
  e.team_name_prefix AS "teamNamePrefix", e.active_pool_size AS "activePoolSize",
  e.pool_fill_threshold AS "poolFillThreshold", e.created_at AS "createdAt",
  e.activated_at AS "activatedAt", e.completed_at AS "completedAt",
  e.location_id AS "locationId", e.slug, l.name AS "locationName", l.slug AS "locationSlug",
  CASE WHEN l.slug IS NOT NULL AND e.slug IS NOT NULL THEN '/' || l.slug || '/' || e.slug END AS "publicPath"`;
const EVENT_FROM = 'events e LEFT JOIN locations l ON l.id = e.location_id';

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
  locationId: z.coerce.number().int().positive('Choose the location of this event').nullish(),
  slug: z.string().trim().toLowerCase().max(60).nullish(),
});

function validateLabels(v: { teamSize: number; seatLabels: string[] }) {
  if (v.seatLabels.length !== v.teamSize) {
    throw badRequest(`Seat labels must have exactly ${v.teamSize} entries (one per seat at a table).`);
  }
  if (new Set(v.seatLabels.map((l) => l.toUpperCase())).size !== v.seatLabels.length) {
    throw badRequest('Seat labels must be unique.');
  }
}

export async function loadEvent(id: number, db: Db = pool) {
  const { rows: [event] } = await db.query(`SELECT ${EVENT_COLUMNS} FROM ${EVENT_FROM} WHERE e.id = $1`, [id]);
  if (!event) throw notFound('Event');
  return event;
}

/** The location must exist, be active, and be one this admin manages. */
async function checkLocation(user: AdminUser, locationId: number | null | undefined) {
  if (!locationId) throw badRequest('Choose the location of this event.');
  if (!canAccessLocation(user, locationId)) throw new AppError(403, 'FORBIDDEN', 'You can only create events for your own locations.');
  const { rows: [loc] } = await pool.query('SELECT id FROM locations WHERE id = $1 AND is_active', [locationId]);
  if (!loc) throw badRequest('This location does not exist or has been disabled.');
}

eventsRouter.get('/', async (req, res) => {
  const params: unknown[] = [];
  let where = eventScope(adminOf(req), params, 'e.location_id');
  const locationFilter = Number(req.query.locationId);
  if (Number.isInteger(locationFilter) && locationFilter > 0) {
    params.push(locationFilter);
    where += ` AND e.location_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT ${EVENT_COLUMNS},
       (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.event_id = e.id) AS "participantCount",
       (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.event_id = e.id AND ep.seat_id IS NOT NULL) AS "checkedInCount"
     FROM ${EVENT_FROM} WHERE ${where} ORDER BY e.event_date DESC, e.id DESC`,
    params,
  );
  res.json(rows);
});

/** The event the admin is working on: one of their active events, else their newest draft. */
eventsRouter.get('/current', async (req, res) => {
  const params: unknown[] = [];
  const scope = eventScope(adminOf(req), params, 'e.location_id');
  const { rows: [event] } = await pool.query(
    `SELECT ${EVENT_COLUMNS} FROM ${EVENT_FROM} WHERE e.status IN ('active', 'draft') AND ${scope}
     ORDER BY (e.status = 'active') DESC, e.created_at DESC LIMIT 1`,
    params,
  );
  res.json(event ?? null);
});

eventsRouter.get('/:id', async (req, res) => {
  res.json(await loadEvent(Number(req.params.id)));
});

const slugConflict = (err: unknown) => (err as { code?: string }).code === '23505'
  ? new AppError(409, 'SLUG_TAKEN', 'Another event at this location already uses this link. Choose a different one.')
  : err;

eventsRouter.post('/', async (req, res) => {
  const v = eventInput.parse(req.body);
  validateLabels(v);
  const user = adminOf(req);
  // A location admin with exactly one location doesn't need to choose it.
  const locationId = v.locationId ?? (!isSuper(user) && user.locationIds.length === 1 ? user.locationIds[0] : null);
  await checkLocation(user, locationId);
  const slug = await uniqueEventSlug(pool, locationId!, v.slug ? assertSlug(v.slug, 'The event link') : dateSlug(v.date));
  try {
    const { rows: [{ id }] } = await pool.query(
      `INSERT INTO events (name, event_date, event_time, expected_students, team_size, seat_labels,
         team_name_prefix, active_pool_size, pool_fill_threshold, location_id, slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [v.name, v.date, v.time, v.expectedStudents, v.teamSize, v.seatLabels, v.teamNamePrefix, v.activePoolSize,
        v.poolFillThreshold, locationId, slug],
    );
    res.status(201).json(await loadEvent(id));
  } catch (err) {
    throw slugConflict(err);
  }
});

eventsRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const current = await loadEvent(id);
  if (current.status === 'completed') throw new AppError(409, 'EVENT_LOCKED', 'A completed event cannot be edited.');
  const v = eventInput.parse({ ...current, ...req.body });
  validateLabels(v);
  const user = adminOf(req);

  let locationId = current.locationId as number | null;
  let slug = current.slug as string | null;
  if (current.status === 'active') {
    // Once seating has started, only descriptive fields may change, and the public link is fixed.
    const seatingChanged = v.teamSize !== current.teamSize
      || v.seatLabels.join() !== current.seatLabels.join()
      || v.teamNamePrefix !== current.teamNamePrefix;
    if (seatingChanged) throw new AppError(409, 'EVENT_LOCKED', 'Team size and seat labels cannot change after the event is activated.');
    if ((v.locationId ?? null) !== locationId || (v.slug ?? null) !== slug) {
      throw new AppError(409, 'EVENT_LOCKED', 'The location and public link cannot change while the event is live.');
    }
  } else {
    // Draft: location and link may change. A link the admin never customised follows the date.
    locationId = v.locationId ?? null;
    if (locationId !== current.locationId) await checkLocation(user, locationId);
    const requested = req.body.slug && v.slug !== current.slug ? assertSlug(v.slug!, 'The event link') : null;
    const followsDate = !requested && (!current.slug || current.slug.startsWith(dateSlug(current.date)));
    const base = requested ?? (followsDate ? dateSlug(v.date) : current.slug);
    if (locationId) slug = await uniqueEventSlug(pool, locationId, base, id);
  }

  try {
    await pool.query(
      `UPDATE events SET name = $2, event_date = $3, event_time = $4, expected_students = $5, team_size = $6,
         seat_labels = $7, team_name_prefix = $8, active_pool_size = $9, pool_fill_threshold = $10,
         location_id = $11, slug = $12
       WHERE id = $1`,
      [id, v.name, v.date, v.time, v.expectedStudents, v.teamSize, v.seatLabels, v.teamNamePrefix, v.activePoolSize,
        v.poolFillThreshold, locationId, slug],
    );
  } catch (err) {
    throw slugConflict(err);
  }
  res.json(await loadEvent(id));
});

eventsRouter.delete('/:id', async (req, res) => {
  const event = await loadEvent(Number(req.params.id));
  if (event.status !== 'draft') throw new AppError(409, 'EVENT_LOCKED', 'Only draft events can be deleted.');
  await pool.query('DELETE FROM events WHERE id = $1', [event.id]);
  res.json({ ok: true });
});

/** Opens check-in. Several events (other locations, or the same one) may be live at the same time. */
eventsRouter.post('/:id/activate', async (req, res) => {
  const id = Number(req.params.id);
  const result = await withTransaction(async (client) => {
    const { rows: [event] } = await client.query('SELECT status, location_id, slug FROM events WHERE id = $1 FOR UPDATE', [id]);
    if (!event) throw notFound('Event');
    if (event.status !== 'draft') throw new AppError(409, 'BAD_STATUS', `Event is already ${event.status}.`);
    if (!event.location_id || !event.slug) throw badRequest('Choose the location of this event before activating it.');
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
// Rooms stay editable while the event runs; tables and seats follow the approved capacity.

const roomInput = z.object({
  name: z.string().trim().min(1, 'Room name is required'),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1'),
  priority: z.coerce.number().int().min(1).optional(),
  teamSize: z.coerce.number().int().min(2).max(8).nullish(),
  isActive: z.boolean().optional(),
  confirmReduction: z.boolean().optional(),
});

const actorOf = (req: Request) => adminOf(req).email;

eventsRouter.get('/:id/rooms', async (req, res) => {
  const eventId = Number(req.params.id);
  const event = await loadEvent(eventId);
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.capacity, r.priority, r.team_size AS "teamSizeOverride", r.is_active AS "isActive",
       COALESCE(r.team_size, $2) AS "teamSize",
       (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.room_id = r.id) AS used,
       (SELECT COUNT(*)::int FROM teams t WHERE t.room_id = r.id) AS "teamCount"
     FROM rooms r WHERE r.event_id = $1 ORDER BY r.priority`,
    [eventId, event.teamSize],
  );
  // Preview of tables per room (before activation, teamCount is still 0). Numbering is room-local.
  for (const room of rows) {
    const teams = planRoomTeams(room.capacity, room.teamSize);
    room.plannedTeams = teams.length;
    room.firstTeam = teams[0]?.teamNumber ?? null;
    room.lastTeam = teams.at(-1)?.teamNumber ?? null;
    room.partialTeamSeats = room.capacity % room.teamSize;
  }
  res.json(rows);
});

eventsRouter.post('/:id/rooms', async (req, res) => {
  const v = roomInput.parse(req.body);
  res.status(201).json(await createRoom(Number(req.params.id), v, actorOf(req)));
});

eventsRouter.patch('/:id/rooms/:roomId', async (req, res) => {
  const v = roomInput.parse(req.body);
  res.json(await updateRoom(Number(req.params.id), Number(req.params.roomId), v, actorOf(req)));
});

eventsRouter.post('/:id/rooms/:roomId/move', async (req, res) => {
  const { direction } = z.object({ direction: z.enum(['up', 'down']) }).parse(req.body);
  res.json(await moveRoom(Number(req.params.id), Number(req.params.roomId), direction, actorOf(req)));
});

eventsRouter.delete('/:id/rooms/:roomId', async (req, res) => {
  res.json(await deleteRoom(Number(req.params.id), Number(req.params.roomId), actorOf(req)));
});

/** Seat students on the waiting list into free approved seats (rooms in priority order). */
eventsRouter.post('/:id/allocate', async (req, res) => {
  res.json(await allocateWaiting(Number(req.params.id), actorOf(req)));
});
