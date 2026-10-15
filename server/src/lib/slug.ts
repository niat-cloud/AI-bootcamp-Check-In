import type { Db } from '../db/pool.js';
import { badRequest } from './errors.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Paths the app itself uses, so no location can take them as its first URL segment. */
export const RESERVED_LOCATION_SLUGS = new Set(['admin', 'api', 'assets', 'gate', 'e', 'login', 'signup', 'events', 'public']);

/** "Hyderabad – Madhapur!" → "hyderabad-madhapur". */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** "2026-10-18" → "18-oct-2026". */
export function dateSlug(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d}-${MONTHS[m - 1]}-${y}`;
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function assertSlug(slug: string, what: string): string {
  if (!SLUG_PATTERN.test(slug) || slug.length < 2 || slug.length > 60) {
    throw badRequest(`${what} may use only lowercase letters, numbers and single dashes (2–60 characters).`);
  }
  return slug;
}

/**
 * The first free link for an event at a location: `base`, then `base-2`, `base-3`, …
 * `excludeEventId` lets an event keep (or re-derive) its own link when edited.
 */
export async function uniqueEventSlug(db: Db, locationId: number, base: string, excludeEventId?: number): Promise<string> {
  const { rows } = await db.query<{ slug: string }>(
    `SELECT slug FROM events WHERE location_id = $1 AND (slug = $2 OR slug LIKE $2 || '-%') AND id IS DISTINCT FROM $3`,
    [locationId, base, excludeEventId ?? null],
  );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
