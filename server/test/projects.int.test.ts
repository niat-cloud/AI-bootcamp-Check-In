import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.DATABASE_URL;
const schema = `test_proj_${Date.now()}`;
const ssl = process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : undefined;

describe.skipIf(!url)('Projects & Judging workflow (database integration)', () => {
  type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any; headers: Headers }>;
  let call: (token: string | null, method: string, path: string, body?: unknown) => Promise<{ status: number; body: any; headers: Headers }>;
  let request: Call;
  let server: import('node:http').Server;
  let poolModule: typeof import('../src/db/pool.js');
  let hydId: number;

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
    const { superAdminSeed } = await import('../src/lib/auth.js');
    server = createApp().listen(0);
    const port = (server.address() as import('node:net').AddressInfo).port;
    call = async (token, method, path, body) => {
      const res = await fetch(`http://localhost:${port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      return { status: res.status, body: parsed, headers: res.headers };
    };

    const seed = superAdminSeed();
    const login = await call(null, 'POST', '/admin/auth/login', { email: seed.email, password: seed.password });
    expect(login.status).toBe(200);
    const superToken = login.body.token;
    if (login.body.user.mustChangePassword) {
      const changed = await call(superToken, 'POST', '/admin/auth/change-password', {
        currentPassword: seed.password,
        newPassword: 'Bootcamp2026!',
      });
      expect(changed.status).toBe(200);
    }
    request = (m, p, b) => call(superToken, m, p, b);

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

  it('runs the end-to-end projects submission, review, and awards lifecycle', async () => {
    // 1. Create an active event with 1 room and 2 checked-in students
    const createEventRes = await request('POST', '/events', {
      name: 'Hackathon',
      date: '2026-10-31',
      time: '09:00',
      expectedStudents: 10,
      teamSize: 2,
      seatLabels: ['A', 'B'],
      teamNamePrefix: 'Team',
      activePoolSize: 2,
      poolFillThreshold: 0.6,
      locationId: hydId,
    });
    expect(createEventRes.status).toBe(201);
    const event = createEventRes.body;
    expect(event.id).toBeDefined();

    const roomRes = await request('POST', `/events/${event.id}/rooms`, { name: 'Main Hall', capacity: 10, priority: 1 });
    expect(roomRes.status).toBe(201);
    const roomId = roomRes.body.id;

    const participants = [
      { rowNumber: 2, name: 'Alice Walker', phone: '9111111111', parentPhone: '9888888881', schoolCollege: 'Tech Uni', location: 'Madhapur' },
      { rowNumber: 3, name: 'Bob Dylan', phone: '9222222222', parentPhone: '9888888882', schoolCollege: 'Tech Uni', location: 'Madhapur' },
    ];
    await request('POST', `/events/${event.id}/import`, { rows: participants });
    await request('POST', `/events/${event.id}/activate`);

    // Check in both students so a team is formed and seated
    const checkin1 = await call(null, 'POST', `/public/events/hyderabad/31-oct-2026/checkin`, {
      name: 'Alice Walker',
      phone: '9111111111',
      parentPhone: '9888888881',
      schoolCollege: 'Tech Uni',
      location: 'Madhapur',
    });
    expect(checkin1.status).toBe(200);
    const aliceEpId = checkin1.body.eventParticipantId;

    const checkin2 = await call(null, 'POST', `/public/events/hyderabad/31-oct-2026/checkin`, {
      name: 'Bob Dylan',
      phone: '9222222222',
      parentPhone: '9888888882',
      schoolCollege: 'Tech Uni',
      location: 'Madhapur',
    });
    expect(checkin2.status).toBe(200);

    // 2. Public rooms view before opening
    const pubRoomsBefore = await call(null, 'GET', '/public/events/hyderabad/31-oct-2026/projects');
    expect(pubRoomsBefore.status).toBe(200);
    expect(pubRoomsBefore.body.rooms.length).toBe(1);
    expect(pubRoomsBefore.body.rooms[0].status).toBe('not_open');
    expect(pubRoomsBefore.body.rooms[0].teams.length).toBeGreaterThanOrEqual(1);
    const team = pubRoomsBefore.body.rooms[0].teams.find((t: any) => t.teamNumber === checkin1.body.teamNumber)!;
    expect(team.submitted).toBe(false);
    const teamId = team.id;

    // 3. Attempt submission while room is not_open -> rejected with 409
    const earlySubmit = await call(null, 'POST', `/public/events/hyderabad/31-oct-2026/projects/teams/${teamId}`, {
      memberId: aliceEpId,
      phone: '9111111111',
      projectName: 'CampusHelper',
      theme: 'Student Life Problem Solver',
      problemStatement: 'Students cannot find study rooms easily on campus.',
      projectUrl: 'https://example.com',
    });
    expect(earlySubmit.status).toBe(409);
    expect(earlySubmit.body.code).toBe('SUBMISSIONS_CLOSED');

    // 4. Admin opens submissions for the room with a 45-minute deadline
    const openRes = await request('POST', `/events/${event.id}/projects/rooms/${roomId}/status`, {
      status: 'open',
      deadlineMinutes: 45,
    });
    expect(openRes.status).toBe(200);

    // Verify team view shows open status and masked member names
    const teamView = await call(null, 'GET', `/public/events/hyderabad/31-oct-2026/projects/teams/${teamId}`);
    expect(teamView.status).toBe(200);
    expect(teamView.body.roomStatus).toBe('open');
    expect(teamView.body.members.length).toBeGreaterThanOrEqual(1);
    expect(teamView.body.members.some((m: any) => m.name === 'Alice W.')).toBe(true);

    // 5. Submit project
    // Someone using a different number can't submit as Alice
    const wrongPhone = await call(null, 'POST', `/public/events/hyderabad/31-oct-2026/projects/teams/${teamId}/verify`, {
      memberId: aliceEpId,
      phone: '9222222222',
    });
    expect(wrongPhone.status).toBe(403);
    expect(wrongPhone.body.code).toBe('PHONE_MISMATCH');
    const rightPhone = await call(null, 'POST', `/public/events/hyderabad/31-oct-2026/projects/teams/${teamId}/verify`, {
      memberId: aliceEpId,
      phone: '+91 91111 11111',
    });
    expect(rightPhone.status).toBe(200);

    const submitRes = await call(null, 'POST', `/public/events/hyderabad/31-oct-2026/projects/teams/${teamId}`, {
      memberId: aliceEpId,
      phone: '9111111111',
      projectName: 'CampusHelper',
      theme: 'Student Life Problem Solver',
      problemStatement: 'Students cannot find study rooms easily on campus.',
      projectUrl: 'https://example.com',
    });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.late).toBe(false);
    expect(submitRes.body.submission.projectName).toBe('CampusHelper');

    // 6. A second submission from the same team is refused: one chance per team
    const updateRes = await call(null, 'POST', `/public/events/hyderabad/31-oct-2026/projects/teams/${teamId}`, {
      memberId: aliceEpId,
      phone: '9111111111',
      projectName: 'CampusHelper v2',
      theme: 'Student Life Problem Solver',
      problemStatement: 'Students cannot find study rooms and campus facilities easily.',
      projectUrl: 'https://iana.org',
    });
    expect(updateRes.status).toBe(409);
    expect(updateRes.body.code).toBe('ALREADY_SUBMITTED');

    // 7. Admin overview
    const overviewRes = await request('GET', `/events/${event.id}/projects`);
    expect(overviewRes.status).toBe(200);
    const overview = overviewRes.body;
    expect(overview.rooms[0].submittedCount).toBe(1);
    expect(overview.rooms[0].projects).toHaveLength(1);
    const proj = overview.rooms[0].projects[0];
    expect(proj.projectName).toBe('CampusHelper');
    expect(proj.editCount).toBe(0);
    expect(proj.evalStatus).toBe('pending');
    expect(overview.queue.pending).toBe(1);

    // 8. Admin review & score override
    const reviewRes = await request('PATCH', `/events/${event.id}/projects/${proj.id}`, {
      adminScore: 44.5,
      adminNote: 'Excellent execution and clear problem statement',
      disqualified: false,
    });
    expect(reviewRes.status).toBe(200);

    const afterReview = await request('GET', `/events/${event.id}/projects`);
    const reviewedProj = afterReview.body.rooms[0].projects[0];
    expect(reviewedProj.adminScore).toBe(44.5);
    expect(reviewedProj.adminNote).toBe('Excellent execution and clear problem statement');
    expect(reviewedProj.finalScore).toBe(44.5);
    expect(reviewedProj.rank).toBe(1);

    // 9. Re-queue evaluation
    const requeueRes = await request('POST', `/events/${event.id}/projects/${proj.id}/re-evaluate`);
    expect(requeueRes.status).toBe(200);

    // 10. Assign awards
    const awardsRes = await request('POST', `/events/${event.id}/projects/rooms/${roomId}/awards`, {
      winner: proj.id,
      runner_up: null,
      second_runner_up: null,
    });
    expect(awardsRes.status).toBe(200);

    const afterAwards = await request('GET', `/events/${event.id}/projects`);
    expect(afterAwards.body.rooms[0].projects[0].award).toBe('winner');

    // 11. Lock room results
    const lockRes = await request('POST', `/events/${event.id}/projects/rooms/${roomId}/lock`, { locked: true });
    expect(lockRes.status).toBe(200);

    // When locked, reopening submissions or modifying awards is prevented
    const reopenAttempt = await request('POST', `/events/${event.id}/projects/rooms/${roomId}/status`, { status: 'open' });
    expect(reopenAttempt.status).toBe(409);
    expect(reopenAttempt.body.code).toBe('ROOM_LOCKED');

    const awardChangeAttempt = await request('POST', `/events/${event.id}/projects/rooms/${roomId}/awards`, {
      winner: null,
      runner_up: null,
      second_runner_up: null,
    });
    expect(awardChangeAttempt.status).toBe(409);
    expect(awardChangeAttempt.body.code).toBe('RESULTS_LOCKED');

    // Unlock room results
    const unlockRes = await request('POST', `/events/${event.id}/projects/rooms/${roomId}/lock`, { locked: false });
    expect(unlockRes.status).toBe(200);

    // 12. Export CSV
    const exportRes = await request('GET', `/events/${event.id}/projects/export`);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get('content-type')).toContain('text/csv');
    expect(exportRes.body).toContain('CampusHelper');
    expect(exportRes.body).toContain('Winner');
    expect(exportRes.body).toContain('44.5');
  }, 120_000);
});
