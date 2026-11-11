/**
 * Check-in rush load test (ARCH-ITEM-4.3), against the local demo only.
 *
 *   npm run demo                     (in another terminal)
 *   npx tsx demo/loadtest.ts [students] [concurrency]
 *
 * Each virtual student looks up a new number and then registers and takes a seat, like a walk-in at the
 * gate. Reports p50/p95 per step, then checks the database: no seat given twice, no student seated twice.
 * Run `npm run demo:reset` afterwards to clear the walk-ins it created.
 */
import pg from 'pg';

const BASE = process.env.LOADTEST_URL || 'http://localhost:4100';
const DB_URL = 'postgres://postgres:demo@localhost:5433/demo';
const students = Number(process.argv[2]) || 100;
const concurrency = Number(process.argv[3]) || 20;

if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('The load test only runs against a local server.');

const answers = { grade: 'class_12', stream: 'maths', lunch: 'veg' };
const timings: Record<string, number[]> = { lookup: [], checkin: [] };
const outcomes: Record<string, number> = {};

async function timed(step: string, path: string, body: unknown, ip: string) {
  const t = performance.now();
  // Each virtual student has its own address, as phones at a venue mostly do (the per-address limits apply).
  const res = await fetch(`${BASE}/api/public/events/hyderabad/demo/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body),
  });
  timings[step].push(performance.now() - t);
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function student(i: number) {
  const phone = String(7000000000 + i);
  const ip = `10.${Math.floor(i / 250)}.${i % 250}.1`;
  await timed('lookup', 'lookup', { phone }, ip);
  const r = await timed('checkin', 'checkin', {
    name: `Load Student ${i}`, phone, parentPhone: String(8000000000 + i), parentName: 'Load Parent',
    schoolCollege: 'Load School', location: 'Madhapur', answers,
  }, ip);
  const key = r.status === 200 ? 'seated' : r.body?.code ?? `HTTP ${r.status}`;
  outcomes[key] = (outcomes[key] ?? 0) + 1;
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]) : 0;
};

const started = performance.now();
let next = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < students) await student(next++);
}));
const seconds = (performance.now() - started) / 1000;

console.log(`\n${students} students, ${concurrency} at a time, ${seconds.toFixed(1)} s (${(students / seconds).toFixed(1)} check-ins/s)`);
for (const [step, xs] of Object.entries(timings)) console.log(`  ${step.padEnd(8)} p50 ${pct(xs, 50)} ms   p95 ${pct(xs, 95)} ms   max ${pct(xs, 100)} ms`);
console.log('  outcomes:', outcomes);

const db = new pg.Client({ connectionString: DB_URL });
await db.connect();
const { rows: [check] } = await db.query(`
  SELECT COUNT(*) FILTER (WHERE ep.seat_id IS NOT NULL)::int AS seated,
         COUNT(DISTINCT ep.seat_id)::int AS distinct_seats,
         (SELECT COUNT(*)::int FROM seats s JOIN events e ON e.id = s.event_id WHERE e.slug = 'demo' AND s.status = 'assigned') AS seats_taken
  FROM event_participants ep JOIN events e ON e.id = ep.event_id WHERE e.slug = 'demo'`);
await db.end();
const ok = check.seated === check.distinct_seats && check.seated === check.seats_taken;
console.log(`  integrity: ${check.seated} seated, ${check.distinct_seats} distinct seats, ${check.seats_taken} seats marked taken → ${ok ? 'OK' : 'MISMATCH'}`);
const p95 = pct(timings.checkin, 95);
console.log(`  target: check-in p95 < 1500 ms → ${p95 < 1500 ? 'met' : 'NOT met'} (${p95} ms)\n`);
process.exit(ok ? 0 : 1);
