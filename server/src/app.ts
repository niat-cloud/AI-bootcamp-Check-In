import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { pool } from './db/pool.js';
import { AppError } from './lib/errors.js';
import { requireAdminAuth, requireEventAccess, type AuthenticatedRequest } from './lib/auth.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { eventsRouter } from './routes/events.js';
import { gateRouter } from './routes/gate.js';
import { importRouter } from './routes/import.js';
import { platformRouter } from './routes/platform.js';
import { projectsRouter } from './routes/projects.js';
import { publicRouter } from './routes/public.js';

/**
 * One id per request (Vercel's own id when there is one), sent back in `x-request-id` and in error bodies,
 * and one JSON log line per API request, so "a student couldn't check in" can be traced (ARCH-ITEM-1.3).
 */
const requestLog: RequestHandler = (req, res, next) => {
  const vercelId = req.headers['x-vercel-id'];
  const id = (typeof vercelId === 'string' && vercelId) || crypto.randomUUID();
  res.locals.requestId = id;
  res.setHeader('x-request-id', id);
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    if (!req.originalUrl.startsWith('/api') || process.env.LOG_REQUESTS === 'false') return;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const admin = (req as AuthenticatedRequest).adminUser;
    console.log(JSON.stringify({
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      requestId: id, method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Math.round(ms),
      ...(admin ? { adminId: admin.id } : {}),
      ...(res.locals.errorCode ? { code: res.locals.errorCode } : {}),
    }));
  });
  next();
};

/**
 * Security headers (ARCH-ITEM-3.1), written out instead of pulling in a dependency. The CSP allows what
 * the app uses: its own scripts and API, inline styles (React style props), data:/blob: images and the
 * camera stream for the QR scanner, and screenshots of submitted projects from https.
 */
const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  next();
};

// Request bodies: small everywhere, large only for the spreadsheet import (ARCH-ITEM-3.6).
const smallJson = express.json({ limit: '100kb' });
const largeJson = express.json({ limit: '10mb' });
const jsonBody: RequestHandler = (req, res, next) =>
  (/^\/api\/events\/\d+\/import$/.test(req.path) ? largeJson : smallJson)(req, res, next);

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLog);
  app.use(securityHeaders);
  app.use(jsonBody);

  // Reports whether the database answers and which migration it is on (ARCH-ITEM-1.2).
  app.get('/api/health', async (_req, res) => {
    try {
      const { rows: [m] } = await pool.query<{ latest: string | null }>('SELECT max(name) AS latest FROM schema_migrations');
      res.json({ ok: true, db: 'up', migration: m?.latest ?? null });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

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

  // Every error has the same shape: { code, message, requestId } (ARCH-ITEM-5.1).
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const requestId = res.locals.requestId as string | undefined;
    if (err instanceof AppError) {
      res.locals.errorCode = err.code;
      return res.status(err.status).json({ code: err.code, message: err.message, requestId });
    }
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      res.locals.errorCode = 'VALIDATION';
      return res.status(400).json({
        code: 'VALIDATION',
        message: issue ? `${issue.path.join('.') || 'input'}: ${issue.message}` : 'Invalid input',
        field: issue?.path.join('.') || undefined,
        requestId,
      });
    }
    // Body too large or malformed JSON from express.json.
    const status = (err as { status?: number; type?: string }).status;
    if (status === 413 || status === 400) {
      res.locals.errorCode = status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_JSON';
      return res.status(status).json({
        code: res.locals.errorCode, message: status === 413 ? 'The request is too large.' : 'The request could not be read.', requestId,
      });
    }
    console.error(JSON.stringify({ level: 'error', requestId, msg: (err as Error)?.message, stack: (err as Error)?.stack }));
    res.status(500).json({ code: 'SERVER_ERROR', message: `Something went wrong. Please try again. (Ref: ${requestId?.slice(-8) ?? 'n/a'})`, requestId });
  };
  app.use(onError);
  return app;
}
