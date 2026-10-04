import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errors.js';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@niat.edu').trim().toLowerCase();
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || 'admin123').trim();
const AUTH_SECRET = process.env.AUTH_SECRET || 'niat-ai-bootcamp-auth-secret-key-2026';

export function getAdminEmail(): string {
  return ADMIN_EMAIL;
}

export function verifyCredentials(email: string, password: string): boolean {
  if (!email || !password) return false;
  const inputEmail = email.trim().toLowerCase();
  const inputPassword = password.trim();

  // Email comparison
  if (inputEmail !== ADMIN_EMAIL) return false;

  // Constant-time password comparison to prevent timing attacks
  const bufA = Buffer.from(inputPassword);
  const bufB = Buffer.from(ADMIN_PASSWORD);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createToken(email: string): string {
  // Token expires in 7 days
  const payload = JSON.stringify({
    email: email.trim().toLowerCase(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  const b64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(b64Payload).digest('base64url');
  return `${b64Payload}.${signature}`;
}

export function verifyToken(token: string): { email: string } | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64Payload, signature] = parts;

  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(b64Payload).digest('base64url');

  const bufSig = Buffer.from(signature);
  const bufExpected = Buffer.from(expectedSig);
  if (bufSig.length !== bufExpected.length) return null;
  if (!crypto.timingSafeEqual(bufSig, bufExpected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf-8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  adminUser?: { email: string };
}

export function requireAdminAuth(req: Request, _res: Response, next: NextFunction) {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof req.query.token === 'string' && req.query.token.trim()) {
    token = req.query.token.trim();
  }

  if (!token) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required. Please sign in to access admin operations.');
  }

  const verified = verifyToken(token);
  if (!verified) {
    throw new AppError(401, 'TOKEN_EXPIRED', 'Session expired or invalid. Please sign in again.');
  }

  (req as AuthenticatedRequest).adminUser = verified;
  next();
}
