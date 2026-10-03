import { createApp } from './app.js';
import { migrate } from './db/migrate.js';

const port = Number(process.env.PORT) || 4000;

const applied = await migrate();
if (applied.length) console.log(`Migrations applied: ${applied.join(', ')}`);

createApp().listen(port, () => {
  console.log(`Event check-in server running on http://localhost:${port}`);
});
