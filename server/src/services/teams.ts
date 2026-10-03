import type { PoolClient } from 'pg';
import { planTeams } from '../lib/allocation.js';
import { AppError } from '../lib/errors.js';

/** Create every team (table) and seat for an event from its rooms. Runs once, at activation. */
export async function generateTeamsAndSeats(client: PoolClient, eventId: number): Promise<number> {
  const { rows: [event] } = await client.query(
    'SELECT team_size, seat_labels FROM events WHERE id = $1',
    [eventId],
  );
  const existing = await client.query('SELECT 1 FROM teams WHERE event_id = $1 LIMIT 1', [eventId]);
  if (existing.rowCount) throw new AppError(409, 'TEAMS_EXIST', 'Teams have already been generated for this event');

  const { rows: rooms } = await client.query(
    'SELECT id, capacity, priority FROM rooms WHERE event_id = $1',
    [eventId],
  );
  const plan = planTeams(rooms, event.team_size);
  const labels: string[] = event.seat_labels;

  if (plan.length === 0) return 0;

  // Bulk insert: one query for all teams, one for all seats (fast even against a remote database).
  await client.query(
    `INSERT INTO teams (event_id, room_id, team_number, capacity)
     SELECT $1, room_id, team_number, capacity
     FROM unnest($2::int[], $3::int[], $4::int[]) AS t(room_id, team_number, capacity)`,
    [eventId, plan.map((t) => t.roomId), plan.map((t) => t.teamNumber), plan.map((t) => t.capacity)],
  );
  await client.query(
    `INSERT INTO seats (event_id, team_id, label, position)
     SELECT t.event_id, t.id, l.label, l.ord
     FROM teams t
     CROSS JOIN LATERAL unnest($2::text[]) WITH ORDINALITY AS l(label, ord)
     WHERE t.event_id = $1 AND l.ord <= t.capacity`,
    [eventId, labels],
  );
  return plan.length;
}
