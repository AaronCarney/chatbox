import { logger } from '../lib/logger.js';

const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
const sk = process.env.CLERK_SECRET_KEY || '';
const hasClerkKeys = pk.length > 20 && sk.length > 20;

const passthrough = (_req: any, _res: any, next: any) => next();

let clerkAuth: any = passthrough;
let requireSession: any = passthrough;

if (hasClerkKeys) {
  const { clerkMiddleware } = await import('@clerk/express');
  clerkAuth = clerkMiddleware();
  // Manual auth check — Clerk's requireAuth() redirects to sign-in page,
  // which breaks API routes (POST becomes GET on redirect, returning 404).
  // For API routes we need a 401 JSON response, not a redirect.
  requireSession = (req: any, res: any, next: any) => {
    if (!req.auth?.userId) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    next();
  };
  logger.info('Clerk auth middleware enabled');
} else if (process.env.NODE_ENV === 'production') {
  throw new Error('CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are required in production');
} else {
  logger.warn('Clerk keys not configured — auth disabled (dev mode)');
}

export { clerkAuth, requireSession };
