import type { Request } from 'express';
import { pool, type Db } from '../db/pool.js';
import { adminOf } from './auth.js';

/**
 * Records an admin action that changes data (ARCH-ITEM-3.4). Never fails the request: an audit write that
 * errors is logged and skipped, because losing a log line is better than losing the admin's change.
 */
export async function audit(
  req: Request,
  action: string,
  opts: { eventId?: number | null; target?: string | number | null; details?: unknown; db?: Db } = {},
) {
  const admin = adminOf(req);
  try {
    await (opts.db ?? pool).query(
      `INSERT INTO admin_audit (admin_id, admin_email, event_id, action, target, details) VALUES ($1, $2, $3, $4, $5, $6)`,
      [admin.id, admin.email, opts.eventId ?? null, action, opts.target == null ? null : String(opts.target),
        opts.details === undefined ? null : JSON.stringify(opts.details)],
    );
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', msg: 'audit write failed', action, error: (err as Error).message }));
  }
}
