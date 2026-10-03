import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { AppError } from './lib/errors.js';
import { adminRouter } from './routes/admin.js';
import { checkinRouter } from './routes/checkin.js';
import { eventsRouter } from './routes/events.js';
import { importRouter } from './routes/import.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/checkin', checkinRouter);
  app.use('/api/events/:id', importRouter);
  app.use('/api/events/:id', adminRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api', (_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Unknown API route' }));

  // In production, serve the built React app.
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ code: err.code, message: err.message });
    }
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      return res.status(400).json({ code: 'VALIDATION', message: issue ? `${issue.path.join('.') || 'input'}: ${issue.message}` : 'Invalid input' });
    }
    console.error(err);
    res.status(500).json({ code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' });
  };
  app.use(onError);
  return app;
}
