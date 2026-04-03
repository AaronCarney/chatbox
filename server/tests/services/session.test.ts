import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../../src/services/session.js';

describe('SessionManager', () => {
  const secret = 'test-secret-key';
  const ttlSeconds = 3600;
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({ secret, ttlSeconds });
  });

  describe('generatePseudonym', () => {
    it('generates a 16-character hex string', () => {
      const pseudonym = manager.generatePseudonym('user123');
      expect(pseudonym).toMatch(/^[a-f0-9]{16}$/);
    });

    it('is deterministic for same user on same date', () => {
      const userId = 'user123';
      const pseudonym1 = manager.generatePseudonym(userId);
      const pseudonym2 = manager.generatePseudonym(userId);
      expect(pseudonym1).toBe(pseudonym2);
    });

    it('differs for different users on same date', () => {
      const pseudonym1 = manager.generatePseudonym('user1');
      const pseudonym2 = manager.generatePseudonym('user2');
      expect(pseudonym1).not.toBe(pseudonym2);
    });
  });

  describe('generateAppToken', () => {
    it('generates a 32-character hex string', () => {
      const pseudonym = manager.generatePseudonym('user123');
      const token = manager.generateAppToken(pseudonym, 'app-id-1');
      expect(token).toMatch(/^[a-f0-9]{32}$/);
    });

    it('is deterministic for same pseudonym and appId', () => {
      const pseudonym = manager.generatePseudonym('user123');
      const appId = 'app-id-1';
      const token1 = manager.generateAppToken(pseudonym, appId);
      const token2 = manager.generateAppToken(pseudonym, appId);
      expect(token1).toBe(token2);
    });

    it('differs for different appIds with same pseudonym', () => {
      const pseudonym = manager.generatePseudonym('user123');
      const token1 = manager.generateAppToken(pseudonym, 'app-id-1');
      const token2 = manager.generateAppToken(pseudonym, 'app-id-2');
      expect(token1).not.toBe(token2);
    });

    it('differs for same appId with different pseudonyms', () => {
      const pseudonym1 = manager.generatePseudonym('user1');
      const pseudonym2 = manager.generatePseudonym('user2');
      const appId = 'app-id-1';
      const token1 = manager.generateAppToken(pseudonym1, appId);
      const token2 = manager.generateAppToken(pseudonym2, appId);
      expect(token1).not.toBe(token2);
    });
  });

  describe('sessionKey', () => {
    it('returns session: prefixed key', () => {
      const pseudonym = 'abcdef0123456789';
      const key = manager.sessionKey(pseudonym);
      expect(key).toBe('session:abcdef0123456789');
    });
  });
});
