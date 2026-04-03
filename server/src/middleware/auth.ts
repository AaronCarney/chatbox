import { logger } from '../lib/logger.js';

const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
const sk = process.env.CLERK_SECRET_KEY || '';
const hasClerkKeys = pk.length > 20 && sk.length > 20;

const passthrough = (_req: any, _res: any, next: any) => next();

let clerkAuth: any = passthrough;
let requireSession: any = passthrough;

if (hasClerkKeys) {
  const { clerkMiddleware, requireAuth } = await import('@clerk/express');
  clerkAuth = clerkMiddleware();
  requireSession = requireAuth();
  logger.info('Clerk auth middleware enabled');
} else if (process.env.NODE_ENV === 'production') {
  throw new Error('CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are required in production');
} else {
  logger.warn('Clerk keys not configured — auth disabled (dev mode)');
}

export { clerkAuth, requireSession };
