import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery } from '../__mocks__/pg.js';

vi.mock('pg', () => import('../__mocks__/pg.js'));

import { getApps, getAppById, saveMessage, getMessages } from '../../src/db/client.js';

describe('db/client', () => {
  beforeEach(() => {
    mockQuery.mockClear();
  });

  describe('getApps()', () => {
    it('queries with WHERE status=approved', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'chess',
            name: 'Chess',
            description_for_model: 'A chess app',
            iframe_url: 'https://example.com/chess',
            tools: null,
            auth_type: 'none',
            oauth_config: null,
            trust_safety: null,
            sandbox_permissions: null,
            status: 'approved',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const apps = await getApps();

      expect(mockQuery).toHaveBeenCalledWith(
        "SELECT * FROM apps WHERE status='approved'"
      );
      expect(apps).toHaveLength(1);
      expect(apps[0].id).toBe('chess');
      expect(apps[0].status).toBe('approved');
    });
  });

  describe('getAppById()', () => {
    it('queries with WHERE id=$1 parameterized', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'chess',
            name: 'Chess',
            description_for_model: 'A chess app',
            iframe_url: 'https://example.com/chess',
            tools: null,
            auth_type: 'none',
            oauth_config: null,
            trust_safety: null,
            sandbox_permissions: null,
            status: 'approved',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const app = await getAppById('chess');

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM apps WHERE id=$1',
        ['chess']
      );
      expect(app).not.toBeNull();
      expect(app?.id).toBe('chess');
    });

    it('returns null when app not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const app = await getAppById('nonexistent');

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM apps WHERE id=$1',
        ['nonexistent']
      );
      expect(app).toBeNull();
    });
  });

  describe('chat history', () => {
    it('saveMessage is callable', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(saveMessage('pseudo-123', 'user', 'hello')).resolves.not.toThrow();
    });

    it('getMessages returns array', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            role: 'user',
            content: 'hello',
            tool_call_id: null,
            app_id: null,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const result = await getMessages('pseudo-123');

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
