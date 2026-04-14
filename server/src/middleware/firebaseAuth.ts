import type { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdmin } from '../lib/firebaseAdmin.js';
import { logger } from '../lib/logger.js';

export interface AuthenticatedRequest extends Request {
  user?: { uid: string; email?: string };
}

// Non-blocking: attaches req.user if a valid Bearer token is present,
// otherwise calls next() with req.user unset. The 401 gate for protected
// routes is handled by requireSession. This matches Clerk's clerkMiddleware
// semantics, allowing the middleware to be mounted globally without breaking
// public routes (health beacon, OAuth callbacks, Spotify, etc.).
export async function firebaseAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = header.slice('Bearer '.length);
  try {
    const app = getFirebaseAdmin();
    const decoded = await getAuth(app).verifyIdToken(token);
    (req as AuthenticatedRequest).user = { uid: decoded.uid, email: decoded.email };
  } catch (err) {
    logger.debug({ err: (err as Error).message }, 'firebase token rejected');
    // Intentionally do NOT 401 here — match Clerk's non-blocking behavior.
    // requireSession gates protected routes.
  }
  next();
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!(req as AuthenticatedRequest).user) {
    res.status(401).json({ error: 'unauthorized', code: 'no-session' });
    return;
  }
  next();
}
