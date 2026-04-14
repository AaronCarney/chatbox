import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { keyGenerator } from '../../../src/middleware/rateLimit.js';

describe('rateLimit keyGenerator', () => {
  it('uses req.user.uid when present', () => {
    const req = { user: { uid: 'firebase-abc' }, ip: '1.2.3.4' } as unknown as Request;
    expect(keyGenerator(req)).toBe('firebase-abc');
  });
  it('falls back to req.ip when no user', () => {
    const req = { ip: '1.2.3.4' } as unknown as Request;
    expect(keyGenerator(req)).toBe('1.2.3.4');
  });
  it('falls back to "unknown" when no user and no ip', () => {
    const req = {} as unknown as Request;
    expect(keyGenerator(req)).toBe('unknown');
  });
});
