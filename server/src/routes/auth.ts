import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import {
  adminOf, createToken, ensureSuperAdmin, hashPassword, requireSignedIn, validatePasswordStrength, verifyPassword,
} from '../lib/auth.js';
import { clientIp, rateLimiter } from '../lib/rateLimit.js';

export const authRouter = Router();

const loginLimit = rateLimiter('sign-in', 10, 10 * 60 * 1000);
const signupLimit = rateLimiter('sign-up', 5, 60 * 60 * 1000);

const email = z.string().trim().toLowerCase().email('Please enter a valid email address').max(200);

/** Everything the admin UI needs to know about the signed-in account. */
async function profile(adminId: number) {
  const { rows: [me] } = await pool.query(
    `SELECT a.id, a.email, a.name, a.role, a.must_change_password AS "mustChangePassword",
       COALESCE(json_agg(json_build_object('id', l.id, 'name', l.name, 'slug', l.slug) ORDER BY l.name)
         FILTER (WHERE l.id IS NOT NULL), '[]') AS locations
     FROM admin_users a
     LEFT JOIN admin_locations al ON al.admin_id = a.id
     LEFT JOIN locations l ON l.id = al.location_id
     WHERE a.id = $1 GROUP BY a.id`,
    [adminId],
  );
  return me;
}

authRouter.post('/login', async (req, res) => {
  const v = z.object({ email, password: z.string().min(1, 'Password is required').max(200) }).parse(req.body);
  loginLimit(`${clientIp(req)}:${v.email}`);
  await ensureSuperAdmin();

  const { rows: [admin] } = await pool.query(
    'SELECT id, password_hash, status FROM admin_users WHERE email = $1',
    [v.email],
  );
  // Same message whether the email or the password is wrong.
  if (!admin || !(await verifyPassword(v.password, admin.password_hash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  if (admin.status === 'pending') {
    throw new AppError(403, 'ACCOUNT_PENDING', 'Your access request is waiting for approval from the super admin.');
  }
  if (admin.status !== 'approved') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This admin account is not active. Contact the super admin.');
  }
  await pool.query('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [admin.id]);
  const me = await profile(admin.id);
  res.json({ token: createToken(admin.id), email: me.email, user: me });
});

/** Request admin access. The account stays pending until the super admin approves it and assigns locations. */
authRouter.post('/signup', async (req, res) => {
  const v = z.object({
    name: z.string().trim().min(2, 'Enter your full name').max(100),
    email,
    password: z.string().max(200),
    locationId: z.coerce.number().int().positive('Choose the location you will manage'),
    note: z.string().trim().max(500).optional(),
  }).parse(req.body);
  signupLimit(clientIp(req));
  const weak = validatePasswordStrength(v.password);
  if (weak) throw new AppError(400, 'WEAK_PASSWORD', weak);

  const { rows: [location] } = await pool.query('SELECT id FROM locations WHERE id = $1 AND is_active', [v.locationId]);
  if (!location) throw new AppError(400, 'BAD_LOCATION', 'Choose one of the listed locations.');

  const { rowCount } = await pool.query(
    `INSERT INTO admin_users (email, name, password_hash, role, status, requested_location_id, request_note)
     VALUES ($1, $2, $3, 'location_admin', 'pending', $4, NULLIF($5, ''))
     ON CONFLICT (email) DO NOTHING`,
    [v.email, v.name, await hashPassword(v.password), v.locationId, v.note ?? ''],
  );
  if (!rowCount) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Sign in instead.');
  res.status(201).json({ ok: true, message: 'Request sent. You can sign in once the super admin approves it.' });
});

authRouter.get('/me', requireSignedIn, async (req, res) => {
  res.json({ authenticated: true, ...(await profile(adminOf(req).id)) });
});

authRouter.post('/change-password', requireSignedIn, async (req, res) => {
  const v = z.object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: z.string().max(200) }).parse(req.body);
  const user = adminOf(req);
  loginLimit(`${clientIp(req)}:${user.email}`);
  const { rows: [admin] } = await pool.query('SELECT password_hash FROM admin_users WHERE id = $1', [user.id]);
  if (!(await verifyPassword(v.currentPassword, admin.password_hash))) {
    throw new AppError(400, 'INVALID_CREDENTIALS', 'Your current password is incorrect.');
  }
  const weak = validatePasswordStrength(v.newPassword);
  if (weak) throw new AppError(400, 'WEAK_PASSWORD', weak);
  if (v.newPassword === v.currentPassword) throw new AppError(400, 'WEAK_PASSWORD', 'Choose a password different from the current one.');
  await pool.query(
    'UPDATE admin_users SET password_hash = $2, must_change_password = false WHERE id = $1',
    [user.id, await hashPassword(v.newPassword)],
  );
  res.json({ ok: true, user: await profile(user.id) });
});

authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true });
});
