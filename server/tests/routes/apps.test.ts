import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index.js';

vi.mock('../../src/db/client.js', () => ({
  getApps: vi.fn(),
  getAppById: vi.fn(),
}));

import { getApps, getAppById } from '../../src/db/client.js';

const mockGetApps = getApps as any;
const mockGetAppById = getAppById as any;

describe('GET /api/apps', () => {
  beforeEach(() => {
    mockGetApps.mockClear();
    mockGetAppById.mockClear();
  });

  it('returns array of approved apps', async () => {
    const mockAppsData = [
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
      {
        id: 'weather',
        name: 'Weather',
        description_for_model: 'A weather app',
        iframe_url: 'https://example.com/weather',
        tools: null,
        auth_type: 'none',
        oauth_config: null,
        trust_safety: null,
        sandbox_permissions: null,
        status: 'approved',
        created_at: new Date().toISOString(),
      },
    ];

    mockGetApps.mockResolvedValueOnce(mockAppsData);

    const res = await request(app).get('/api/apps');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockAppsData);
    expect(mockGetApps).toHaveBeenCalled();
  });

  it('returns empty array when no apps found', async () => {
    mockGetApps.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/apps');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/apps/:id', () => {
  beforeEach(() => {
    mockGetApps.mockClear();
    mockGetAppById.mockClear();
  });

  it('returns single app by id', async () => {
    const mockAppData = {
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
    };

    mockGetAppById.mockResolvedValueOnce(mockAppData);

    const res = await request(app).get('/api/apps/chess');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockAppData);
    expect(mockGetAppById).toHaveBeenCalledWith('chess');
  });

  it('returns 404 when app not found', async () => {
    mockGetAppById.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/apps/unknown');

    expect(res.status).toBe(404);
    expect(mockGetAppById).toHaveBeenCalledWith('unknown');
  });
});
