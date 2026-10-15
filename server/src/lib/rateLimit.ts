import type { Request } from 'express';
import { AppError } from './errors.js';

/**
 * Small fixed-window limiter kept in memory. On Vercel each instance has its own counters, so this
 * slows down guessing rather than guaranteeing a hard global limit.
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
    if (entry.count > limit) {
      const wait = Math.ceil((entry.resetAt - now) / 1000);
      throw new AppError(429, 'TOO_MANY_REQUESTS', `Too many attempts (${name}). Please wait ${wait} seconds and try again.`);
    }
  };
}

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}
