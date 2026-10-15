/**
 * Integration test against a real Postgres. Runs inside a throwaway schema and drops it afterwards.
 * Skipped when DATABASE_URL is not set.
 *
 * Mirrors the Rooms & Teams acceptance scenarios at a smaller scale (10-seat rooms, teams of 5)
 * so it runs in a few minutes against a remote database; the logic is identical to 60-seat rooms.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.DATABASE_URL;
const schema = `test_${Date.now()}`;
const ssl = process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : undefined;

describe.skipIf(!url)('rooms, teams and seat allocation (database)', () => {
  type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>;
  let call: (token: string | null, method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>;
  let request: Call;
  let hydId: number;
  let server: import('node:http').Server;
  let poolModule: typeof import('../src/db/pool.js');
  let db: (sql: string, params?: unknown[]) => Promise<any[]>;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: url, ssl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    process.env.DATABASE_SCHEMA = schema;

    poolModule = await import('../src/db/pool.js');
    db = async (sql, params) => (await poolModule.pool.query(sql, params)).rows;
    const { migrate } = await import('../src/db/migrate.js');
    await migrate();
    const { createApp } = await import('../src/app.js');
    const { superAdminSeed } = await import('../src/lib/auth.js');
    server = createApp().listen(0);
    const port = (server.address() as import('node:net').AddressInfo).port;
    call = async (token, method, path, body) => {
      const res = await fetch(`http://localhost:${port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    // The first sign-in creates the super admin from the environment (or the default credentials).
    const seed = superAdminSeed();
    const login = await call(null, 'POST', '/admin/auth/login', { email: seed.email, password: seed.password });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('super_admin');
    const superToken: string = login.body.token;
    if (login.body.user.mustChangePassword) {
      expect((await call(superToken, 'GET', '/events')).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      const changed = await call(superToken, 'POST', '/admin/auth/change-password', { currentPassword: seed.password, newPassword: 'Bootcamp2026' });
      expect(changed.status).toBe(200);
    }
    request = (method, path, body) => call(superToken, method, path, body);
    // The migration puts all earlier events under Hyderabad.
    const locations = (await request('GET', '/platform/locations')).body;
    hydId = locations.find((l: any) => l.slug === 'hyderabad').id;
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await poolModule?.pool.end();
    const admin = new pg.Client({ connectionString: url, ssl });
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });

  const student = (i: number) => ({ rowNumber: i + 2, name: `Student ${i + 1}`, phone: String(9000000000 + i), schoolCollege: 'ABC College' });
  const overview = async (eventId: number) => (await request('GET', `/events/${eventId}/rooms-overview`)).body;
  const roomByName = (ov: any, name: string) => ov.rooms.find((r: any) => r.name === name);

  it('runs the Rooms & Teams acceptance scenarios', async () => {
    const { body: event } = await request('POST', '/events', {
      name: 'Bootcamp', date: '2026-10-18', time: '10:00', expectedStudents: 30, teamSize: 5,
      seatLabels: ['A', 'B', 'C', 'D', 'E'], teamNamePrefix: 'Team', activePoolSize: 2, poolFillThreshold: 0.6, locationId: hydId,
    });
    expect(event.publicPath).toBe('/hyderabad/18-oct-2026');
    for (const [i, name] of ['Hall 5', 'Hall 1', '4th Floor'].entries()) {
      const r = await request('POST', `/events/${event.id}/rooms`, { name, capacity: 10, priority: i + 1 });
      expect(r.status).toBe(201);
    }
    const imp = await request('POST', `/events/${event.id}/import`, { rows: Array.from({ length: 38 }, (_, i) => student(i)) });
    expect(imp.body.imported).toBe(38);
    expect((await request('POST', `/events/${event.id}/activate`)).status).toBe(200);

    // F — numbering: every room restarts at Team 1, seats 1A–1E.
    let ov = await overview(event.id);
    for (const room of ov.rooms) {
      const nums = ov.teams.filter((t: any) => t.roomId === room.id).map((t: any) => t.teamNumber);
      expect(nums).toEqual([1, 2]);
    }
    expect(ov.teams[0].seats.map((s: any) => `${ov.teams[0].teamNumber}${s.label}`)).toEqual(['1A', '1B', '1C', '1D', '1E']);

    const eps = await db('SELECT id FROM event_participants WHERE event_id = $1 ORDER BY id', [event.id]);

    // G — repeated requests never create a second seat.
    const repeats = await Promise.all(Array.from({ length: 4 }, () => request('POST', `/events/${event.id}/gate/assign`, { eventParticipantId: eps[0].id })));
    expect(new Set(repeats.map((r) => r.body.seatCode)).size).toBe(1);

    // A — 30 arrivals, 30 approved seats: everyone seated, rooms filled strictly in priority order.
    const priorities: number[] = [];
    for (const ep of eps.slice(0, 30)) {
      const r = await request('POST', `/events/${event.id}/gate/assign`, { eventParticipantId: ep.id });
      expect(r.status).toBe(200);
      priorities.push(['Hall 5', 'Hall 1', '4th Floor'].indexOf(r.body.room));
    }
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
    ov = await overview(event.id);
    expect(ov.stats).toMatchObject({ arrivals: 30, assigned: 30, waiting: 0, availableSeats: 0 });

    // B / E — 8 more arrive: they are recorded as waiting, never given a fake seat.
    for (const ep of eps.slice(30)) {
      const r = await request('POST', `/events/${event.id}/gate/assign`, { eventParticipantId: ep.id });
      expect(r.body.code).toBe('VENUE_FULL');
    }
    const walk = await request('POST', `/events/${event.id}/gate/walk-in`, {
      name: 'Arjun Kumar', phone: '9876543210', parentPhone: '9123456780', schoolCollege: 'XYZ', location: 'Hyderabad',
    });
    expect(walk.body.code).toBe('VENUE_FULL');
    ov = await overview(event.id);
    expect(ov.stats).toMatchObject({ arrivals: 39, assigned: 30, waiting: 9, shortage: 9, availableSeats: 0, aboveExpected: 9 });
    expect(ov.waiting).toHaveLength(9);
    expect((await db(`SELECT COUNT(*)::int n FROM event_participants WHERE status = 'waiting' AND seat_id IS NOT NULL`))[0].n).toBe(0);

    // Allocating with no free seats is a no-op.
    expect((await request('POST', `/events/${event.id}/allocate`)).body).toMatchObject({ allocated: 0, stillWaiting: 9 });

    const before = await db('SELECT id, seat_id FROM event_participants WHERE seat_id IS NOT NULL ORDER BY id');

    // C — add a room: its first team is Team 1, waiting students go there, existing seats untouched.
    const added = await request('POST', `/events/${event.id}/rooms`, { name: 'Seminar Hall', capacity: 10 });
    expect(added.status).toBe(201);
    ov = await overview(event.id);
    const seminar = roomByName(ov, 'Seminar Hall');
    expect(ov.teams.filter((t: any) => t.roomId === seminar.id).map((t: any) => t.teamNumber)).toEqual([1, 2]);
    const alloc = await request('POST', `/events/${event.id}/allocate`);
    expect(alloc.body).toMatchObject({ allocated: 9, stillWaiting: 0, availableSeats: 1 });
    expect(alloc.body.byRoom).toEqual({ [seminar.id]: 9 });
    const after = await db('SELECT id, seat_id FROM event_participants WHERE id = ANY($1::int[]) ORDER BY id', [before.map((b) => b.id)]);
    expect(after).toEqual(before);

    // G — running it again changes nothing.
    expect((await request('POST', `/events/${event.id}/allocate`)).body).toMatchObject({ allocated: 0, stillWaiting: 0 });

    // D — increase capacity: a new table is added after the room's last one.
    const hall1 = roomByName(ov, 'Hall 1');
    const grow = await request('PATCH', `/events/${event.id}/rooms/${hall1.id}`, { name: 'Hall 1', capacity: 13 });
    expect(grow.status).toBe(200);
    ov = await overview(event.id);
    const hall1Teams = ov.teams.filter((t: any) => t.roomId === hall1.id);
    expect(hall1Teams.map((t: any) => t.teamNumber)).toEqual([1, 2, 3]);
    expect(hall1Teams[2].seats.map((s: any) => s.label)).toEqual(['A', 'B', 'C']);
    expect(roomByName(ov, 'Hall 1').available).toBe(3);

    // H — capacity reduction: never below occupancy; otherwise only with confirmation, removing empty seats.
    const hall5 = roomByName(ov, 'Hall 5');
    expect((await request('PATCH', `/events/${event.id}/rooms/${hall5.id}`, { name: 'Hall 5', capacity: 8 })).body.code).toBe('CAPACITY_BELOW_OCCUPANCY');
    expect((await request('PATCH', `/events/${event.id}/rooms/${hall1.id}`, { name: 'Hall 1', capacity: 12 })).body.code).toBe('CONFIRM_REQUIRED');
    const shrink = await request('PATCH', `/events/${event.id}/rooms/${hall1.id}`, { name: 'Hall 1', capacity: 12, confirmReduction: true });
    expect(shrink.status).toBe(200);
    expect(shrink.body.layout).toEqual({ teams: 3, seats: 12 });

    // Team size cannot change once students are seated in a room.
    expect((await request('PATCH', `/events/${event.id}/rooms/${hall5.id}`, { name: 'Hall 5', capacity: 10, teamSize: 4 })).body.code).toBe('TEAM_SIZE_LOCKED');

    // Disabled rooms are skipped by the kiosk.
    await request('PATCH', `/events/${event.id}/rooms/${seminar.id}`, { name: 'Seminar Hall', capacity: 10, isActive: false });
    await request('POST', `/events/${event.id}/import`, { rows: [student(100)] });
    const [late] = await db(`SELECT ep.id FROM event_participants ep JOIN participants p ON p.id = ep.participant_id WHERE p.phone = '9000000100'`);
    const lateSeat = await request('POST', `/events/${event.id}/gate/assign`, { eventParticipantId: late.id });
    expect(lateSeat.body.room).toBe('Hall 1');
    expect(lateSeat.body.teamNumber).toBe(3);

    // Priority can be changed; rooms with seated students cannot be deleted.
    expect((await request('POST', `/events/${event.id}/rooms/${seminar.id}/move`, { direction: 'up' })).body.moved).toBe(true);
    ov = await overview(event.id);
    expect(ov.rooms.map((r: any) => r.name)).toEqual(['Hall 5', 'Hall 1', 'Seminar Hall', '4th Floor']);
    expect((await request('DELETE', `/events/${event.id}/rooms/${hall5.id}`)).body.code).toBe('ROOM_OCCUPIED');

    // Search never confuses Team 1 of one room with Team 1 of another.
    const t1 = await request('GET', `/events/${event.id}/participants?roomId=${hall5.id}&team=1`);
    expect(t1.body.rows).toHaveLength(5);
    expect(t1.body.rows.every((r: any) => r.room === 'Hall 5' && r.teamNumber === 1)).toBe(true);

    // Database-level guarantees.
    expect((await db('SELECT COUNT(*)::int n FROM (SELECT seat_id FROM event_participants WHERE seat_id IS NOT NULL GROUP BY seat_id HAVING COUNT(*) > 1) x'))[0].n).toBe(0);
    expect((await db(`SELECT COUNT(*)::int n FROM rooms r WHERE (SELECT COUNT(*) FROM event_participants ep WHERE ep.room_id = r.id) > r.capacity`))[0].n).toBe(0);
    const log = await db('SELECT action FROM allocation_log WHERE event_id = $1', [event.id]);
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(['room.created', 'room.updated', 'room.reordered', 'allocation.waiting']));

    // Completed events are read-only.
    await request('POST', `/events/${event.id}/complete`);
    expect((await request('PATCH', `/events/${event.id}/rooms/${hall1.id}`, { name: 'Hall 1', capacity: 20 })).body.code).toBe('EVENT_LOCKED');
    expect((await request('POST', `/events/${event.id}/allocate`)).body.code).toBe('EVENT_NOT_ACTIVE');
  }, 1_800_000);

  it('runs several locations with their own admins, links and public check-in', async () => {
    const eventBody = (extra: object) => ({
      name: 'AI Bootcamp', date: '2026-11-08', time: '10:00', expectedStudents: 10, teamSize: 2,
      seatLabels: ['A', 'B'], teamNamePrefix: 'Team', activePoolSize: 2, poolFillThreshold: 0.6, ...extra,
    });

    // Super admin creates a location; reserved and duplicate link names are refused.
    const blr = (await request('POST', '/platform/locations', { name: 'Bengaluru', city: 'Bengaluru', state: 'Karnataka' })).body;
    expect(blr.slug).toBe('bengaluru');
    expect((await request('POST', '/platform/locations', { name: 'Admin' })).status).toBe(400);
    expect((await request('POST', '/platform/locations', { name: 'Bengaluru' })).body.code).toBe('SLUG_TAKEN');

    // A location admin signs up, waits for approval, and is limited to Bengaluru.
    const signup = await call(null, 'POST', '/admin/auth/signup', {
      name: 'Priya', email: 'priya@niat.edu', password: 'Blr2026pass', locationId: blr.id,
    });
    expect(signup.status).toBe(201);
    expect((await call(null, 'POST', '/admin/auth/login', { email: 'priya@niat.edu', password: 'Blr2026pass' })).body.code).toBe('ACCOUNT_PENDING');
    const priya = (await request('GET', '/platform/admins')).body.find((a: any) => a.email === 'priya@niat.edu');
    expect(priya).toMatchObject({ status: 'pending', requestedLocation: { id: blr.id } });
    expect((await request('PATCH', `/platform/admins/${priya.id}`, { status: 'approved' })).status).toBe(400); // no location yet
    expect((await request('PATCH', `/platform/admins/${priya.id}`, { status: 'approved', locationIds: [blr.id] })).status).toBe(200);
    const pLogin = await call(null, 'POST', '/admin/auth/login', { email: 'priya@niat.edu', password: 'Blr2026pass' });
    expect(pLogin.body.user.locations.map((l: any) => l.slug)).toEqual(['bengaluru']);
    const asPriya: Call = (method, path, body) => call(pLogin.body.token, method, path, body);

    // She only sees and manages Bengaluru events; Hyderabad events look like they do not exist.
    const hydEvent = (await request('POST', '/events', eventBody({ locationId: hydId }))).body;
    expect((await asPriya('GET', `/events/${hydEvent.id}`)).status).toBe(404);
    expect((await asPriya('GET', `/events/${hydEvent.id}/dashboard`)).status).toBe(404);
    expect((await asPriya('POST', '/events', eventBody({ locationId: hydId }))).status).toBe(403);
    expect((await asPriya('POST', '/platform/locations', { name: 'Chennai' })).status).toBe(403);
    expect((await asPriya('GET', '/platform/admins')).status).toBe(403);

    // Two events at the same location on the same day get distinct links.
    const first = (await asPriya('POST', '/events', eventBody({}))).body;
    const second = (await asPriya('POST', '/events', eventBody({ name: 'AI Bootcamp Evening' }))).body;
    expect([first.publicPath, second.publicPath]).toEqual(['/bengaluru/8-nov-2026', '/bengaluru/8-nov-2026-2']);
    expect((await asPriya('GET', '/events')).body.every((e: any) => e.locationId === blr.id)).toBe(true);
    expect((await asPriya('PATCH', `/events/${second.id}`, { slug: 'evening' })).body.publicPath).toBe('/bengaluru/evening');

    // Before activation the public page says check-in has not opened.
    const pub = (path: string, method = 'GET', body?: unknown) => call(null, method, `/public/events/bengaluru/8-nov-2026${path}`, body);
    expect((await pub('')).body).toMatchObject({ status: 'draft', locationName: 'Bengaluru' });
    expect((await pub('/lookup', 'POST', { phone: '9811111111' })).body.code).toBe('EVENT_NOT_ACTIVE');
    expect((await call(null, 'GET', '/public/events/bengaluru/nope')).status).toBe(404);

    await asPriya('POST', `/events/${first.id}/rooms`, { name: 'Lab', capacity: 4 });
    await asPriya('POST', `/events/${first.id}/import`, { rows: [{ rowNumber: 2, name: 'Kavya Rao', phone: '9822222222', schoolCollege: 'RV College' }] });
    expect((await asPriya('POST', `/events/${first.id}/activate`)).status).toBe(200);
    // Several events can be live at once (the other Bengaluru event and the Hyderabad one).
    await asPriya('POST', `/events/${second.id}/rooms`, { name: 'Hall', capacity: 4 });
    expect((await asPriya('POST', `/events/${second.id}/activate`)).status).toBe(200);
    await request('POST', `/events/${hydEvent.id}/rooms`, { name: 'Room 1', capacity: 4 });
    expect((await request('POST', `/events/${hydEvent.id}/activate`)).status).toBe(200);
    const live = (await call(null, 'GET', '/public/live')).body.map((e: any) => e.publicPath);
    expect(live).toEqual(expect.arrayContaining(['/bengaluru/8-nov-2026', '/bengaluru/evening', '/hyderabad/8-nov-2026']));
    expect((await asPriya('PATCH', `/events/${first.id}`, { slug: 'renamed' })).body.code).toBe('EVENT_LOCKED');

    // New student: phone, then details, then a seat. Asking again returns the same seat.
    expect((await pub('/lookup', 'POST', { phone: '98111 11111' })).body.state).toBe('new');
    const details = { name: 'Rahul S', phone: '9811111111', parentPhone: '9833333333', schoolCollege: 'PES', location: 'Jayanagar' };
    const seat = await pub('/checkin', 'POST', details);
    expect(seat.status).toBe(200);
    expect(seat.body.room).toBe('Lab');
    const again = await pub('/lookup', 'POST', { phone: '9811111111' });
    expect(again.body).toMatchObject({ state: 'seated', assignment: { seatCode: seat.body.seatCode } });
    expect((await pub('/checkin', 'POST', details)).body).toMatchObject({ seatCode: seat.body.seatCode, alreadyAssigned: true });

    // Registered student: details are shown for confirmation; parent phone is collected when missing.
    const reg = await pub('/lookup', 'POST', { phone: '9822222222' });
    expect(reg.body).toMatchObject({ state: 'registered', participant: { name: 'Kavya Rao', hasParentPhone: false } });
    expect(reg.body.participant.phone).toBe('••••••2222');
    const kavya = { name: 'Kavya Rao', phone: '9822222222', schoolCollege: 'RV College', location: 'Malleshwaram' };
    expect((await pub('/checkin', 'POST', kavya)).body.code).toBe('INVALID_PHONE');
    expect((await pub('/checkin', 'POST', { ...kavya, parentPhone: '9844444444' })).status).toBe(200);
    // Rahul is known from Bengaluru, so another event pre-fills his details.
    const elsewhere = await call(null, 'POST', '/public/events/hyderabad/8-nov-2026/lookup', { phone: '9811111111' });
    expect(elsewhere.body).toMatchObject({ state: 'returning', participant: { name: 'Rahul S', hasParentPhone: true } });

    // The overview is scoped too.
    const pOverview = (await asPriya('GET', '/platform/overview')).body;
    expect(pOverview.locations.map((l: any) => l.slug)).toEqual(['bengaluru']);
    expect(pOverview.events.find((e: any) => e.id === first.id)).toMatchObject({ seated: 2, walkIns: 1, registered: 1 });
    expect((await request('GET', '/platform/overview')).body.pendingAdmins).toBe(0);

    // Disabling an account signs it out immediately.
    await request('PATCH', `/platform/admins/${priya.id}`, { status: 'disabled' });
    expect((await asPriya('GET', '/events')).body.code).toBe('ACCOUNT_DISABLED');
  }, 600_000);
});
