import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';
import type { Request } from 'express';

export const chatLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 20, // 20 requests per windowMs
  keyGenerator: (req: Request) => {
    const authUserId = (req as any).auth?.userId;
    if (authUserId) {
      return authUserId;
    }
    return ipKeyGenerator(req);
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const generalLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 100, // 100 requests per windowMs
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
