/**
 * The backend hardening items (TODO_backend-architect.md) against a real Postgres, in a throwaway schema.
 * Skipped when DATABASE_URL is not set.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.DATABASE_URL;
const schema = `test_hard_${Date.now()}`;
const ssl = process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : undefined;

describe.skipIf(!url)('backend hardening (database)', () => {
  type Res = { status: number; body: any; headers: Headers };
  let call: (token: string | null, method: string, path: string, body?: unknown, raw?: string) => Promise<Res>;
  let server: import('node:http').Server;
  let poolModule: typeof import('../src/db/pool.js');
  let db: (sql: string, params?: unknown[]) => Promise<any[]>;
  let token: string;
  let email: string;
  const password = 'Hardening2026';

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: url, ssl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    process.env.DATABASE_SCHEMA = schema;
    process.env.LOG_REQUESTS = 'false';

    poolModule = await import('../src/db/pool.js');
    db = async (sql, params) => (await poolModule.pool.query(sql, params)).rows;
    const { migrate } = await import('../src/db/migrate.js');
    await migrate();
    const { createApp } = await import('../src/app.js');
    const { superAdminSeed } = await import('../src/lib/auth.js');
    server = createApp().listen(0);
    const port = (server.address() as import('node:net').AddressInfo).port;
    call = async (tok, method, path, body, raw) => {
      const res = await fetch(`http://localhost:${port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: raw ?? (body ? JSON.stringify(body) : undefined),
      });
      return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
    };

    const seed = superAdminSeed();
    email = seed.email;
    const login = await call(null, 'POST', '/admin/auth/login', { email, password: seed.password });
    expect(login.status).toBe(200);
    token = login.body.token;
    if (login.body.user.mustChangePassword) {
      const changed = await call(token, 'POST', '/admin/auth/change-password', { currentPassword: seed.password, newPassword: password });
      expect(changed.status).toBe(200);
      token = changed.body.token;
    } else {
      // Bring the password to a known value for the sign-in checks below.
      const changed = await call(token, 'POST', '/admin/auth/change-password', { currentPassword: seed.password, newPassword: password });
      expect(changed.status).toBe(200);
      token = changed.body.token;
    }
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await poolModule?.pool.end();
    const admin = new pg.Client({ connectionString: url, ssl });
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });

  it('health reports the database and the latest migration (ARCH-ITEM-1.2)', async () => {
    const res = await call(null, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, db: 'up' });
    expect(res.body.migration).toMatch(/^\d{3}_.*\.sql$/);
  });

  it('sends security headers and a request id, and puts the id in error bodies (1.3, 3.1, 5.1)', async () => {
    const res = await call(null, 'GET', '/no-such-route');
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-powered-by')).toBeNull();

    const bad = await call(null, 'POST', '/public/events/nowhere/none/lookup', { phone: '123' });
    expect(bad.body.requestId).toBe(bad.headers.get('x-request-id'));
  });

  it('caps request bodies on everything but the import (3.6)', async () => {
    const big = JSON.stringify({ phone: '9'.repeat(200_000) });
    const res = await call(null, 'POST', '/public/events/hyderabad/x/lookup', undefined, big);
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('counts sign-in attempts in the database, shared by every instance (3.3)', async () => {
    const wrong = await call(null, 'POST', '/admin/auth/login', { email, password: 'not-the-password1' });
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    const [row] = await db(`SELECT count FROM rate_limits WHERE key = $1`, [`sign-in:203.0.113.7:${email}`]);
    expect(row.count).toBeGreaterThanOrEqual(1);
  });

  it('signs out other devices on a password change and on "sign out everywhere" (3.2)', async () => {
    const second = await call(null, 'POST', '/admin/auth/login', { email, password });
    expect(second.status).toBe(200);
    const laptop = second.body.token as string;
    expect((await call(laptop, 'GET', '/admin/auth/me')).status).toBe(200);

    expect((await call(token, 'POST', '/admin/auth/logout-all')).status).toBe(200);
    expect((await call(laptop, 'GET', '/admin/auth/me')).body.code).toBe('TOKEN_EXPIRED');
    expect((await call(token, 'GET', '/admin/auth/me')).body.code).toBe('TOKEN_EXPIRED');

    const again = await call(null, 'POST', '/admin/auth/login', { email, password });
    token = again.body.token;
    expect((await call(token, 'GET', '/admin/auth/me')).status).toBe(200);
  });

  it('records admin changes in the audit log (3.4) and shares one dashboard computation (2.2)', async () => {
    const locations = (await call(token, 'GET', '/platform/locations')).body;
    const hydId = locations.find((l: any) => l.slug === 'hyderabad').id;
    const { body: event } = await call(token, 'POST', '/events', {
      name: 'Hardening', date: '2026-11-12', time: '10:00', expectedStudents: 10, teamSize: 5, seatLabels: ['A', 'B', 'C', 'D', 'E'],
      teamNamePrefix: 'Team', activePoolSize: 2, poolFillThreshold: 0.6, locationId: hydId, slug: 'hardening',
    });
    expect(event.id).toBeTruthy();
    await call(token, 'POST', `/events/${event.id}/rooms`, { name: 'Lab', capacity: 10 });
    expect((await call(token, 'POST', `/events/${event.id}/activate`)).status).toBe(200);

    const answers = { grade: 'class_12', stream: 'maths', lunch: 'veg' };
    const seat = await call(null, 'POST', '/public/events/hyderabad/hardening/checkin', {
      name: 'Asha K', phone: '9700000001', parentPhone: '9700000002', parentName: 'Ravi K', schoolCollege: 'PES', location: 'Madhapur', answers,
    });
    expect(seat.status).toBe(200);

    expect((await call(token, 'PATCH', `/events/${event.id}/participants/${seat.body.eventParticipantId}/lunch`, { lunch: 'non_veg' })).status).toBe(200);
    const [entry] = await db(`SELECT action, admin_email, target, details FROM admin_audit WHERE event_id = $1`, [event.id]);
    expect(entry).toMatchObject({ action: 'participant.lunch', admin_email: email, target: String(seat.body.eventParticipantId), details: { lunch: 'non_veg' } });

    const d1 = await call(token, 'GET', `/events/${event.id}/dashboard`);
    const d2 = await call(token, 'GET', `/events/${event.id}/dashboard`);
    expect(d2.body.generatedAt).toBe(d1.body.generatedAt);
    expect(d1.body.answers.lunch.counts).toEqual({ non_veg: 1 });
  });

  it('seats walk-ins arriving at the same moment without deadlocking (found by the load test)', async () => {
    const locations = (await call(token, 'GET', '/platform/locations')).body;
    const hydId = locations.find((l: any) => l.slug === 'hyderabad').id;
    const { body: event } = await call(token, 'POST', '/events', {
      name: 'Rush', date: '2026-11-13', time: '10:00', expectedStudents: 20, teamSize: 4, seatLabels: ['A', 'B', 'C', 'D'],
      teamNamePrefix: 'Team', activePoolSize: 2, poolFillThreshold: 0.6, locationId: hydId, slug: 'rush',
    });
    await call(token, 'POST', `/events/${event.id}/rooms`, { name: 'Hall', capacity: 20 });
    // Only one event can be live at a time: finish the previous test's event first.
    const live = (await db(`SELECT id FROM events WHERE status = 'active'`)).map((r) => r.id);
    for (const id of live) await call(token, 'POST', `/events/${id}/complete`);
    expect((await call(token, 'POST', `/events/${event.id}/activate`)).status).toBe(200);

    const answers = { grade: 'class_11', stream: 'commerce', lunch: 'non_veg' };
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => call(null, 'POST', '/public/events/hyderabad/rush/checkin', {
      name: `Rush Student ${i}`, phone: String(9600000000 + i), parentPhone: String(9500000000 + i), parentName: 'Parent',
      schoolCollege: 'PES', location: 'Madhapur', answers,
    })));
    expect(results.map((r) => r.status)).toEqual(Array(12).fill(200));
    const seats = new Set(results.map((r) => r.body.seatCode));
    expect(seats.size).toBe(12);
  });

  it('uses the new indexes for the lookup join (2.1)', async () => {
    const idx = await db(`SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = ANY($2)`,
      [schema, ['event_participants_participant_idx', 'event_participants_event_status_idx', 'admin_locations_location_idx']]);
    expect(idx).toHaveLength(3);
  });
});
