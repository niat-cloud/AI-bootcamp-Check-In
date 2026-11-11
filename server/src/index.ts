import { createApp } from './app.js';
import { migrate } from './db/migrate.js';

const port = Number(process.env.PORT) || 4000;

// A dev server pointed at a remote (production) database must not change its schema by accident
// (ARCH-ITEM-1.1). Run `npm run migrate` deliberately for that, or set ALLOW_REMOTE_MIGRATE=1.
const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(process.env.DATABASE_URL ?? '');
if (local || process.env.ALLOW_REMOTE_MIGRATE === '1') {
  const applied = await migrate();
  if (applied.length) console.log(`Migrations applied: ${applied.join(', ')}`);
} else {
  console.log('Remote database: not migrating automatically. Run `npm run migrate` deliberately, or set ALLOW_REMOTE_MIGRATE=1.');
}

createApp().listen(port, () => {
  console.log(`Event check-in server running on http://localhost:${port}`);
});
