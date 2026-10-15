import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { adminOf, eventScope, isSuper, requireSuperAdmin } from '../lib/auth.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { assertSlug, RESERVED_LOCATION_SLUGS, slugify } from '../lib/slug.js';

/** Platform-wide endpoints: locations, admin accounts and the cross-location overview. */
export const platformRouter = Router();

// ---- Locations ----

platformRouter.get('/locations', async (req, res) => {
  const params: unknown[] = [];
  const scope = eventScope(adminOf(req), params, 'l.id');
  const { rows } = await pool.query(
    `SELECT l.id, l.name, l.city, l.state, l.slug, l.is_active AS "isActive",
       (SELECT COUNT(*)::int FROM events e WHERE e.location_id = l.id) AS "eventCount",
       (SELECT COUNT(*)::int FROM events e WHERE e.location_id = l.id AND e.status = 'active') AS "liveCount",
       (SELECT COUNT(*)::int FROM admin_locations al JOIN admin_users a ON a.id = al.admin_id
         WHERE al.location_id = l.id AND a.status = 'approved') AS "adminCount"
     FROM locations l WHERE ${scope} ORDER BY l.name`,
    params,
  );
  res.json(rows);
});

const locationInput = z.object({
  name: z.string().trim().min(2, 'Location name is required').max(80),
  city: z.string().trim().max(80).default(''),
  state: z.string().trim().max(80).default(''),
  slug: z.string().trim().toLowerCase().max(60).optional(),
  isActive: z.boolean().optional(),
});

function locationSlug(v: { name: string; slug?: string }) {
  const slug = assertSlug(v.slug || slugify(v.name), 'The link name');
  if (RESERVED_LOCATION_SLUGS.has(slug)) throw badRequest(`"${slug}" is reserved by the app. Choose another link name.`);
  return slug;
}

const slugTaken = (err: unknown) => (err as { code?: string }).code === '23505'
  ? new AppError(409, 'SLUG_TAKEN', 'Another location already uses this link name.')
  : err;

platformRouter.post('/locations', requireSuperAdmin, async (req, res) => {
  const v = locationInput.parse(req.body);
  const slug = locationSlug(v);
  try {
    const { rows: [loc] } = await pool.query(
      `INSERT INTO locations (name, city, state, slug, is_active) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, city, state, slug, is_active AS "isActive"`,
      [v.name, v.city, v.state, slug, v.isActive ?? true],
    );
    res.status(201).json(loc);
  } catch (err) {
    throw slugTaken(err);
  }
});

platformRouter.patch('/locations/:locationId', requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.locationId);
  const v = locationInput.parse(req.body);
  const slug = locationSlug(v);
  const { rows: [current] } = await pool.query(
    `SELECT slug, EXISTS (SELECT 1 FROM events e WHERE e.location_id = l.id AND e.status = 'active') AS live
     FROM locations l WHERE id = $1`,
    [id],
  );
  if (!current) throw notFound('Location');
  if (slug !== current.slug && current.live) {
    throw new AppError(409, 'LOCATION_LIVE', 'This location has a live event. Its link name cannot change until the event is completed, or the printed QR codes would stop working.');
  }
  try {
    const { rows: [loc] } = await pool.query(
      `UPDATE locations SET name = $2, city = $3, state = $4, slug = $5, is_active = COALESCE($6, is_active)
       WHERE id = $1 RETURNING id, name, city, state, slug, is_active AS "isActive"`,
      [id, v.name, v.city, v.state, slug, v.isActive ?? null],
    );
    res.json(loc);
  } catch (err) {
    throw slugTaken(err);
  }
});

// ---- Admin accounts (super admin only) ----

platformRouter.get('/admins', requireSuperAdmin, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.email, a.name, a.role, a.status, a.request_note AS "requestNote",
       a.created_at AS "createdAt", a.decided_at AS "decidedAt", a.decided_by AS "decidedBy", a.last_login_at AS "lastLoginAt",
       CASE WHEN rl.id IS NULL THEN NULL ELSE json_build_object('id', rl.id, 'name', rl.name) END AS "requestedLocation",
       COALESCE((SELECT json_agg(json_build_object('id', l.id, 'name', l.name) ORDER BY l.name)
         FROM admin_locations al JOIN locations l ON l.id = al.location_id WHERE al.admin_id = a.id), '[]') AS locations
     FROM admin_users a LEFT JOIN locations rl ON rl.id = a.requested_location_id
     ORDER BY (a.status = 'pending') DESC, a.created_at DESC`,
  );
  res.json(rows);
});

platformRouter.patch('/admins/:adminId', requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.adminId);
  const me = adminOf(req);
  const v = z.object({
    status: z.enum(['approved', 'rejected', 'disabled']).optional(),
    role: z.enum(['super_admin', 'location_admin']).optional(),
    locationIds: z.array(z.coerce.number().int().positive()).max(200).optional(),
  }).parse(req.body);
  if (id === me.id && (v.status || v.role)) {
    throw new AppError(409, 'SELF_CHANGE', "You can't change your own role or status.");
  }

  await withTransaction(async (client) => {
    const { rows: [admin] } = await client.query('SELECT id, role, status FROM admin_users WHERE id = $1 FOR UPDATE', [id]);
    if (!admin) throw notFound('Admin');
    const role = v.role ?? admin.role;
    const status = v.status ?? admin.status;

    if (v.locationIds) {
      const unique = [...new Set(v.locationIds)];
      const { rows: found } = await client.query('SELECT id FROM locations WHERE id = ANY($1::int[])', [unique]);
      if (found.length !== unique.length) throw badRequest('One of the chosen locations does not exist.');
      await client.query('DELETE FROM admin_locations WHERE admin_id = $1', [id]);
      if (unique.length) {
        await client.query(
          'INSERT INTO admin_locations (admin_id, location_id) SELECT $1, unnest($2::int[])',
          [id, unique],
        );
      }
    }
    const { rows: [{ count }] } = await client.query('SELECT COUNT(*)::int AS count FROM admin_locations WHERE admin_id = $1', [id]);
    if (role === 'location_admin' && status === 'approved' && count === 0) {
      throw badRequest('Assign at least one location before approving a location admin.');
    }

    await client.query(
      `UPDATE admin_users SET role = $2, status = $3,
         decided_at = CASE WHEN $3 <> status THEN now() ELSE decided_at END,
         decided_by = CASE WHEN $3 <> status THEN $4 ELSE decided_by END
       WHERE id = $1`,
      [id, role, status, me.email],
    );
  });
  res.json({ ok: true });
});

// ---- Overview across locations ----

/** Live and recent events with their numbers, limited to the locations this admin manages. */
platformRouter.get('/overview', async (req, res) => {
  const user = adminOf(req);
  const params: unknown[] = [];
  const scope = eventScope(user, params, 'e.location_id');
  const { rows: events } = await pool.query(
    `SELECT e.id, e.name, e.event_date AS "date", e.event_time AS "time", e.status, e.slug,
       e.expected_students AS "expectedStudents",
       l.id AS "locationId", l.name AS "locationName", l.slug AS "locationSlug",
       COALESCE(c.registered, 0) AS registered, COALESCE(c.walk_ins, 0) AS "walkIns",
       COALESCE(c.seated, 0) AS seated, COALESCE(c.waiting, 0) AS waiting,
       COALESCE(c.recent, 0) AS "recent10Min",
       COALESCE((SELECT SUM(r.capacity) FROM rooms r WHERE r.event_id = e.id AND r.is_active), 0)::int AS capacity
     FROM events e
     LEFT JOIN locations l ON l.id = e.location_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE registration_type = 'existing')::int AS registered,
              COUNT(*) FILTER (WHERE registration_type = 'walk_in')::int AS walk_ins,
              COUNT(*) FILTER (WHERE seat_id IS NOT NULL)::int AS seated,
              COUNT(*) FILTER (WHERE status = 'waiting')::int AS waiting,
              COUNT(*) FILTER (WHERE check_in_time >= now() - interval '10 minutes')::int AS recent
       FROM event_participants ep WHERE ep.event_id = e.id) c ON true
     WHERE ${scope} AND (e.status <> 'completed' OR e.event_date >= current_date - 90)
     ORDER BY (e.status = 'active') DESC, e.event_date DESC, e.id DESC
     LIMIT 300`,
    params,
  );

  const locParams: unknown[] = [];
  const locScope = eventScope(user, locParams, 'l.id');
  const { rows: locations } = await pool.query(
    `SELECT l.id, l.name, l.city, l.state, l.slug, l.is_active AS "isActive",
       COUNT(DISTINCT e.id)::int AS "eventCount",
       COUNT(ep.id) FILTER (WHERE ep.seat_id IS NOT NULL)::int AS "totalSeated",
       COUNT(DISTINCT ep.participant_id)::int AS "uniqueStudents"
     FROM locations l
     LEFT JOIN events e ON e.location_id = l.id
     LEFT JOIN event_participants ep ON ep.event_id = e.id
     WHERE ${locScope} GROUP BY l.id ORDER BY l.name`,
    locParams,
  );

  const pendingAdmins = isSuper(user)
    ? (await pool.query(`SELECT COUNT(*)::int AS n FROM admin_users WHERE status = 'pending'`)).rows[0].n
    : 0;
  res.json({ locations, events, pendingAdmins });
});
