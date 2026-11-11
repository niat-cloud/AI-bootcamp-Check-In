import type { Request } from 'express';
import { pool } from '../db/pool.js';
import { AppError } from './errors.js';

const tooMany = (name: string, wait: number) =>
  new AppError(429, 'TOO_MANY_REQUESTS', `Too many attempts (${name}). Please wait ${wait} seconds and try again.`);

/**
 * Small fixed-window limiter kept in memory. On Vercel each instance has its own counters, so this
 * slows down guessing rather than guaranteeing a hard global limit. Used on the student pages, where an
 * extra database round trip per tap would slow every check-in.
 */
export function rateLimiter(name: string, limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string) => {
    const now = Date.now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    entry.count += 1;
    if (entry.count > limit) throw tooMany(name, Math.ceil((entry.resetAt - now) / 1000));
  };
}

/**
 * A limiter every server instance shares, counted in the database in one statement (ARCH-ITEM-3.3).
 * For sign-in and sign-up, where a real limit matters more than one round trip. The in-memory limiter
 * runs first so a flood from one address never reaches the database.
 */
export function sharedRateLimiter(name: string, limit: number, windowMs: number) {
  const local = rateLimiter(name, limit, windowMs);
  return async (key: string) => {
    local(key);
    const { rows: [row] } = await pool.query<{ count: number; wait: number }>(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES ($1, 1, now() + make_interval(secs => $2))
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at <= now() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
       RETURNING count, CEIL(EXTRACT(EPOCH FROM reset_at - now()))::int AS wait`,
      [`${name}:${key}`, windowMs / 1000],
    );
    if (row.count > limit) throw tooMany(name, Math.max(1, row.wait));
    // Now and then, clear windows that ended, so the table stays small.
    if (Math.random() < 0.01) pool.query('DELETE FROM rate_limits WHERE reset_at < now()').catch(() => {});
  };
}

/**
 * The caller's address. On Vercel `x-real-ip` is set by the platform and can't be forged by the client,
 * so it wins there (ARCH-ITEM-3.6). Anywhere else that header is just client input and is ignored.
 */
export function clientIp(req: Request): string {
  const real = req.headers['x-real-ip'];
  if (process.env.VERCEL && typeof real === 'string' && real.trim()) return real.trim();
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}
