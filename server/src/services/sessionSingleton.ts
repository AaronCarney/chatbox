import { SessionManager } from './session.js';

export const sessionManager = new SessionManager({
  secret: process.env.SESSION_SECRET || 'chatbridge-dev-secret',
  ttlSeconds: parseInt(process.env.SESSION_TTL || '14400', 10),
});
