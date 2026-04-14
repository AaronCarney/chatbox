import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Request } from 'express';

export function keyGenerator(req: Request): string {
  return (req as any).user?.uid || req.ip || 'unknown';
}

export const chatLimiter = rateLimit({
  windowMs: 60000,
  max: 20,
  keyGenerator,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: true,
  legacyHeaders: false,
});

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes (burst cap)
  standardHeaders: true,
  legacyHeaders: false,
});

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      frameSrc: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
});
