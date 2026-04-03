import { createHmac } from 'crypto';

interface SessionManagerConfig {
  secret: string;
  ttlSeconds: number;
}

export class SessionManager {
  private secret: string;
  private ttlSeconds: number;

  constructor(config: SessionManagerConfig) {
    this.secret = config.secret;
    this.ttlSeconds = config.ttlSeconds;
  }

  /**
   * Generate a deterministic pseudonym for a user based on userId and today's date.
   * Returns a 16-character hex string (HMAC-SHA256 hash truncated).
   */
  generatePseudonym(userId: string): string {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const input = `${userId}:${today}`;
    const hash = createHmac('sha256', this.secret)
      .update(input)
      .digest('hex');
    return hash.slice(0, 16);
  }

  /**
   * Generate an app-specific token for a given pseudonym and appId.
   * Returns a 32-character hex string (HMAC-SHA256 hash truncated).
   */
  generateAppToken(pseudonym: string, appId: string): string {
    const input = `${pseudonym}:${appId}`;
    const hash = createHmac('sha256', this.secret)
      .update(input)
      .digest('hex');
    return hash.slice(0, 32);
  }

  /**
   * Return a Redis key for session storage.
   */
  sessionKey(pseudonym: string): string {
    return `session:${pseudonym}`;
  }
}
