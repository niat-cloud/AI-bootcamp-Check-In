import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, withTransaction } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Works from both src/ (tsx) and dist/ (compiled): SQL files always live in src/db/migrations.
const migrationsDir = path.resolve(here, '../../src/db/migrations');

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
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
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
