import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { AppError } from './lib/errors.js';
import { requireAdminAuth, requireEventAccess } from './lib/auth.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { eventsRouter } from './routes/events.js';
import { gateRouter } from './routes/gate.js';
import { importRouter } from './routes/import.js';
import { platformRouter } from './routes/platform.js';
import { projectsRouter } from './routes/projects.js';
import { publicRouter } from './routes/public.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Public: event pages opened from the QR code, live events, locations for the access request form.
  app.use('/api/public', publicRouter);

  // Admin sign-in, sign-up and account.
  app.use('/api/admin/auth', authRouter);

  // Everything below needs a signed-in, approved admin.
  app.use('/api/platform', requireAdminAuth, platformRouter);
  // Every /api/events/:id route is limited to events in the admin's own locations.
  app.use('/api/events/:id', requireAdminAuth, requireEventAccess);
  app.use('/api/events/:id/gate', gateRouter);
  app.use('/api/events/:id', importRouter);
  app.use('/api/events/:id', projectsRouter);
  app.use('/api/events/:id', adminRouter);
  app.use('/api/events', requireAdminAuth, eventsRouter);

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
