import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { adminOf, canAccessLocation } from '../lib/auth.js';
import { AppError, badRequest } from '../lib/errors.js';
import { normalizePhone } from '../lib/phone.js';
import { loadEvent } from './events.js';

export const importRouter = Router({ mergeParams: true });

const rowInput = z.object({
  rowNumber: z.number().int(),
  name: z.string().nullish(),
  phone: z.union([z.string(), z.number()]).nullish(),
  schoolCollege: z.string().nullish(),
  className: z.union([z.string(), z.number()]).nullish(),
  parentPhone: z.union([z.string(), z.number()]).nullish(),
  location: z.string().nullish(),
  source: z.string().nullish(),
});
const importInput = z.object({ rows: z.array(rowInput).max(20000) });

const clean = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim().replace(/\s+/g, ' '));

importRouter.post('/import', async (req, res) => {
  const eventId = Number((req.params as Record<string, string>).id);
  const event = await loadEvent(eventId);
  if (event.status === 'completed') throw new AppError(409, 'EVENT_LOCKED', 'Cannot import into a completed event.');
  const { rows } = importInput.parse(req.body);

  const rejected: { rowNumber: number; name: string; phone: string; reason: string }[] = [];
  const accepted = new Map<string, {
    name: string; phone: string; school: string; className: string | null; parentPhone: string | null; location: string | null; source: string | null;
  }>();

  for (const r of rows) {
    const name = clean(r.name);
    const rawPhone = clean(r.phone);
    const school = clean(r.schoolCollege);
    if (!name && !rawPhone && !school) {
      rejected.push({ rowNumber: r.rowNumber, name, phone: rawPhone, reason: 'Empty row' });
      continue;
    }
    if (!name) {
      rejected.push({ rowNumber: r.rowNumber, name, phone: rawPhone, reason: 'Missing name' });
      continue;
    }
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      rejected.push({ rowNumber: r.rowNumber, name, phone: rawPhone, reason: rawPhone ? 'Invalid phone number' : 'Missing phone number' });
      continue;
    }
    if (accepted.has(phone)) {
      rejected.push({ rowNumber: r.rowNumber, name, phone: rawPhone, reason: `Duplicate phone in file (same as ${accepted.get(phone)!.name})` });
      continue;
    }
    accepted.set(phone, {
      name,
      phone,
      school,
      className: clean(r.className) || null,
      parentPhone: normalizePhone(r.parentPhone) ?? (clean(r.parentPhone) || null),
      location: clean(r.location) || null,
      source: clean(r.source) || null,
    });
  }

  const list = [...accepted.values()];
  const summary = await withTransaction(async (client) => {
    if (list.length === 0) return { imported: 0, alreadyRegistered: 0, newPeople: 0, returningPeople: 0 };
    const { rows: people } = await client.query(
      `INSERT INTO participants (name, phone, school_college, class, parent_phone, location)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
       ON CONFLICT (phone) DO UPDATE SET
         name = EXCLUDED.name,
         school_college = COALESCE(NULLIF(EXCLUDED.school_college, ''), participants.school_college),
         class = COALESCE(EXCLUDED.class, participants.class),
         parent_phone = COALESCE(EXCLUDED.parent_phone, participants.parent_phone),
         location = COALESCE(EXCLUDED.location, participants.location),
         updated_at = now()
       RETURNING id, phone, (xmax = 0) AS inserted`,
      [list.map((p) => p.name), list.map((p) => p.phone), list.map((p) => p.school), list.map((p) => p.className),
        list.map((p) => p.parentPhone), list.map((p) => p.location)],
    );
    // RETURNING order isn't guaranteed, so match each person's source by phone.
    // A re-import fills in or corrects the source of people already registered for this event.
    const { rows: registrations } = await client.query(
      `INSERT INTO event_participants (event_id, participant_id, registration_type, source)
       SELECT $1, u.participant_id, 'existing', u.source FROM unnest($2::int[], $3::text[]) AS u (participant_id, source)
       ON CONFLICT (event_id, participant_id) DO UPDATE SET source = COALESCE(EXCLUDED.source, event_participants.source)
       RETURNING (xmax = 0) AS inserted`,
      [eventId, people.map((p) => p.id), people.map((p) => accepted.get(p.phone)!.source)],
    );
    const imported = registrations.filter((r) => r.inserted).length;
    const newPeople = people.filter((p) => p.inserted).length;
    return {
      imported,
      alreadyRegistered: list.length - imported,
      newPeople,
      returningPeople: people.length - newPeople,
    };
  });

  res.json({ totalRows: rows.length, valid: list.length, ...summary, rejected });
});

importRouter.post('/copy-from/:sourceId', async (req, res) => {
  const eventId = Number((req.params as Record<string, string>).id);
  const sourceId = Number(req.params.sourceId);
  const event = await loadEvent(eventId);
  if (event.status === 'completed') throw new AppError(409, 'EVENT_LOCKED', 'Cannot import into a completed event.');
  if (sourceId === eventId) throw badRequest('Choose a different event to copy from.');
  const source = await loadEvent(sourceId);
  // The source must also belong to one of this admin's locations.
  if (!canAccessLocation(adminOf(req), source.locationId)) throw new AppError(404, 'NOT_FOUND', 'Event not found');
  const { rowCount } = await pool.query(
    `INSERT INTO event_participants (event_id, participant_id, registration_type, source)
     SELECT $1, participant_id, 'existing', source FROM event_participants WHERE event_id = $2
     ON CONFLICT (event_id, participant_id) DO NOTHING`,
    [eventId, sourceId],
  );
  res.json({ imported: rowCount ?? 0 });
});
