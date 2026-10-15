import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { AppError } from './errors.js';

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

// Without AUTH_SECRET, tokens are signed with a key derived from DATABASE_URL: secret, always present,
// and never in the repository (a hard-coded fallback would let anyone with the code forge a login).
const AUTH_SECRET = process.env.AUTH_SECRET
  || crypto.createHash('sha256').update(`auth-token:${process.env.DATABASE_URL ?? ''}`).digest('hex');

const DEFAULT_SUPER_EMAIL = 'admin@niat.edu';
const DEFAULT_SUPER_PASSWORD = 'admin123';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AdminRole = 'super_admin' | 'location_admin';

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: AdminRole;
  locationIds: number[];
  mustChangePassword: boolean;
}

export interface AuthenticatedRequest extends Request {
  adminUser?: AdminUser;
}

// ---- Passwords ----

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain letters and numbers.';
  return null;
}

/** The credentials that create the first super admin (from the environment, else the documented default). */
export function superAdminSeed() {
  const email = (process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || DEFAULT_SUPER_EMAIL).trim().toLowerCase();
  const password = (process.env.SUPER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || DEFAULT_SUPER_PASSWORD).trim();
  return { email, password, isDefaultPassword: password === DEFAULT_SUPER_PASSWORD };
}

/** Create the platform's super admin the first time anyone signs in, if there is none yet. */
export async function ensureSuperAdmin(): Promise<void> {
  const { rows: [existing] } = await pool.query(`SELECT 1 FROM admin_users WHERE role = 'super_admin' LIMIT 1`);
  if (existing) return;
  const seed = superAdminSeed();
  await pool.query(
    `INSERT INTO admin_users (email, name, password_hash, role, status, must_change_password, decided_at, decided_by)
     VALUES ($1, 'Super Admin', $2, 'super_admin', 'approved', $3, now(), 'system')
     ON CONFLICT (email) DO NOTHING`,
    [seed.email, await hashPassword(seed.password), seed.isDefaultPassword],
  );
}

// ---- Tokens ----

const sign = (payload: string) => crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');

export function createToken(adminId: number): string {
  const payload = Buffer.from(JSON.stringify({ sub: adminId, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string): { adminId: number } | null {
  if (!token || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!Number.isInteger(data.sub) || !data.exp || Date.now() > data.exp) return null;
    return { adminId: data.sub };
  } catch {
    return null;
  }
}

// ---- Loading the signed-in admin ----

export async function loadAdmin(adminId: number): Promise<(AdminUser & { status: string }) | null> {
  const { rows: [row] } = await pool.query(
    `SELECT a.id, a.email, a.name, a.role, a.status, a.must_change_password AS "mustChangePassword",
       COALESCE(array_agg(al.location_id ORDER BY al.location_id) FILTER (WHERE al.location_id IS NOT NULL), '{}') AS "locationIds"
     FROM admin_users a LEFT JOIN admin_locations al ON al.admin_id = a.id
     WHERE a.id = $1 GROUP BY a.id`,
    [adminId],
  );
  return row ?? null;
}

function tokenFrom(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  // File downloads (export) open in a new tab and cannot send headers.
  if (typeof req.query.token === 'string' && req.query.token.trim()) return req.query.token.trim();
  return undefined;
}

/** Signs the admin in from the token. The account is re-read every request, so disabling it takes effect at once. */
async function authenticate(req: Request, allowPendingPasswordChange: boolean) {
  if ((req as AuthenticatedRequest).adminUser) return; // already checked by an outer mount
  const token = tokenFrom(req);
  if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required. Please sign in to access admin operations.');
  const verified = verifyToken(token);
  if (!verified) throw new AppError(401, 'TOKEN_EXPIRED', 'Session expired or invalid. Please sign in again.');
  const admin = await loadAdmin(verified.adminId);
  if (!admin || admin.status !== 'approved') {
    throw new AppError(401, 'ACCOUNT_DISABLED', 'This admin account is not active. Contact the super admin.');
  }
  if (admin.mustChangePassword && !allowPendingPasswordChange) {
    throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Please set a new password before continuing.');
  }
  const { status: _status, ...user } = admin;
  (req as AuthenticatedRequest).adminUser = user;
}

export async function requireAdminAuth(req: Request, _res: Response, next: NextFunction) {
  await authenticate(req, false);
  next();
}

/** For the account endpoints themselves (who am I, change password), which must work before the first change. */
export async function requireSignedIn(req: Request, _res: Response, next: NextFunction) {
  await authenticate(req, true);
  next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (adminOf(req).role !== 'super_admin') throw new AppError(403, 'FORBIDDEN', 'Only the super admin can do this.');
  next();
}

export const adminOf = (req: Request): AdminUser => {
  const user = (req as AuthenticatedRequest).adminUser;
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
  return user;
};

export const isSuper = (user: AdminUser) => user.role === 'super_admin';

export function canAccessLocation(user: AdminUser, locationId: number | null | undefined): boolean {
  if (isSuper(user)) return true;
  return locationId != null && user.locationIds.includes(locationId);
}

/**
 * Guards every /api/events/:id route: a location admin may only touch events of their own locations.
 * Answers 404 rather than 403 so other locations' event ids are not revealed.
 */
export async function requireEventAccess(req: Request, _res: Response, next: NextFunction) {
  const raw = (req.params as Record<string, string>).id;
  if (!/^\d+$/.test(raw ?? '')) return next(); // e.g. /api/events/current
  const user = adminOf(req);
  if (isSuper(user)) return next();
  const { rows: [event] } = await pool.query('SELECT location_id FROM events WHERE id = $1', [Number(raw)]);
  if (event && !canAccessLocation(user, event.location_id)) throw new AppError(404, 'NOT_FOUND', 'Event not found');
  next();
}

/** SQL filter for "events this admin may see". Appends its parameter to `params`. */
export function eventScope(user: AdminUser, params: unknown[], column = 'location_id'): string {
  if (isSuper(user)) return 'true';
  params.push(user.locationIds);
  return `${column} = ANY($${params.length}::int[])`;
}
