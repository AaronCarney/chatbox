import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

export const chatLimiter = rateLimit({
  windowMs: 60000,
  max: 20,
  keyGenerator: (req) => {
    return (req as any).auth?.userId || req.ip || 'unknown';
  },
  validate: { ipKeyGenerator: false },
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
