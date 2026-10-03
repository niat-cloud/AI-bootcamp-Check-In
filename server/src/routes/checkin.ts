import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { maskPhone, normalizePhone } from '../lib/phone.js';
import { assignSeatTx, getAssignment } from '../services/seating.js';

/** Kiosk endpoints. Only ever exposes the active event, a handful of matches, and masked phones. */
export const checkinRouter = Router();

async function activeEvent() {
  const { rows: [event] } = await pool.query(
    `SELECT id, name, event_date AS "date", event_time AS "time", status FROM events
     WHERE status = 'active' LIMIT 1`,
  );
  return event ?? null;
}

async function requireActiveEvent() {
  const event = await activeEvent();
  if (!event) throw new AppError(409, 'NO_ACTIVE_EVENT', 'Check-in is not open. No event is currently active.');
  return event;
}

checkinRouter.get('/status', async (_req, res) => {
  const event = await activeEvent();
  if (!event) {
    const { rows: [last] } = await pool.query(
      `SELECT name, status FROM events ORDER BY created_at DESC LIMIT 1`,
    );
    return res.json({ event: null, lastEvent: last ?? null });
  }
  res.json({ event });
});

checkinRouter.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 60);
  if (q.length < 2) return res.json([]);
  const digits = q.replace(/[\s-]/g, '');
  let where: string;
  let params: unknown[];
  if (/^\+?\d{3,}$/.test(digits)) {
    const d = digits.replace(/^\+?91(?=\d{10}$)/, '');
    where = 'p.phone LIKE $1';
    params = [`%${d}%`];
  } else {
    // Every word must appear in the name (so "sai kum" finds "Sai Kumar").
    const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
    where = words.map((_, i) => `lower(p.name) LIKE $${i + 1}`).join(' AND ');
    params = words.map((w) => `%${w.replace(/[%_\\]/g, '\\$&')}%`);
  }

  const { rows } = await pool.query(
    `SELECT ep.id, p.name, p.school_college, p.class, p.phone, p.location, ep.registration_type,
            t.team_number, ep.seat_label
     FROM event_participants ep
     JOIN participants p ON p.id = ep.participant_id
     LEFT JOIN teams t ON t.id = ep.team_id
     WHERE ep.event_id = (SELECT id FROM events WHERE status = 'active') AND ${where}
     ORDER BY (lower(p.name) LIKE lower($${params.length + 1})) DESC, p.name
     LIMIT 15`,
    [...params, `${q}%`],
  );
  if (rows.length === 0) await requireActiveEvent(); // "no matches" vs. "check-in closed"
  res.json(rows.map((r) => ({
    eventParticipantId: r.id,
    name: r.name,
    schoolCollege: r.school_college,
    className: r.class,
    location: r.location ?? null,
    phone: maskPhone(r.phone),
    registrationType: r.registration_type,
    seatCode: r.team_number ? `${r.team_number}${r.seat_label}` : null,
  })));
});

checkinRouter.get('/participant/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows: [ep] } = await pool.query(
    `SELECT ep.seat_id FROM event_participants ep
     JOIN events e ON e.id = ep.event_id AND e.status = 'active' WHERE ep.id = $1`,
    [id],
  );
  if (!ep) throw new AppError(404, 'NOT_FOUND', 'Student not found in the current event.');
  res.json(await getAssignment(pool, id, Boolean(ep.seat_id)));
});

checkinRouter.post('/assign', async (req, res) => {
  const { eventParticipantId } = z.object({ eventParticipantId: z.coerce.number().int() }).parse(req.body);
  // assignSeatTx only assigns when the participant's event is active (and only one event can be active).
  res.json(await withTransaction((client) => assignSeatTx(client, eventParticipantId)));
});

const walkInInput = z.object({
  name: z.string().trim().min(2, 'Full name is required'),
  phone: z.string().trim().min(1, 'Phone number is required'),
  parentPhone: z.string().trim().min(1, 'Parent phone number is required'),
  schoolCollege: z.string().trim().min(2, 'School/College is required'),
  className: z.string().trim().optional(),
  location: z.string().trim().min(2, "The location you're coming from is required"),
});

checkinRouter.post('/walk-in', async (req, res) => {
  const v = walkInInput.parse(req.body);
  const phone = normalizePhone(v.phone);
  const parentPhone = normalizePhone(v.parentPhone);
  if (!phone) throw new AppError(400, 'INVALID_PHONE', 'Enter a valid 10-digit phone number.');
  if (!parentPhone) throw new AppError(400, 'INVALID_PHONE', 'Enter a valid 10-digit parent phone number.');
  const name = v.name.replace(/\s+/g, ' ');

  // One query: the active event, plus whoever already uses this phone number in it.
  const { rows: [check] } = await pool.query(
    `SELECT e.id AS event_id, p.name AS existing_name, ep.id AS ep_id
     FROM events e
     LEFT JOIN participants p ON p.phone = $1
     LEFT JOIN event_participants ep ON ep.participant_id = p.id AND ep.event_id = e.id
     WHERE e.status = 'active'`,
    [phone],
  );
  if (!check) await requireActiveEvent();
  if (check.ep_id) {
    throw new AppError(409, 'ALREADY_REGISTERED',
      `This phone number is already registered for this event (${check.existing_name}). Search for ${maskPhone(phone)} instead.`);
  }

  const result = await withTransaction(async (client) => {
    // Create the person (or refresh a returning one) and register them as a walk-in, in one statement.
    const { rows: [ep] } = await client.query(
      `WITH person AS (
         INSERT INTO participants (name, phone, parent_phone, school_college, class, location)
         VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6)
         ON CONFLICT (phone) DO UPDATE SET
           name = EXCLUDED.name, parent_phone = EXCLUDED.parent_phone, school_college = EXCLUDED.school_college,
           class = COALESCE(EXCLUDED.class, participants.class),
           location = COALESCE(EXCLUDED.location, participants.location),
           updated_at = now()
         RETURNING id)
       INSERT INTO event_participants (event_id, participant_id, registration_type)
       SELECT $7, id, 'walk_in' FROM person RETURNING id`,
      [name, phone, parentPhone, v.schoolCollege, v.className ?? '', v.location, check.event_id],
    );
    return assignSeatTx(client, ep.id, { expectedEventId: check.event_id });
  });
  res.status(201).json(result);
});
