import { Router, type Request } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { maskPhone } from '../lib/phone.js';
import { clientIp, rateLimiter } from '../lib/rateLimit.js';
import { detailsInput, eventNotActiveError, registerAndSeat, requirePhone } from '../services/checkin.js';
import { memberInput, publicRooms, publicTeam, submissionInput, submitProject, verifyMember } from '../services/projects.js';
import { getAssignment } from '../services/seating.js';

/**
 * Public endpoints: the event page students open from the QR code, and the list of live events.
 * Students identify themselves by their own phone number; there is no name search here.
 */
export const publicRouter = Router();

// Phone lookups reveal a name, so they are rate limited per network address. The limits are generous
// because a whole venue on one Wi-Fi (or one mobile carrier's NAT) can share an address during the rush.
const lookupLimit = rateLimiter('lookups', 120, 60 * 1000);
const checkinLimit = rateLimiter('check-ins', 90, 60 * 1000);
const submitLimit = rateLimiter('project submissions', 60, 60 * 1000);

/** Active events, for the home page. */
publicRouter.get('/live', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT e.name, e.event_date AS "date", e.event_time AS "time",
       l.name AS "locationName", l.city, l.state, '/' || l.slug || '/' || e.slug AS "publicPath"
     FROM events e JOIN locations l ON l.id = e.location_id
     WHERE e.status = 'active' AND e.slug IS NOT NULL
     ORDER BY l.name, e.event_date, e.id`,
  );
  res.json(rows);
});

/** Locations an admin can ask to manage when requesting access. */
publicRouter.get('/locations', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, city, state FROM locations WHERE is_active ORDER BY name`,
  );
  res.json(rows);
});

async function findEvent(req: Request) {
  const { location, slug } = req.params as Record<string, string>;
  const { rows: [event] } = await pool.query(
    `SELECT e.id, e.name, e.event_date AS "date", e.event_time AS "time", e.status,
       e.team_name_prefix AS "teamNamePrefix", l.name AS "locationName", l.city, l.state
     FROM events e JOIN locations l ON l.id = e.location_id
     WHERE l.slug = $1 AND e.slug = $2`,
    [String(location).toLowerCase(), String(slug).toLowerCase()],
  );
  if (!event) throw new AppError(404, 'EVENT_NOT_FOUND', "We couldn't find this event. Check the link or scan the QR code again.");
  return event;
}

async function findActiveEvent(req: Request) {
  const event = await findEvent(req);
  if (event.status !== 'active') throw eventNotActiveError(event.status, event.date);
  return event;
}

publicRouter.get('/events/:location/:slug', async (req, res) => {
  const { id: _id, teamNamePrefix: _prefix, ...event } = await findEvent(req);
  res.json(event);
});

/**
 * Step 1: the student types their phone number. Tells the page which step comes next:
 * seated (show the seat), waiting, registered (confirm details), returning (prefilled form) or new.
 */
publicRouter.post('/events/:location/:slug/lookup', async (req, res) => {
  const { phone: raw } = z.object({ phone: z.string().trim().max(20) }).parse(req.body);
  lookupLimit(clientIp(req));
  const event = await findActiveEvent(req);
  const phone = requirePhone(raw);

  const { rows: [row] } = await pool.query(
    `SELECT p.name, p.school_college, p.class, p.location, p.parent_phone IS NOT NULL AS has_parent_phone,
       ep.id AS ep_id, ep.seat_id, ep.status, ep.registration_type
     FROM participants p LEFT JOIN event_participants ep ON ep.participant_id = p.id AND ep.event_id = $2
     WHERE p.phone = $1`,
    [phone, event.id],
  );
  if (!row) return res.json({ state: 'new', phone: maskPhone(phone) });

  if (row.seat_id) return res.json({ state: 'seated', assignment: await getAssignment(pool, row.ep_id, true) });

  const participant = {
    name: row.name,
    schoolCollege: row.school_college,
    className: row.class,
    location: row.location,
    hasParentPhone: row.has_parent_phone,
    phone: maskPhone(phone),
  };
  if (row.status === 'waiting') return res.json({ state: 'waiting', participant });
  res.json({ state: row.ep_id ? 'registered' : 'returning', participant });
});

/** Step 2: the student confirms (or fills in) their details and gets a seat. Safe to repeat. */
publicRouter.post('/events/:location/:slug/checkin', async (req, res) => {
  const v = detailsInput.parse(req.body);
  checkinLimit(clientIp(req));
  const event = await findActiveEvent(req);
  res.json(await registerAndSeat(event.id, v));
});

// ---- Project submission: the page instructors show on the classroom screen at build time ----

/** Rooms and their teams, with which teams have already submitted. */
publicRouter.get('/events/:location/:slug/projects', async (req, res) => {
  const event = await findActiveEvent(req);
  res.json({ rooms: await publicRooms(event.id, event.teamNamePrefix) });
});

/** One team: its members (so students can check it's theirs) and its submission so far. */
publicRouter.get('/events/:location/:slug/projects/teams/:teamId', async (req, res) => {
  const event = await findActiveEvent(req);
  res.json(await publicTeam(event.id, Number(req.params.teamId)));
});

/** "It's me": the student confirms their name with the phone number they checked in with. */
publicRouter.post('/events/:location/:slug/projects/teams/:teamId/verify', async (req, res) => {
  const v = memberInput.parse(req.body);
  lookupLimit(clientIp(req));
  const event = await findActiveEvent(req);
  res.json(await verifyMember(event.id, Number(req.params.teamId), v));
});

/** Submit the team's one project. The member's phone and the link are checked before it is saved. */
publicRouter.post('/events/:location/:slug/projects/teams/:teamId', async (req, res) => {
  const v = submissionInput.parse(req.body);
  submitLimit(clientIp(req));
  const event = await findActiveEvent(req);
  const teamId = Number(req.params.teamId);
  const result = await submitProject(event.id, teamId, v);
  res.json({ ...result, ...(await publicTeam(event.id, teamId)) });
});
