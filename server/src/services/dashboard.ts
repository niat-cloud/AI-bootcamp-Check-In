import { pool } from '../db/pool.js';
import { arrivalTimeline } from '../lib/timeline.js';

/** Everyone who reached the venue, including those still waiting for a seat. */
const ARRIVED = `ep.status IN ('waiting', 'checked_in')`;
/** When someone reached the venue. Seats given before arrival times were recorded only have a check-in time. */
const ARRIVED_AT = `COALESCE(ep.arrived_at, ep.check_in_time)`;

/** Source filter keys for registrations without a source (see `sourceCondition`). */
export const NO_SOURCE = '__none';
export const WALK_IN = '__walk_in';

/** SQL condition (and its parameter, if any) selecting one source group from the dashboard. */
export function sourceCondition(key: string, paramIndex: number): { sql: string; param?: string } {
  if (key === NO_SOURCE) return { sql: `ep.source IS NULL AND ep.registration_type = 'existing'` };
  if (key === WALK_IN) return { sql: `ep.source IS NULL AND ep.registration_type = 'walk_in'` };
  return { sql: `lower(ep.source) = $${paramIndex}`, param: key.toLowerCase() };
}

interface DashboardEvent {
  id: number;
  status: string;
  expectedStudents: number;
}

/** Everything the event dashboard shows, computed from the event's own rows. */
export async function getDashboard<E extends DashboardEvent>(event: E) {
  const id = event.id;
  const [counts, rooms, teams, seats, recentActivity, firstCheckIns, waiting, arrivals, sources, areas, schools] =
    await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE ep.registration_type = 'existing')::int AS registered,
           COUNT(*) FILTER (WHERE ep.registration_type = 'walk_in')::int AS "walkIns",
           COUNT(*) FILTER (WHERE ${ARRIVED})::int AS arrived,
           COUNT(*) FILTER (WHERE ep.seat_id IS NOT NULL)::int AS seated,
           COUNT(*) FILTER (WHERE ep.status = 'waiting')::int AS waiting,
           COUNT(*) FILTER (WHERE ${ARRIVED} AND ${ARRIVED_AT} >= now() - interval '15 minutes')::int AS "arrivedLast15Min",
           COUNT(*) FILTER (WHERE ep.registration_type = 'existing' AND ep.source IS NULL)::int AS "withoutSource",
           max(${ARRIVED_AT}) FILTER (WHERE ${ARRIVED}) AS "lastArrivalAt"
         FROM event_participants ep WHERE ep.event_id = $1`,
        [id],
      ),
      pool.query(
        `SELECT r.id, r.name, r.capacity, r.priority, r.is_active AS "isActive",
           (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.room_id = r.id) AS used
         FROM rooms r WHERE r.event_id = $1 ORDER BY r.priority`,
        [id],
      ),
      pool.query(
        `SELECT t.id, t.team_number AS "teamNumber", t.capacity, t.room_id AS "roomId",
           COUNT(s.id) FILTER (WHERE s.status = 'assigned')::int AS assigned
         FROM teams t LEFT JOIN seats s ON s.team_id = t.id
         WHERE t.event_id = $1 GROUP BY t.id ORDER BY t.room_id, t.team_number`,
        [id],
      ),
      pool.query(
        `SELECT s.team_id AS "teamId", s.label, p.name AS student
         FROM seats s
         LEFT JOIN event_participants ep ON ep.id = s.event_participant_id
         LEFT JOIN participants p ON p.id = ep.participant_id
         WHERE s.event_id = $1 ORDER BY s.team_id, s.position`,
        [id],
      ),
      seatedList(id, 'DESC', 15),
      seatedList(id, 'ASC', 5),
      pool.query(
        `SELECT ep.id, p.name, p.school_college AS "schoolCollege", ep.registration_type AS "registrationType",
           ep.arrived_at AS "arrivedAt"
         FROM event_participants ep JOIN participants p ON p.id = ep.participant_id
         WHERE ep.event_id = $1 AND ep.status = 'waiting'
         ORDER BY ep.arrived_at NULLS LAST, ep.id LIMIT 10`,
        [id],
      ),
      pool.query(
        `SELECT floor(extract(epoch FROM ${ARRIVED_AT}) / 300)::bigint * 300 AS bucket, COUNT(*)::int AS n
         FROM event_participants ep
         WHERE ep.event_id = $1 AND ${ARRIVED} AND ${ARRIVED_AT} IS NOT NULL
         GROUP BY 1 ORDER BY 1`,
        [id],
      ),
      sourceFunnel(id),
      breakdown(id, 'p.location'),
      breakdown(id, 'p.school_college'),
    ]);

  const c = counts.rows[0];
  const activeRooms = rooms.rows.filter((r) => r.isActive);
  const seatsByTeam = new Map<number, { label: string; student: string | null }[]>();
  for (const s of seats.rows) {
    if (!seatsByTeam.has(s.teamId)) seatsByTeam.set(s.teamId, []);
    seatsByTeam.get(s.teamId)!.push({ label: s.label, student: s.student });
  }

  return {
    event,
    generatedAt: new Date().toISOString(),
    stats: {
      expected: event.expectedStudents,
      registered: c.registered,
      walkIns: c.walkIns,
      total: c.registered + c.walkIns,
      arrived: c.arrived,
      seated: c.seated,
      waiting: c.waiting,
      notArrived: c.registered + c.walkIns - c.arrived,
      arrivedLast15Min: c.arrivedLast15Min,
      lastArrivalAt: c.lastArrivalAt as Date | null,
      withoutSource: c.withoutSource,
      capacity: activeRooms.reduce((n, r) => n + r.capacity, 0),
      seatsLeft: activeRooms.reduce((n, r) => n + Math.max(0, r.capacity - r.used), 0),
    },
    rooms: rooms.rows,
    teams: teams.rows.map((t) => ({ ...t, seats: seatsByTeam.get(t.id) ?? [] })),
    recentActivity,
    firstCheckIns,
    waiting: waiting.rows,
    arrivals: arrivalTimeline(arrivals.rows, event.status === 'active'),
    sources,
    areas,
    schools,
  };
}

/** Seated students, newest or earliest first. */
async function seatedList(eventId: number, order: 'ASC' | 'DESC', limit: number) {
  const { rows } = await pool.query(
    `SELECT ep.id, p.name, p.school_college AS "schoolCollege", t.team_number AS "teamNumber",
       ep.seat_label AS "seatLabel", r.name AS "roomName", ep.check_in_time AS "checkInTime"
     FROM event_participants ep
     JOIN participants p ON p.id = ep.participant_id
     LEFT JOIN teams t ON t.id = ep.team_id
     LEFT JOIN rooms r ON r.id = ep.room_id
     WHERE ep.event_id = $1 AND ep.seat_id IS NOT NULL AND ep.check_in_time IS NOT NULL
     ORDER BY ep.check_in_time ${order}, ep.id ${order}
     LIMIT ${limit}`,
    [eventId],
  );
  return rows;
}

/**
 * Registered → arrived for each marketing source. Sources are grouped case-insensitively and shown in
 * their most common spelling. Walk-ins and imported rows without a source get their own groups.
 * `key` is what the participants list and export take as their `source` filter.
 */
async function sourceFunnel(eventId: number) {
  const { rows } = await pool.query(
    `SELECT mode() WITHIN GROUP (ORDER BY ep.source COLLATE "C") AS label,
       bool_and(ep.registration_type = 'walk_in') AS "walkIn",
       COUNT(*)::int AS registered,
       COUNT(*) FILTER (WHERE ${ARRIVED})::int AS arrived
     FROM event_participants ep
     WHERE ep.event_id = $1
     GROUP BY lower(ep.source), (ep.source IS NULL AND ep.registration_type = 'walk_in')
     ORDER BY registered DESC, arrived DESC`,
    [eventId],
  );
  return rows.map((r) => {
    const kind: 'source' | 'walk_in' | 'none' = r.label ? 'source' : r.walkIn ? 'walk_in' : 'none';
    return {
      key: kind === 'source' ? r.label as string : kind === 'walk_in' ? WALK_IN : NO_SOURCE,
      source: r.label ?? (r.walkIn ? 'Walk-in' : 'Not specified'),
      kind,
      registered: r.registered as number,
      arrived: r.arrived as number,
    };
  });
}

/**
 * Registered → arrived grouped by a free-text participant column (area, school), case- and
 * space-insensitively. The top groups by arrivals, then the long tail and missing values as totals.
 */
async function breakdown(eventId: number, column: 'p.location' | 'p.school_college', top = 8) {
  const { rows } = await pool.query(
    `SELECT mode() WITHIN GROUP (ORDER BY g.label COLLATE "C") AS label,
       COUNT(*)::int AS registered,
       COUNT(*) FILTER (WHERE g.arrived)::int AS arrived
     FROM (
       SELECT NULLIF(btrim(regexp_replace(${column}, '\\s+', ' ', 'g')), '') AS label, ${ARRIVED} AS arrived
       FROM event_participants ep JOIN participants p ON p.id = ep.participant_id
       WHERE ep.event_id = $1
     ) g
     GROUP BY lower(g.label)
     ORDER BY arrived DESC, registered DESC, label`,
    [eventId],
  );
  const named = rows.filter((r) => r.label);
  const sum = (list: typeof rows) => ({
    registered: list.reduce((n, r) => n + r.registered, 0),
    arrived: list.reduce((n, r) => n + r.arrived, 0),
  });
  return {
    rows: named.slice(0, top) as { label: string; registered: number; arrived: number }[],
    others: { count: Math.max(0, named.length - top), ...sum(named.slice(top)) },
    missing: sum(rows.filter((r) => !r.label)),
  };
}
