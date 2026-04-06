import { SessionManager } from './session.js';

const secret = process.env.SESSION_SECRET || 'chatbridge-dev-secret';
if (secret === 'chatbridge-dev-secret' && process.env.NODE_ENV === 'production') {
  console.error('[SECURITY] SESSION_SECRET not set in production — HMAC pseudonyms are predictable');
}

export const sessionManager = new SessionManager({
  secret,
  ttlSeconds: parseInt(process.env.SESSION_TTL || '14400', 10),
});
