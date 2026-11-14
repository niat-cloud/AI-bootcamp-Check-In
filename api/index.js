// Vercel serverless entry: every /api/* request is handled by the Express app.
// The server is compiled to server/dist by `npm run build` before functions are bundled.
import { createApp } from '../server/dist/app.js';
import { ensureSchema } from '../server/dist/db/migrate.js';

const app = createApp();

// The first request on each new instance brings the database up to this deploy's migrations, so the code
// never runs against an older schema. Later requests reuse the finished check at no cost.
export default async function handler(req, res) {
  try {
    await ensureSchema();
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ code: 'SCHEMA_UPDATE_FAILED', message: 'The server is updating. Please try again in a moment.' }));
    return;
  }
  return app(req, res);
}
