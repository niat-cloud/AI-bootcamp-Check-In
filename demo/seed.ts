/**
 * Fills the LOCAL demo database with one active demo event: 2 rooms with project submission open,
 * the 100 people from participants-100.xlsx registered, and nobody checked in or seated yet, so testing
 * starts from the beginning of the day. Raise CHECKED_IN to pre-seat people through the real seating code.
 */
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { pool, withTransaction } from '../server/src/db/pool.js';
import { migrate } from '../server/src/db/migrate.js';
import { normalizePhone } from '../server/src/lib/phone.js';
import { generateTeamsAndSeats } from '../server/src/services/teams.js';
import { assignSeatTx } from '../server/src/services/seating.js';

const CHECKED_IN = 0;

export async function seedDemo(sheetPath: string) {
  try {
    await seedEvent(sheetPath);
  } finally {
    await pool.end();
  }
}

async function seedEvent(sheetPath: string) {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`Refusing to seed demo data into ${url.hostname}: the demo only runs against the local database.`);
  }

  await migrate();

  const book = XLSX.read(readFileSync(sheetPath));
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]]);
  const people = new Map<string, { name: string; phone: string; school: string; className: string | null; parentPhone: string | null }>();
  for (const r of rows) {
    const phone = normalizePhone(String(r['Phone Number'] ?? ''));
    const name = String(r.Name ?? '').trim();
    if (!phone || !name || people.has(phone)) continue;
    people.set(phone, {
      name, phone,
      school: String(r['School/College'] ?? '').trim(),
      className: r.Class ? String(r.Class) : null,
      parentPhone: normalizePhone(String(r['Parent Phone'] ?? '')),
    });
  }
  const list = [...people.values()];

  const today = new Date().toISOString().slice(0, 10);
  const result = await withTransaction(async (client) => {
    const { rows: [loc] } = await client.query(`SELECT id, slug FROM locations ORDER BY id LIMIT 1`);
    await client.query(`DELETE FROM events WHERE location_id = $1 AND slug = 'demo'`, [loc.id]);

    const { rows: [event] } = await client.query(
      `INSERT INTO events (name, event_date, event_time, expected_students, team_size, seat_labels, team_name_prefix,
         active_pool_size, pool_fill_threshold, location_id, slug, status, activated_at)
       VALUES ('Demo Bootcamp (local)', $1, '10:00', $2, 3, ARRAY['A','B','C'], 'Team', 3, 0.6, $3, 'demo', 'active', now())
       RETURNING id, slug`,
      [today, list.length, loc.id],
    );
    for (const [i, name] of ['Room 1', 'Room 2'].entries()) {
      await client.query(
        `INSERT INTO rooms (event_id, name, capacity, priority, is_active, projects_status, projects_deadline)
         VALUES ($1, $2, 60, $3, true, 'open', now() + interval '3 hours')`,
        [event.id, name, i + 1],
      );
    }
    await generateTeamsAndSeats(client, event.id);

    const { rows: [batch] } = await client.query(
      `INSERT INTO import_batches (event_id, kind, label, row_count, added_count, created_by)
       VALUES ($1, 'file', 'participants-100.xlsx', $2, $3, $4) RETURNING id`,
      [event.id, rows.length, list.length, 'demo-seed'],
    );
    const { rows: inserted } = await client.query(
      `INSERT INTO participants (name, phone, school_college, class, parent_phone, location)
       SELECT n, p, s, c, pp, 'Hyderabad' FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) AS u (n, p, s, c, pp)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, phone`,
      [list.map((p) => p.name), list.map((p) => p.phone), list.map((p) => p.school), list.map((p) => p.className), list.map((p) => p.parentPhone)],
    );
    const idByPhone = new Map(inserted.map((p) => [p.phone, p.id]));
    const { rows: regs } = await client.query(
      `INSERT INTO event_participants (event_id, participant_id, registration_type, import_batch_id)
       SELECT $1, unnest($2::int[]), 'existing', $3 RETURNING id`,
      [event.id, list.map((p) => idByPhone.get(p.phone)), batch.id],
    );
    for (const reg of regs.slice(0, CHECKED_IN)) await assignSeatTx(client, reg.id);
    return { slug: event.slug, location: loc.slug };
  });

  console.log(`Demo event ready: ${list.length} people registered, ${CHECKED_IN} checked in, 2 rooms with project submission open.`);
  console.log(`  Check-in page:  http://localhost:${process.env.CLIENT_PORT}/${result.location}/${result.slug}`);
  console.log(`  Project submit: http://localhost:${process.env.CLIENT_PORT}/${result.location}/${result.slug}/project`);
  console.log(`  Admin:          http://localhost:${process.env.CLIENT_PORT}/admin`);
}
