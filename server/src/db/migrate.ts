import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, withTransaction } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// The build copies the SQL next to the compiled code (dist/db/migrations), so the Vercel function bundle
// carries it; from src/ (tsx) they are right here too. The second path covers an older build.
const migrationsDir = [path.resolve(here, 'migrations'), path.resolve(here, '../../src/db/migrations')].find((d) => existsSync(d))
  ?? path.resolve(here, 'migrations');

/** Any number that is ours alone: every migrating instance takes this lock, so they apply one at a time. */
const MIGRATION_LOCK = 724_310_013;

/**
 * Applies every migration not yet in schema_migrations, in file order, each in its own transaction.
 * Safe to run from several server instances at once: each migration takes a transaction-level advisory
 * lock and re-checks whether another instance already applied it (works through Supabase's transaction
 * pooler, where session locks would not).
 */
export async function migrate(): Promise<string[]> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    const ran = await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
      const { rowCount } = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (rowCount) return false; // another instance got here first
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      return true;
    });
    if (ran) applied.push(file);
  }
  return applied;
}

let schemaReady: Promise<void> | null = null;

/**
 * On Vercel, brings the database up to this deploy's migrations before the first request is served, so a
 * deploy can never run against an older schema (ARCH-ITEM-1.1). Runs once per server instance; a failure
 * is retried on the next request. Set AUTO_MIGRATE=false to turn it off.
 * Migrations must stay additive (new tables, columns, indexes): the previous deploy may still be serving.
 */
export function ensureSchema(): Promise<void> {
  if (!process.env.VERCEL || process.env.AUTO_MIGRATE === 'false') return Promise.resolve();
  schemaReady ??= migrate().then(
    (applied) => {
      if (applied.length) console.log(JSON.stringify({ level: 'info', msg: 'migrations applied', applied }));
    },
    (err) => {
      schemaReady = null;
      console.error(JSON.stringify({ level: 'error', msg: 'auto-migrate failed', error: (err as Error).message }));
      throw err;
    },
  );
  return schemaReady;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate()
    .then((applied) => {
      console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
