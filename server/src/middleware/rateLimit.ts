import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

export const chatLimiter = rateLimit({
  windowMs: 60000,
  max: 20,
  keyGenerator: (req) => {
    return (req as any).auth?.userId || req.ip || 'unknown';
  },
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
