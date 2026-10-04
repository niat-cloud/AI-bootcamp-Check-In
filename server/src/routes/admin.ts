import { Router } from 'express';
import * as XLSX from 'xlsx';
import { pool } from '../db/pool.js';
import { loadEvent } from './events.js';

/** Admin reporting endpoints mounted under /api/events/:id. */
export const adminRouter = Router({ mergeParams: true });

const TZ = process.env.EVENT_TIMEZONE || 'Asia/Kolkata';

adminRouter.get('/dashboard', async (req, res) => {
  const event = await loadEvent(Number((req.params as Record<string, string>).id));
  const { rows: [counts] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE registration_type = 'existing')::int AS existing,
       COUNT(*) FILTER (WHERE registration_type = 'walk_in')::int AS "walkIns",
       COUNT(*) FILTER (WHERE seat_id IS NOT NULL)::int AS "checkedIn",
       COUNT(*) FILTER (WHERE seat_id IS NOT NULL AND registration_type = 'existing')::int AS "existingCheckedIn",
       COUNT(*) FILTER (WHERE seat_id IS NOT NULL AND check_in_time >= NOW() - INTERVAL '10 minutes')::int AS "recent10Min"
     FROM event_participants WHERE event_id = $1`,
    [event.id],
  );
  const { rows: rooms } = await pool.query(
    `SELECT r.id, r.name, r.capacity, r.priority,
       (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.room_id = r.id) AS used
     FROM rooms r WHERE r.event_id = $1 ORDER BY r.priority`,
    [event.id],
  );
  const { rows: teams } = await pool.query(
    `SELECT t.id, t.team_number AS "teamNumber", t.capacity, t.room_id AS "roomId", r.name AS "roomName",
       COUNT(s.id) FILTER (WHERE s.status = 'assigned')::int AS assigned
     FROM teams t
     JOIN rooms r ON r.id = t.room_id
     LEFT JOIN seats s ON s.team_id = t.id
     WHERE t.event_id = $1 GROUP BY t.id, r.name ORDER BY t.team_number`,
    [event.id],
  );

  const { rows: recentActivity } = await pool.query(
    `SELECT ep.id, p.name, p.school_college AS "schoolCollege",
       t.team_number AS "teamNumber", ep.seat_label AS "seatLabel",
       r.name AS "roomName", ep.check_in_time AS "checkInTime"
     FROM event_participants ep
     JOIN participants p ON p.id = ep.participant_id
     LEFT JOIN teams t ON t.id = ep.team_id
     LEFT JOIN rooms r ON r.id = ep.room_id
     WHERE ep.event_id = $1 AND ep.seat_id IS NOT NULL
     ORDER BY ep.check_in_time DESC NULLS LAST, ep.id DESC
     LIMIT 15`,
    [event.id],
  );

  const { rows: firstCheckIns } = await pool.query(
    `SELECT ep.id, p.name, p.school_college AS "schoolCollege",
       t.team_number AS "teamNumber", ep.seat_label AS "seatLabel",
       r.name AS "roomName", ep.check_in_time AS "checkInTime"
     FROM event_participants ep
     JOIN participants p ON p.id = ep.participant_id
     LEFT JOIN teams t ON t.id = ep.team_id
     LEFT JOIN rooms r ON r.id = ep.room_id
     WHERE ep.event_id = $1 AND ep.seat_id IS NOT NULL AND ep.check_in_time IS NOT NULL
     ORDER BY ep.check_in_time ASC, ep.id ASC
     LIMIT 5`,
    [event.id],
  );

  const { rows: teamSeats } = await pool.query(
    `SELECT t.id AS "teamId", s.label, s.status, p.name AS student
     FROM seats s
     JOIN teams t ON t.id = s.team_id
     LEFT JOIN event_participants ep ON ep.id = s.event_participant_id
     LEFT JOIN participants p ON p.id = ep.participant_id
     WHERE t.event_id = $1
     ORDER BY t.team_number, s.position`,
    [event.id],
  );

  const seatsByTeam = new Map<number, { label: string; student: string | null }[]>();
  for (const s of teamSeats) {
    if (!seatsByTeam.has(s.teamId)) seatsByTeam.set(s.teamId, []);
    seatsByTeam.get(s.teamId)!.push({ label: s.label, student: s.student });
  }

  const teamsWithSeats = teams.map((t) => ({
    ...t,
    seats: seatsByTeam.get(t.id) || [],
  }));

  const actual = counts.existing + counts.walkIns;
  const totalCapacity = rooms.reduce((s, r) => s + r.capacity, 0);
  res.json({
    event,
    stats: {
      expected: event.expectedStudents,
      existing: counts.existing,
      walkIns: counts.walkIns,
      actual,
      checkedIn: counts.checkedIn,
      recent10Min: counts.recent10Min ?? 0,
      remaining: actual - counts.checkedIn,
      remainingExpected: Math.max(0, event.expectedStudents - counts.existingCheckedIn),
      totalCapacity,
      seatsLeft: Math.max(0, totalCapacity - counts.checkedIn),
    },
    rooms,
    teams: teamsWithSeats,
    recentActivity,
    firstCheckIns,
  });
});

/** Seat-level view of every team, for the Teams overview. */
adminRouter.get('/teams', async (req, res) => {
  const event = await loadEvent(Number((req.params as Record<string, string>).id));
  const { rows } = await pool.query(
    `SELECT t.id, t.team_number, t.capacity, t.room_id, r.name AS room_name,
       s.label, s.status, p.name AS student
     FROM teams t
     JOIN rooms r ON r.id = t.room_id
     JOIN seats s ON s.team_id = t.id
     LEFT JOIN event_participants ep ON ep.id = s.event_participant_id
     LEFT JOIN participants p ON p.id = ep.participant_id
     WHERE t.event_id = $1
     ORDER BY t.team_number, s.position`,
    [event.id],
  );
  const teams = new Map<number, any>();
  for (const r of rows) {
    if (!teams.has(r.id)) {
      teams.set(r.id, { id: r.id, teamNumber: r.team_number, capacity: r.capacity, roomId: r.room_id, room: r.room_name, seats: [] });
    }
    teams.get(r.id).seats.push({ label: r.label, student: r.student });
  }
  res.json([...teams.values()]);
});

const PARTICIPANT_SELECT = `
  SELECT ep.id, p.name, p.phone, p.parent_phone AS "parentPhone", p.school_college AS "schoolCollege",
    p.class AS "className", p.location, ep.registration_type AS "registrationType", ep.status,
    r.name AS room, t.team_number AS "teamNumber", ep.seat_label AS "seatLabel", ep.check_in_time AS "checkInTime"
  FROM event_participants ep
  JOIN participants p ON p.id = ep.participant_id
  LEFT JOIN rooms r ON r.id = ep.room_id
  LEFT JOIN teams t ON t.id = ep.team_id`;

adminRouter.get('/participants', async (req, res) => {
  const event = await loadEvent(Number((req.params as Record<string, string>).id));
  const q = String(req.query.q ?? '').trim();
  const filter = String(req.query.filter ?? 'all');
  const params: unknown[] = [event.id];
  const conds = ['ep.event_id = $1'];

  if (filter === 'checked_in') conds.push('ep.seat_id IS NOT NULL');
  if (filter === 'pending') conds.push('ep.seat_id IS NULL');
  if (filter === 'walk_in') conds.push(`ep.registration_type = 'walk_in'`);

  if (q) {
    const seat = q.match(/^(?:team\s*)?(\d{1,4})\s*([a-z]{0,2})$/i);
    const digits = q.replace(/[\s-]/g, '');
    if (seat && digits.length <= 5) {
      // "17" → team 17, "17B" / "Team 17 B" → that seat. Also allow partial phone matches.
      params.push(Number(seat[1]));
      const teamParam = params.length;
      if (seat[2]) {
        params.push(seat[2].toUpperCase());
        conds.push(`(t.team_number = $${teamParam} AND upper(ep.seat_label) = $${params.length})`);
      } else {
        params.push(`%${digits}%`);
        conds.push(`(t.team_number = $${teamParam} OR p.phone LIKE $${params.length})`);
      }
    } else if (/^\+?\d{3,}$/.test(digits)) {
      params.push(`%${digits.replace(/^\+?91(?=\d{10}$)/, '')}%`);
      conds.push(`(p.phone LIKE $${params.length} OR p.parent_phone LIKE $${params.length})`);
    } else {
      for (const word of q.toLowerCase().split(/\s+/).slice(0, 5)) {
        params.push(`%${word.replace(/[%_\\]/g, '\\$&')}%`);
        conds.push(`(lower(p.name) LIKE $${params.length} OR lower(p.school_college) LIKE $${params.length} OR lower(COALESCE(p.location, '')) LIKE $${params.length})`);
      }
    }
  }

  const { rows } = await pool.query(
    `${PARTICIPANT_SELECT} WHERE ${conds.join(' AND ')}
     ORDER BY ep.check_in_time DESC NULLS LAST, p.name LIMIT 500`,
    params,
  );
  const { rows: [{ total }] } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM event_participants ep
     JOIN participants p ON p.id = ep.participant_id LEFT JOIN teams t ON t.id = ep.team_id
     WHERE ${conds.join(' AND ')}`,
    params,
  );
  res.json({ total, rows });
});

adminRouter.get('/export', async (req, res) => {
  const event = await loadEvent(Number((req.params as Record<string, string>).id));
  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
  const { rows } = await pool.query(
    `${PARTICIPANT_SELECT} WHERE ep.event_id = $1
     ORDER BY t.team_number NULLS LAST, ep.seat_label, p.name`,
    [event.id],
  );
  const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
  const data = rows.map((r) => ({
    Name: r.name,
    Phone: r.phone,
    'Parent Phone': r.parentPhone ?? '',
    'School/College': r.schoolCollege,
    Class: r.className ?? '',
    'Coming From': r.location ?? '',
    'Registration Type': r.registrationType === 'walk_in' ? 'Walk-in' : 'Existing',
    Status: r.checkInTime ? 'Checked In' : 'Not Arrived',
    Room: r.room ?? '',
    Team: r.teamNumber ? `${event.teamNamePrefix} ${r.teamNumber}` : '',
    Seat: r.teamNumber ? `${r.teamNumber}${r.seatLabel}` : '',
    'Check-in Time': r.checkInTime ? timeFmt.format(r.checkInTime).toUpperCase() : '',
  }));

  const sheet = XLSX.utils.json_to_sheet(data, {
    header: ['Name', 'Phone', 'Parent Phone', 'School/College', 'Class', 'Coming From', 'Registration Type', 'Status', 'Room', 'Team', 'Seat', 'Check-in Time'],
  });
  const safeName = `${event.name}-${event.date}`.replace(/[^\w-]+/g, '_');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
    res.send('﻿' + XLSX.utils.sheet_to_csv(sheet));
  } else {
    sheet['!cols'] = [24, 13, 13, 28, 8, 20, 16, 12, 12, 10, 7, 13].map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Participants');
    const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xlsx"`);
    res.send(buffer);
  }
});
