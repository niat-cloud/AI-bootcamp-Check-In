import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { createToken, getAdminEmail, requireAdminAuth, verifyCredentials, type AuthenticatedRequest } from '../lib/auth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const schema = z.object({
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
  });

  const { email, password } = schema.parse(req.body);

  if (!verifyCredentials(email, password)) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const token = createToken(email);
  res.json({
    token,
    email: getAdminEmail(),
  });
});

authRouter.get('/me', requireAdminAuth, (req, res) => {
  const user = (req as AuthenticatedRequest).adminUser;
  res.json({
    authenticated: true,
    email: user?.email || getAdminEmail(),
  });
});

authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true });
});
