import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === 'valid-token') return { uid: 'firebase-uid-123', email: 'user@example.com' };
      if (token === 'rejected-token') throw new Error('Token expired');
      throw new Error('Unknown token');
    }),
  })),
}));

vi.mock('../../../src/lib/firebaseAdmin.js', () => ({
  getFirebaseAdmin: vi.fn(() => ({ name: '[DEFAULT]' })),
}));

describe('firebaseAuth middleware (non-blocking)', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
  });

  it('attaches req.user with uid and email on valid token', async () => {
    const { firebaseAuth } = await import('../../../src/middleware/firebaseAuth.js');
    req.headers = { authorization: 'Bearer valid-token' };
    await firebaseAuth(req as Request, res as Response, next);
    expect((req as any).user).toEqual({ uid: 'firebase-uid-123', email: 'user@example.com' });
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() without attaching user when Authorization header is missing', async () => {
    const { firebaseAuth } = await import('../../../src/middleware/firebaseAuth.js');
    await firebaseAuth(req as Request, res as Response, next);
    expect((req as any).user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() without attaching user when token is rejected', async () => {
    const { firebaseAuth } = await import('../../../src/middleware/firebaseAuth.js');
    req.headers = { authorization: 'Bearer rejected-token' };
    await firebaseAuth(req as Request, res as Response, next);
    expect((req as any).user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireSession gate', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
  });

  it('calls next() when req.user is set', async () => {
    const { requireSession } = await import('../../../src/middleware/firebaseAuth.js');
    (req as any).user = { uid: 'firebase-uid-123', email: 'user@example.com' };
    requireSession(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 with "no-session" when req.user is absent', async () => {
    const { requireSession } = await import('../../../src/middleware/firebaseAuth.js');
    requireSession(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized', code: 'no-session' });
    expect(next).not.toHaveBeenCalled();
  });
});
