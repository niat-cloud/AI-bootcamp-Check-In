import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const useSsl = process.env.DATABASE_SSL !== 'false';

// DATE columns come back as plain 'YYYY-MM-DD' strings rather than JS Dates.
pg.types.setTypeParser(1082, (v) => v);
// NUMERIC → number (only used for small config values).
pg.types.setTypeParser(1700, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  // Serverless (Vercel) runs many small instances: keep each one to a few connections.
  max: process.env.VERCEL ? 3 : 10,
  options: process.env.DATABASE_SCHEMA ? `-c search_path=${process.env.DATABASE_SCHEMA}` : undefined,
});

export type Db = pg.Pool | pg.PoolClient;

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
