/**
 * Integration test against a real Postgres. Runs inside a throwaway schema and drops it afterwards.
 * Skipped when DATABASE_URL is not set.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.DATABASE_URL;
const schema = `test_${Date.now()}`;
const ssl = process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : undefined;

describe.skipIf(!url)('seat assignment (database)', () => {
  let request: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>;
  let server: import('node:http').Server;
  let poolModule: typeof import('../src/db/pool.js');

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: url, ssl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    process.env.DATABASE_SCHEMA = schema;

    poolModule = await import('../src/db/pool.js');
    const { migrate } = await import('../src/db/migrate.js');
    await migrate();
    const { createApp } = await import('../src/app.js');
    server = createApp().listen(0);
    const port = (server.address() as import('node:net').AddressInfo).port;
    request = async (method, path, body) => {
      const res = await fetch(`http://localhost:${port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    };
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await poolModule?.pool.end();
    const admin = new pg.Client({ connectionString: url, ssl });
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });

  async function createEvent(name: string) {
    const { body: event } = await request('POST', '/events', {
      name, date: '2026-10-04', time: '10:00', expectedStudents: 100, teamSize: 3,
      seatLabels: ['A', 'B', 'C'], teamNamePrefix: 'Team', activePoolSize: 5, poolFillThreshold: 0.6,
    });
    for (const [i, cap] of [100, 50, 50].entries()) {
      await request('POST', `/events/${event.id}/rooms`, { name: `Room ${i + 1}`, capacity: cap, priority: i + 1 });
    }
    return event;
  }

  it('runs the full spec scenario', async () => {
    const event = await createEvent('Sunday Event 1');
    const rows = Array.from({ length: 100 }, (_, i) => ({
      rowNumber: i + 2, name: `Student ${i + 1}`, phone: String(9000000000 + i), schoolCollege: 'ABC College',
    }));
    rows.push({ rowNumber: 200, name: '', phone: '9111111111', schoolCollege: 'X' });
    rows.push({ rowNumber: 201, name: 'Dup', phone: '9000000000', schoolCollege: 'X' });
    const imp = await request('POST', `/events/${event.id}/import`, { rows });
    expect(imp.body.imported).toBe(100);
    expect(imp.body.rejected.map((r: any) => r.reason)).toEqual(['Missing name', expect.stringContaining('Duplicate')]);

    // Not active yet → no seats.
    const early = await request('GET', '/checkin/search?q=Student');
    expect(early.status).toBe(409);

    const act = await request('POST', `/events/${event.id}/activate`);
    expect(act.status).toBe(200);
    expect(act.body.teamsCreated).toBe(34 + 17 + 17);

    // Search by phone and by name, masked.
    const byPhone = await request('GET', '/checkin/search?q=9000000005');
    expect(byPhone.body).toHaveLength(1);
    expect(byPhone.body[0].phone).toBe('••••••0005');

    const { rows: eps } = await poolModule.pool.query(
      'SELECT id FROM event_participants WHERE event_id = $1 ORDER BY id', [event.id]);

    // Idempotent under concurrent repeats.
    const repeats = await Promise.all(Array.from({ length: 5 }, () =>
      request('POST', '/checkin/assign', { eventParticipantId: eps[0].id })));
    const codes = new Set(repeats.map((r) => r.body.seatCode));
    expect(codes.size).toBe(1);
    expect(repeats.filter((r) => !r.body.alreadyAssigned)).toHaveLength(1);

    // First 5 arrivals land in teams 1–5.
    const first: number[] = [repeats[0].body.teamNumber];
    for (const ep of eps.slice(1, 5)) {
      first.push((await request('POST', '/checkin/assign', { eventParticipantId: ep.id })).body.teamNumber);
    }
    expect(new Set(first)).toEqual(new Set([1, 2, 3, 4, 5]));

    for (const ep of eps.slice(5)) {
      const r = await request('POST', '/checkin/assign', { eventParticipantId: ep.id });
      expect(r.body.room).toBe('Room 1');
    }

    // Team 34 is a single-seat table.
    const { rows: [t34] } = await poolModule.pool.query(
      `SELECT COUNT(*)::int AS seats FROM seats s JOIN teams t ON t.id = s.team_id WHERE t.event_id = $1 AND t.team_number = 34`, [event.id]);
    expect(t34.seats).toBe(1);

    // Walk-ins go to Room 2 once Room 1 is full.
    const walk = await request('POST', '/checkin/walk-in', {
      name: 'Arjun Kumar', phone: '9876543210', parentPhone: '9123456780', schoolCollege: 'ABC Junior College',
    });
    expect(walk.status).toBe(201);
    expect(walk.body.room).toBe('Room 2');
    expect(walk.body.teamNumber).toBeGreaterThanOrEqual(35);
    expect(walk.body.participant.registrationType).toBe('walk_in');

    const dupWalk = await request('POST', '/checkin/walk-in', {
      name: 'Arjun Kumar', phone: '9876543210', parentPhone: '9123456780', schoolCollege: 'ABC Junior College',
    });
    expect(dupWalk.body.code).toBe('ALREADY_REGISTERED');

    // Fill the remaining 99 seats, then the venue is full.
    for (let i = 0; i < 99; i++) {
      const r = await request('POST', '/checkin/walk-in', {
        name: `Walk ${i}`, phone: String(8000000000 + i), parentPhone: '9123456780', schoolCollege: 'XYZ',
      });
      expect(r.status).toBe(201);
    }
    const full = await request('POST', '/checkin/walk-in', {
      name: 'Too Late', phone: '7000000000', parentPhone: '9123456780', schoolCollege: 'XYZ',
    });
    expect(full.body.code).toBe('VENUE_FULL');

    const dash = await request('GET', `/events/${event.id}/dashboard`);
    expect(dash.body.stats).toMatchObject({ expected: 100, existing: 100, walkIns: 100, actual: 200, checkedIn: 200 });
    expect(dash.body.rooms.map((r: any) => r.used)).toEqual([100, 50, 50]);

    const { rows: [dupes] } = await poolModule.pool.query(
      `SELECT COUNT(*)::int AS n FROM (SELECT seat_id FROM event_participants WHERE seat_id IS NOT NULL GROUP BY seat_id HAVING COUNT(*) > 1) x`);
    expect(dupes.n).toBe(0);

    const exp = await request('GET', `/events/${event.id}/participants?q=17B`);
    expect(exp.body.rows).toHaveLength(1);

    // Complete → no more assignments.
    await request('POST', `/events/${event.id}/complete`);
    const after = await request('POST', '/checkin/assign', { eventParticipantId: eps[1].id });
    expect(after.status).toBe(409);

    // A new event reuses people but starts with fresh seating.
    const next = await createEvent('Sunday Event 2');
    const copy = await request('POST', `/events/${next.id}/copy-from/${event.id}`);
    expect(copy.body.imported).toBe(200);
    await request('POST', `/events/${next.id}/activate`);
    const nextDash = await request('GET', `/events/${next.id}/dashboard`);
    expect(nextDash.body.stats.checkedIn).toBe(0);
    const again = await request('GET', '/checkin/search?q=Student 1');
    expect(again.body.every((r: any) => r.seatCode === null)).toBe(true);
  }, 1_800_000);
});
