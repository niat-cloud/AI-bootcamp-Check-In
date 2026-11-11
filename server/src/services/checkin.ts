import { z } from 'zod';
import { pool, withTransaction, type Db } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { classLabel, type Answers } from '../lib/answers.js';
import { maskPhone, normalizePhone } from '../lib/phone.js';
import { assignSeatTx, type SeatAssignment } from './seating.js';

/** Thrown after the waiting-list entry has been committed, so the arrival is never lost. */
export const waitingListError = () => new AppError(409, 'VENUE_FULL',
  "All approved seats are taken right now. You're checked in and on the waiting list — an organizer will give you a seat shortly.");

export const eventNotActiveError = (status: string, date?: string) => new AppError(409, 'EVENT_NOT_ACTIVE',
  status === 'completed'
    ? 'This event has ended. Check-in is closed.'
    : `Check-in hasn't opened yet${date ? ` (event date: ${date})` : ''}. Please try again when the event starts.`);

/** Student details collected at check-in. Parent phone may be omitted when we already have one on file. */
export const detailsInput = z.object({
  name: z.string().trim().min(2, 'Full name is required').max(100),
  phone: z.string().trim().min(1, 'Phone number is required').max(20),
  parentPhone: z.string().trim().max(20).optional(),
  parentName: z.string().trim().max(100).optional(),
  schoolCollege: z.string().trim().min(2, 'School/College is required').max(150),
  className: z.string().trim().max(150).optional(),
  location: z.string().trim().min(2, "The location you're coming from is required").max(100),
});
export type DetailsInput = z.infer<typeof detailsInput>;

export function requirePhone(raw: string, what = 'phone number'): string {
  const phone = normalizePhone(raw);
  if (!phone) throw new AppError(400, 'INVALID_PHONE', `Enter a valid 10-digit ${what}.`);
  return phone;
}

/** Name or phone search within one event (gate laptop). */
export async function searchEvent(eventId: number, rawQuery: string) {
  const q = rawQuery.trim().slice(0, 60);
  if (q.length < 2) return [];
  const digits = q.replace(/[\s-]/g, '');
  let where: string;
  let params: unknown[];
  if (/^\+?\d{3,}$/.test(digits)) {
    const d = digits.replace(/^\+?91(?=\d{10}$)/, '');
    where = 'p.phone LIKE $1';
    params = [`%${d}%`];
  } else {
    // Every word must appear in the name (so "sai kum" finds "Sai Kumar").
    const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
    where = words.map((_, i) => `lower(p.name) LIKE $${i + 1}`).join(' AND ');
    params = words.map((w) => `%${w.replace(/[%_\\]/g, '\\$&')}%`);
  }
  params.push(`${q}%`, eventId);
  const { rows } = await pool.query(
    `SELECT ep.id, p.name, p.school_college, p.class, p.phone, p.location, ep.registration_type,
            t.team_number, ep.seat_label
     FROM event_participants ep
     JOIN participants p ON p.id = ep.participant_id
     LEFT JOIN teams t ON t.id = ep.team_id
     WHERE ep.event_id = $${params.length} AND ${where}
     ORDER BY (lower(p.name) LIKE lower($${params.length - 1})) DESC, p.name
     LIMIT 15`,
    params,
  );
  return rows.map((r) => ({
    eventParticipantId: r.id,
    name: r.name,
    schoolCollege: r.school_college,
    className: r.class,
    location: r.location ?? null,
    phone: maskPhone(r.phone),
    registrationType: r.registration_type,
    seatCode: r.team_number ? `${r.team_number}${r.seat_label}` : null,
  }));
}

/**
 * Save the student's details, register them for the event if they aren't yet (as a walk-in), and give
 * them a seat — all in one transaction, so two taps can never produce two registrations.
 * `rejectIfRegistered` is the gate's walk-in form: an existing registration must be found by search instead.
 */
export async function registerAndSeat(
  eventId: number,
  v: DetailsInput,
  options: { rejectIfRegistered?: boolean; answers?: Answers | null } = {},
): Promise<SeatAssignment> {
  const answers = options.answers ?? null;
  // The class answer replaces the free-text class, so every screen and export shows one consistent label.
  const className = (answers && classLabel(answers)) || v.className || '';
  const phone = requirePhone(v.phone);
  const parentPhone = v.parentPhone ? requirePhone(v.parentPhone, 'parent phone number') : null;
  if (parentPhone && parentPhone === phone) {
    throw new AppError(400, 'INVALID_PHONE', 'Your parent’s mobile number must be different from your own.');
  }
  const name = v.name.replace(/\s+/g, ' ');
  const parentName = v.parentName?.replace(/\s+/g, ' ') || null;

  const result = await withTransaction(async (client) => {
    // Take the event lock first. Inserting a registration takes a light lock on the event row (its foreign
    // key), and the seat allocation below then asks for FOR UPDATE on the same row: two walk-ins at the same
    // moment would each hold the light lock and wait for the other, a deadlock. Locking up front makes every
    // check-in queue on one lock in one order. Found by demo/loadtest.ts (ARCH-ITEM-4.3).
    await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [eventId]);
    const { rows: [existing] } = await client.query(
      `SELECT p.id, p.name, p.parent_phone, p.parent_name, ep.id AS ep_id
       FROM participants p LEFT JOIN event_participants ep ON ep.participant_id = p.id AND ep.event_id = $2
       WHERE p.phone = $1`,
      [phone, eventId],
    );
    if (existing?.ep_id && options.rejectIfRegistered) {
      throw new AppError(409, 'ALREADY_REGISTERED',
        `This phone number is already registered for this event (${existing.name}). Search for ${maskPhone(phone)} instead.`);
    }
    if (!parentPhone && !existing?.parent_phone) {
      throw new AppError(400, 'INVALID_PHONE', 'Enter a valid 10-digit parent phone number.');
    }
    if (!parentName && !existing?.parent_name) {
      throw new AppError(400, 'PARENT_NAME_REQUIRED', 'Enter your parent’s name.');
    }

    const { rows: [person] } = await client.query(
      `INSERT INTO participants (name, phone, parent_phone, school_college, class, location, parent_name)
       VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7)
       ON CONFLICT (phone) DO UPDATE SET
         name = EXCLUDED.name,
         parent_phone = COALESCE(EXCLUDED.parent_phone, participants.parent_phone),
         parent_name = COALESCE(EXCLUDED.parent_name, participants.parent_name),
         school_college = EXCLUDED.school_college,
         class = COALESCE(EXCLUDED.class, participants.class),
         location = COALESCE(EXCLUDED.location, participants.location),
         updated_at = now()
       RETURNING id`,
      [name, phone, parentPhone, v.schoolCollege, className, v.location, parentName],
    );
    const { rows: [ep] } = await client.query(
      `INSERT INTO event_participants (event_id, participant_id, registration_type)
       VALUES ($1, $2, 'walk_in')
       ON CONFLICT (event_id, participant_id) DO UPDATE SET event_id = EXCLUDED.event_id
       RETURNING id`,
      [eventId, person.id],
    );
    if (answers) await saveAnswers(client, ep.id, answers);
    return assignSeatTx(client, ep.id, { expectedEventId: eventId });
  });
  if (result.waiting) throw waitingListError();
  return result;
}

/** Stores the check-in answers (class, stream, lunch) on this event's registration. */
export async function saveAnswers(db: Db, eventParticipantId: number, a: Answers) {
  await db.query(
    `UPDATE event_participants SET grade = $2, stream = $3, study_detail = $4, lunch = $5, answered_at = now() WHERE id = $1`,
    [eventParticipantId, a.grade, a.stream, a.studyDetail, a.lunch],
  );
}
