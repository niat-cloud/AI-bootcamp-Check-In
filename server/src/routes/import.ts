import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { adminOf, canAccessLocation } from '../lib/auth.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { normalizePhone } from '../lib/phone.js';
import { removeRegistrations } from '../services/participants.js';
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
const importInput = z.object({ rows: z.array(rowInput).max(20000), fileName: z.string().trim().max(200).optional() });

const clean = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim().replace(/\s+/g, ' '));

importRouter.post('/import', async (req, res) => {
  const eventId = Number((req.params as Record<string, string>).id);
  const event = await loadEvent(eventId);
  if (event.status === 'completed') throw new AppError(409, 'EVENT_LOCKED', 'Cannot import into a completed event.');
  const { rows, fileName } = importInput.parse(req.body);

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
    const { rows: [batch] } = await client.query(
      `INSERT INTO import_batches (event_id, kind, label, row_count, created_by) VALUES ($1, 'file', $2, $3, $4) RETURNING id`,
      [eventId, fileName || 'Uploaded file', rows.length, adminOf(req).email],
    );
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
      `INSERT INTO event_participants (event_id, participant_id, registration_type, source, import_batch_id)
       SELECT $1, u.participant_id, 'existing', u.source, $4 FROM unnest($2::int[], $3::text[]) AS u (participant_id, source)
       ON CONFLICT (event_id, participant_id) DO UPDATE SET source = COALESCE(EXCLUDED.source, event_participants.source)
       RETURNING (xmax = 0) AS inserted`,
      [eventId, people.map((p) => p.id), people.map((p) => accepted.get(p.phone)!.source), batch.id],
    );
    const imported = registrations.filter((r) => r.inserted).length;
    await client.query('UPDATE import_batches SET added_count = $2 WHERE id = $1', [batch.id, imported]);
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
  const imported = await withTransaction(async (client) => {
    const { rows: [batch] } = await client.query(
      `INSERT INTO import_batches (event_id, kind, label, created_by) VALUES ($1, 'copy', $2, $3) RETURNING id`,
      [eventId, `Copied from ${source.name} (${source.date})`, adminOf(req).email],
    );
    const { rowCount } = await client.query(
      `INSERT INTO event_participants (event_id, participant_id, registration_type, source, import_batch_id)
       SELECT $1, participant_id, 'existing', source, $3 FROM event_participants WHERE event_id = $2
       ON CONFLICT (event_id, participant_id) DO NOTHING`,
      [eventId, sourceId, batch.id],
    );
    await client.query('UPDATE import_batches SET added_count = $2, row_count = $2 WHERE id = $1', [batch.id, rowCount ?? 0]);
    return rowCount ?? 0;
  });
  res.json({ imported });
});

/**
 * Past imports of this event, newest first, with how many of their people are still registered and how
 * many of those have arrived. Registrations imported before imports were recorded appear as one
 * "earlier imports" entry (id null).
 */
importRouter.get('/imports', async (req, res) => {
  const eventId = Number((req.params as Record<string, string>).id);
  const { rows: batches } = await pool.query(
    `SELECT b.id, b.kind, b.label, b.row_count AS "rowCount", b.added_count AS "addedCount", b.created_by AS "createdBy",
       b.created_at AS "createdAt", b.removed_at AS "removedAt", b.removed_by AS "removedBy",
       COUNT(ep.id)::int AS remaining,
       COUNT(ep.id) FILTER (WHERE ep.seat_id IS NOT NULL OR ep.status <> 'registered')::int AS arrived
     FROM import_batches b LEFT JOIN event_participants ep ON ep.import_batch_id = b.id
     WHERE b.event_id = $1 GROUP BY b.id ORDER BY b.created_at DESC`,
    [eventId],
  );
  const { rows: [earlier] } = await pool.query(
    `SELECT COUNT(*)::int AS remaining,
       COUNT(*) FILTER (WHERE seat_id IS NOT NULL OR status <> 'registered')::int AS arrived
     FROM event_participants WHERE event_id = $1 AND registration_type = 'existing' AND import_batch_id IS NULL`,
    [eventId],
  );
  res.json({ batches, earlier });
});

/**
 * Removes everyone an import added who hasn't arrived yet ("earlier" for registrations imported before
 * imports were recorded). People from the import who already arrived are kept and counted in `kept`;
 * remove them one by one on the Participants page if they shouldn't be there either.
 */
importRouter.post('/imports/:batchId/remove', async (req, res) => {
  const eventId = Number((req.params as Record<string, string>).id);
  const raw = String(req.params.batchId);
  const actor = adminOf(req).email;
  if (raw === 'earlier') {
    return res.json(await removeRegistrations(eventId,
      `ep.event_id = $1 AND ep.registration_type = 'existing' AND ep.import_batch_id IS NULL`, [eventId],
      { includeArrived: false, actor, reason: 'earlier imports' }));
  }
  const batchId = Number(raw);
  const { rows: [batch] } = await pool.query('SELECT id, label FROM import_batches WHERE id = $1 AND event_id = $2', [batchId, eventId]);
  if (!batch) throw notFound('Import');
  const result = await removeRegistrations(eventId, 'ep.event_id = $1 AND ep.import_batch_id = $2', [eventId, batchId],
    { includeArrived: false, actor, reason: 'import', details: { importId: batchId, importLabel: batch.label } });
  await pool.query('UPDATE import_batches SET removed_at = now(), removed_by = $2 WHERE id = $1', [batchId, actor]);
  res.json(result);
});
