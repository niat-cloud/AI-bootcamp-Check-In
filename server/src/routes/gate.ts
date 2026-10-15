import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { detailsInput, registerAndSeat, searchEvent, waitingListError } from '../services/checkin.js';
import { assignSeatTx, getAssignment } from '../services/seating.js';

/**
 * Gate laptop endpoints, mounted under /api/events/:id/gate behind admin sign-in. Unlike the public
 * page, a volunteer can search by name, so this is only open to the event's own admins.
 */
export const gateRouter = Router({ mergeParams: true });

const eventIdOf = (params: unknown) => Number((params as Record<string, string>).id);

gateRouter.get('/search', async (req, res) => {
  res.json(await searchEvent(eventIdOf(req.params), String(req.query.q ?? '')));
});

gateRouter.get('/participant/:epId', async (req, res) => {
  const id = Number(req.params.epId);
  const { rows: [ep] } = await pool.query(
    'SELECT seat_id FROM event_participants WHERE id = $1 AND event_id = $2',
    [id, eventIdOf(req.params)],
  );
  if (!ep) throw new AppError(404, 'NOT_FOUND', 'Student not found in this event.');
  res.json(await getAssignment(pool, id, Boolean(ep.seat_id)));
});

gateRouter.post('/assign', async (req, res) => {
  const { eventParticipantId } = z.object({ eventParticipantId: z.coerce.number().int() }).parse(req.body);
  const result = await withTransaction((client) =>
    assignSeatTx(client, eventParticipantId, { expectedEventId: eventIdOf(req.params) }));
  if (result.waiting) throw waitingListError();
  res.json(result);
});

gateRouter.post('/walk-in', async (req, res) => {
  const v = detailsInput.extend({ parentPhone: z.string().trim().min(1, 'Parent phone number is required') }).parse(req.body);
  res.status(201).json(await registerAndSeat(eventIdOf(req.params), v, { rejectIfRegistered: true }));
});
