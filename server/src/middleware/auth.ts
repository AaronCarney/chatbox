import { logger } from '../lib/logger.js';

const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
const sk = process.env.CLERK_SECRET_KEY || '';
const hasClerkKeys = pk.length > 20 && sk.length > 20;

const passthrough = (_req: any, _res: any, next: any) => next();

let clerkAuth: any = passthrough;
let requireSession: any = passthrough;

if (hasClerkKeys) {
  const { clerkMiddleware, getAuth } = await import('@clerk/express');
  // authorizedParties tells Clerk which origins can issue JWTs.
  // Without this, cross-origin tokens (Vercel frontend → Railway backend)
  // are silently rejected because the JWT's azp claim doesn't match.
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
  clerkAuth = clerkMiddleware({
    authorizedParties: [allowedOrigin],
  });
  // Manual auth gate — Clerk's requireAuth() redirects to sign-in page,
  // which breaks API routes (POST becomes GET on redirect → 404).
  // API routes need a 401 JSON response, not a redirect.
  // NOTE: In @clerk/express v2, req.auth is a FUNCTION, not an object.
  // Must use getAuth(req) to get { userId, sessionId, ... }.
  requireSession = (req: any, res: any, next: any) => {
    const auth = getAuth(req);
    if (!auth?.userId) {
      logger.warn({ path: req.path, hasAuthHeader: !!req.headers.authorization }, 'auth rejected');
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    // Attach for downstream handlers
    (req as any).clerkAuth = auth;
    next();
  };
  logger.info({ authorizedParties: [allowedOrigin] }, 'Clerk auth middleware enabled');
} else if (process.env.NODE_ENV === 'production') {
  throw new Error('CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are required in production');
} else {
  logger.warn('Clerk keys not configured — auth disabled (dev mode)');
}

export { clerkAuth, requireSession };
