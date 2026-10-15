import type { PoolClient } from 'pg';
import { AppError } from '../lib/errors.js';
import { syncRoomSeats } from './rooms.js';

/** Create every team (table) and seat for an event from its rooms. Runs once, at activation. */
export async function generateTeamsAndSeats(client: PoolClient, eventId: number): Promise<number> {
  const existing = await client.query('SELECT 1 FROM teams WHERE event_id = $1 LIMIT 1', [eventId]);
  if (existing.rowCount) throw new AppError(409, 'TEAMS_EXIST', 'Teams have already been generated for this event');

  const { rows: rooms } = await client.query('SELECT id FROM rooms WHERE event_id = $1 ORDER BY priority', [eventId]);
  let teams = 0;
  for (const room of rooms) teams += (await syncRoomSeats(client, room.id)).teams;
  return teams;
}
