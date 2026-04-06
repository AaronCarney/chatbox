import { logger } from '../lib/logger.js';

const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
const sk = process.env.CLERK_SECRET_KEY || '';
const hasClerkKeys = pk.length > 20 && sk.length > 20;

const passthrough = (_req: any, _res: any, next: any) => next();

let clerkAuth: any = passthrough;
let requireSession: any = passthrough;

if (hasClerkKeys) {
  const { clerkMiddleware, getAuth } = await import('@clerk/express');
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

  clerkAuth = clerkMiddleware({
    authorizedParties: [allowedOrigin],
  });

  requireSession = (req: any, res: any, next: any) => {
    try {
      const auth = getAuth(req);

      if (!auth.isAuthenticated) {
        const hasHeader = !!req.headers.authorization;
        const reason = !hasHeader
          ? 'no-token'
          : 'token-rejected';
        logger.warn({ path: req.path, reason, origin: req.headers.origin }, 'auth rejected');
        res.status(401).json({
          error: 'Unauthenticated',
          reason,
          hint: !hasHeader
            ? 'No Authorization header. Ensure frontend sends Bearer token.'
            : 'Token was sent but rejected. Check key mismatch, expired token, or azp (authorizedParties) mismatch.',
        });
        return;
      }

      (req as any).clerkAuth = auth;
      next();
    } catch (e: any) {
      // getAuth throws if clerkMiddleware didn't run or didn't set req.auth
      logger.error({ path: req.path, err: e.message }, 'auth middleware threw');
      res.status(500).json({
        error: 'Auth middleware error',
        detail: e.message,
      });
    }
  };

  logger.info({ authorizedParties: [allowedOrigin] }, 'Clerk auth enabled');
} else if (process.env.NODE_ENV === 'production') {
  throw new Error('CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are required in production');
} else {
  logger.warn('Clerk keys not configured — auth disabled (dev mode)');
}

export { clerkAuth, requireSession };
