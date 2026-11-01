import { withTransaction } from '../db/pool.js';
import { AppError, notFound } from '../lib/errors.js';
import { logAllocation } from './rooms.js';

/** Rows the WHERE clause of removeRegistrations can refer to. */
const FROM = `event_participants ep
  JOIN participants p ON p.id = ep.participant_id
  LEFT JOIN teams t ON t.id = ep.team_id`;

export interface RemoveResult {
  removed: number;
  /** Seats given back to the room, from people who had already been seated. */
  freedSeats: number;
  /** Matching people who were kept because they had already arrived (only when includeArrived is false). */
  kept: number;
}

/**
 * Removes registrations from an event: a wrong import, a test check-in, someone who shouldn't be there.
 * `where` selects rows in `event_participants ep` (with `participants p` and `teams t` joined) and must use
 * $1 for the event id; `params` holds that id and anything else it references.
 *
 * Without includeArrived, only people who haven't arrived are removed. With it, seated people are removed
 * too and their seats become free again. This takes the same event lock as a check-in, so a seat is never
 * freed while someone is being seated in it. The person stays in the database for other events.
 */
export async function removeRegistrations(
  eventId: number,
  where: string,
  params: unknown[],
  options: { includeArrived: boolean; actor: string; reason: string; details?: object },
): Promise<RemoveResult> {
  return withTransaction(async (client) => {
    const { rows: [event] } = await client.query('SELECT status FROM events WHERE id = $1 FOR UPDATE', [eventId]);
    if (!event) throw notFound('Event');
    if (event.status === 'completed') throw new AppError(409, 'EVENT_LOCKED', 'A completed event can no longer be changed.');

    const { rows: matched } = await client.query(
      `SELECT ep.id, ep.seat_id, ep.status, p.name, p.phone, ep.source, t.team_number, ep.seat_label
       FROM ${FROM} WHERE ${where}`,
      params,
    );
    const notArrived = (r: { seat_id: number | null; status: string }) => r.seat_id === null && r.status === 'registered';
    const targets = options.includeArrived ? matched : matched.filter(notArrived);
    const kept = matched.length - targets.length;
    if (!targets.length) return { removed: 0, freedSeats: 0, kept };

    const ids = targets.map((r) => r.id);
    const { rowCount: freedSeats } = await client.query(
      `UPDATE seats SET status = 'available', event_participant_id = NULL WHERE event_participant_id = ANY($1::int[])`,
      [ids],
    );
    await client.query('DELETE FROM event_participants WHERE id = ANY($1::int[])', [ids]);
    await logAllocation(client, eventId, 'participants_removed', {
      reason: options.reason,
      count: targets.length,
      freedSeats,
      ...options.details,
      people: targets.slice(0, 1000).map((r) => ({
        name: r.name, phone: r.phone, source: r.source, seat: r.team_number ? `${r.team_number}${r.seat_label}` : null,
      })),
    }, options.actor);
    return { removed: targets.length, freedSeats: freedSeats ?? 0, kept };
  });
}
