import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index.js';

// Set test environment variables
process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret';
process.env.SPOTIFY_REDIRECT_URI = 'http://localhost:3001/api/oauth/spotify/callback';

describe('GET /api/oauth/spotify/authorize', () => {
  it('returns 302 redirect to accounts.spotify.com', async () => {
    const res = await request(app)
      .get('/api/oauth/spotify/authorize')
      .query({ session_id: 'test-session-123' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBeDefined();
    expect(res.headers.location).toContain('https://accounts.spotify.com/authorize');
    expect(res.headers.location).toContain('client_id=test-client-id');
    expect(res.headers.location).toContain('response_type=code');
    expect(res.headers.location).toContain('state=');
  });

  it('includes correct scopes in redirect', async () => {
    const res = await request(app)
      .get('/api/oauth/spotify/authorize')
      .query({ session_id: 'test-session-123' });

    const location = res.headers.location;
    expect(location).toContain('scope=user-read-private');
    expect(location).toContain('playlist-modify-public');
    expect(location).toContain('playlist-modify-private');
  });

  it('generates random state for each request', async () => {
    const res1 = await request(app)
      .get('/api/oauth/spotify/authorize')
      .query({ session_id: 'session-1' });

    const res2 = await request(app)
      .get('/api/oauth/spotify/authorize')
      .query({ session_id: 'session-2' });

    const state1 = new URL(res1.headers.location).searchParams.get('state');
    const state2 = new URL(res2.headers.location).searchParams.get('state');

    expect(state1).not.toBe(state2);
  });
});

describe('GET /api/oauth/spotify/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exchanges authorization code for tokens', async () => {
    // First, get authorize to create a state
    const authRes = await request(app)
      .get('/api/oauth/spotify/authorize')
      .query({ session_id: 'test-session-123' });

    const location = authRes.headers.location;
    const state = new URL(location).searchParams.get('state');

    // Mock the token exchange
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600
      })
    }));

    const callbackRes = await request(app)
      .get('/api/oauth/spotify/callback')
      .query({
        code: 'auth-code-123',
        state: state,
        session_id: 'test-session-123'
      });

    expect(callbackRes.status).toBe(200);
    expect(callbackRes.text).toContain('<script>');
    expect(callbackRes.text).toContain('window.close()');
  });

  it('validates state before token exchange', async () => {
    const callbackRes = await request(app)
      .get('/api/oauth/spotify/callback')
      .query({
        code: 'auth-code-123',
        state: 'invalid-state',
        session_id: 'test-session-123'
      });

    expect(callbackRes.status).toBe(400);
  });

  it('makes POST request with Basic auth header', async () => {
    const authRes = await request(app)
      .get('/api/oauth/spotify/authorize')
      .query({ session_id: 'test-session-123' });

    const state = new URL(authRes.headers.location).searchParams.get('state');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        expires_in: 3600
      })
    });

    vi.stubGlobal('fetch', mockFetch);

    await request(app)
      .get('/api/oauth/spotify/callback')
      .query({
        code: 'auth-code-123',
        state: state,
        session_id: 'test-session-123'
      });

    expect(mockFetch).toHaveBeenCalled();
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://accounts.spotify.com/api/token');
    expect(callArgs[1].method).toBe('POST');
    expect(callArgs[1].headers.Authorization).toBeDefined();
    expect(callArgs[1].headers.Authorization).toMatch(/^Basic /);
  });
});

describe('GET /api/oauth/spotify/token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { authenticated: false } when no tokens stored', async () => {
    const res = await request(app)
      .get('/api/oauth/spotify/token')
      .query({ session_id: 'unknown-session' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: false });
  });

  it('returns { authenticated: true } when tokens are stored', async () => {
    // First authorize
    const authRes = await request(app)
      .get('/api/oauth/spotify/authorize')
      .query({ session_id: 'test-session-456' });

    const state = new URL(authRes.headers.location).searchParams.get('state');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'mock-token-456',
        refresh_token: 'mock-refresh-456',
        expires_in: 3600
      })
    }));

    // Then callback
    await request(app)
      .get('/api/oauth/spotify/callback')
      .query({
        code: 'code-456',
        state: state,
        session_id: 'test-session-456'
      });

    // Check token endpoint
    const tokenRes = await request(app)
      .get('/api/oauth/spotify/token')
      .query({ session_id: 'test-session-456' });

    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body).toEqual({ authenticated: true });
  });
});
