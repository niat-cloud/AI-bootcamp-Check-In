import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
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
});
const importInput = z.object({ rows: z.array(rowInput).max(20000) });

const clean = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim().replace(/\s+/g, ' '));

importRouter.post('/import', async (req, res) => {
  const eventId = Number((req.params as Record<string, string>).id);
  const event = await loadEvent(eventId);
  if (event.status === 'completed') throw new AppError(409, 'EVENT_LOCKED', 'Cannot import into a completed event.');
  const { rows } = importInput.parse(req.body);

  const rejected: { rowNumber: number; name: string; phone: string; reason: string }[] = [];
  const accepted = new Map<string, { name: string; phone: string; school: string; className: string | null; parentPhone: string | null }>();

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
    });
  }

  const list = [...accepted.values()];
  const summary = await withTransaction(async (client) => {
    if (list.length === 0) return { imported: 0, alreadyRegistered: 0, newPeople: 0, returningPeople: 0 };
    const { rows: people } = await client.query(
      `INSERT INTO participants (name, phone, school_college, class, parent_phone)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
       ON CONFLICT (phone) DO UPDATE SET
         name = EXCLUDED.name,
         school_college = COALESCE(NULLIF(EXCLUDED.school_college, ''), participants.school_college),
         class = COALESCE(EXCLUDED.class, participants.class),
         parent_phone = COALESCE(EXCLUDED.parent_phone, participants.parent_phone),
         updated_at = now()
       RETURNING id, (xmax = 0) AS inserted`,
      [list.map((p) => p.name), list.map((p) => p.phone), list.map((p) => p.school), list.map((p) => p.className), list.map((p) => p.parentPhone)],
    );
    const { rowCount } = await client.query(
      `INSERT INTO event_participants (event_id, participant_id, registration_type)
       SELECT $1, unnest($2::int[]), 'existing'
       ON CONFLICT (event_id, participant_id) DO NOTHING`,
      [eventId, people.map((p) => p.id)],
    );
    const newPeople = people.filter((p) => p.inserted).length;
    return {
      imported: rowCount ?? 0,
      alreadyRegistered: list.length - (rowCount ?? 0),
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
  await loadEvent(sourceId);
  const { rowCount } = await pool.query(
    `INSERT INTO event_participants (event_id, participant_id, registration_type)
     SELECT $1, participant_id, 'existing' FROM event_participants WHERE event_id = $2
     ON CONFLICT (event_id, participant_id) DO NOTHING`,
    [eventId, sourceId],
  );
  res.json({ imported: rowCount ?? 0 });
});
