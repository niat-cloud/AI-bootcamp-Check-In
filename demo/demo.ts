/**
 * Local demo environment: a private Postgres on this computer, filled with a demo event of 100 people.
 * Nothing here touches the live (Supabase) database, so the demo never appears on the public site.
 *
 *   npm run demo         start the local database + the app (http://localhost:5180), seeding it the first time
 *   npm run demo:reset   wipe the local database and seed a fresh demo event
 *
 * Data lives in .demo-db/ (git-ignored). Delete that folder to remove everything.
 */
import { existsSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.demo-db');
const PORT = 5433;
const DB = 'demo';
// Own ports, so the demo can run next to a normal `npm run dev` (4000/5173) without the two mixing.
const API_PORT = '4100';
const CLIENT_PORT = '5180';

export const DEMO_ADMIN = { email: 'demo@local.test', password: 'demo12345' };

const demoEnv = {
  DATABASE_URL: `postgres://postgres:demo@localhost:${PORT}/${DB}`,
  DATABASE_SSL: 'false',
  DATABASE_SCHEMA: '',
  SUPER_ADMIN_EMAIL: DEMO_ADMIN.email,
  SUPER_ADMIN_PASSWORD: DEMO_ADMIN.password,
  AUTH_SECRET: 'local-demo-only-secret',
  PORT: API_PORT,
  API_PORT,
  CLIENT_PORT,
};

async function startDb(fresh: boolean) {
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, port: PORT, user: 'postgres', password: 'demo', persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: (m) => { if (process.env.DEMO_DB_LOG) console.log(m); }, onError: (m) => { if (process.env.DEMO_DB_LOG) console.error(m); } });
  const firstRun = !existsSync(path.join(dataDir, 'PG_VERSION'));
  if (firstRun) await pg.initialise();
  if (await portInUse(PORT)) {
    if (await portInUse(Number(CLIENT_PORT))) {
      throw new Error(`The demo is already running: open http://localhost:${CLIENT_PORT}, or stop it with Ctrl+C in its window first.`);
    }
    // The database is up but the app isn't: left behind by a demo window that was closed abruptly.
    killLeftoverPostgres();
    await new Promise((r) => setTimeout(r, 1500));
  }
  try {
    await pg.start();
  } catch {
    // Usually a Postgres left behind by a demo that was closed abruptly: stop it and try once more.
    killLeftoverPostgres();
    try {
      await pg.start();
    } catch {
      throw new Error('The demo database could not start. Close other demo windows and try again; run with DEMO_DB_LOG=1 to see why.');
    }
  }
  if (fresh && !firstRun) await pg.dropDatabase(DB);
  let created = false;
  try {
    await pg.createDatabase(DB);
    created = true;
  } catch {
    // Already exists.
  }
  return { pg, created };
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

/** Stops Postgres processes started from this project's embedded-postgres binaries (never any other Postgres). */
function killLeftoverPostgres() {
  if (process.platform !== 'win32') return;
  const script = `Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" | Where-Object { $_.CommandLine -like '*embedded-postgres*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { stdio: 'ignore' });
  } catch {
    // Nothing to stop.
  }
}

async function seed() {
  // The server modules read DATABASE_URL when imported, so set the local values first.
  Object.assign(process.env, demoEnv);
  const { seedDemo } = await import('./seed.js');
  await seedDemo(path.join(root, 'demo', 'participants-100.xlsx'));
}

async function main() {
  const command = process.argv[2] ?? 'start';
  const { pg, created } = await startDb(command === 'reset');
  const stop = async () => {
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  try {
    if (created || command === 'seed' || command === 'reset') await seed();
  } catch (err) {
    console.error('Demo seed failed:', err instanceof Error ? err.message : err);
    await pg.stop().catch(() => {});
    process.exit(1);
  }
  if (command !== 'start') {
    await pg.stop();
    return;
  }

  console.log(`\nDemo admin login: ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}`);
  console.log(`Starting the app on http://localhost:${CLIENT_PORT} (Ctrl+C stops the app and the demo database)\n`);
  // Values already in the environment win over ../.env, so the app talks to the local database only.
  const app = spawn('npm', ['run', 'dev'], { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, ...demoEnv } });
  app.on('exit', stop);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
