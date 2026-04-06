import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { logger } from '../lib/logger.js';

const oauthRouter = Router();

// In-memory token store: maps state -> sessionId and sessionId -> tokens
const tokenStore = new Map<string, { sessionId: string; tokens: { access_token: string; refresh_token: string; expires_in: number } }>();
const sessionTokens = new Map<string, { access_token: string; refresh_token: string; expires_in: number }>();

// GET /api/oauth/spotify/authorize
oauthRouter.get('/oauth/spotify/authorize', (req: Request, res: Response) => {
  const { session_id } = req.query;

  if (!session_id || typeof session_id !== 'string') {
    res.status(400).json({ error: 'Missing session_id' });
    return;
  }

  // Generate random state
  const state = randomBytes(16).toString('hex');

  // Store state -> sessionId mapping
  tokenStore.set(state, { sessionId: session_id, tokens: null as any });

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  const scopes = 'playlist-modify-public playlist-modify-private';

  const authorizeUrl = new URL('https://accounts.spotify.com/authorize');
  authorizeUrl.searchParams.set('client_id', clientId || '');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('redirect_uri', redirectUri || '');
  authorizeUrl.searchParams.set('scope', scopes);
  authorizeUrl.searchParams.set('state', state);

  logger.info({ sessionId: session_id }, 'spotify oauth: authorize redirect');
  res.redirect(302, authorizeUrl.toString());
});

// GET /api/oauth/spotify/callback
oauthRouter.get('/oauth/spotify/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query;

  if (!state || typeof state !== 'string') {
    res.status(400).json({ error: 'Missing state parameter' });
    return;
  }

  // Validate state and recover session_id
  const stateData = tokenStore.get(state);
  if (!stateData) {
    res.status(400).json({ error: 'Invalid state' });
    return;
  }

  const session_id = stateData.sessionId;

  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

    // Create Basic auth header
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Exchange code for tokens
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: redirectUri || ''
      }).toString()
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const tokenData = await response.json();

    // Store tokens keyed by sessionId
    sessionTokens.set(session_id, {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in
    });

    // Clear the state from tokenStore
    tokenStore.delete(state);
    logger.info({ sessionId: session_id }, 'spotify oauth: token exchange complete');

    // Close popup — show fallback message if window.close() is blocked
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1a1a2e;color:#fff">
<div style="text-align:center"><h2>Connected to Spotify!</h2><p>You can close this window.</p></div>
<script>window.close()</script></body></html>`);
  } catch (err) {
    logger.error({ err }, 'spotify oauth: callback failed');
    const errorMessage = err instanceof Error ? err.message : String(err);
    res.setHeader('Content-Type', 'text/html');
    res.status(500).send(`<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1a1a2e;color:#ff6b6b">
<div style="text-align:center"><h2>Spotify Connection Failed</h2><p>${errorMessage.replace(/[<>"'&]/g, '')}</p><p>Close this window and try again.</p></div></body></html>`);
  }
});

// GET /api/oauth/spotify/token
oauthRouter.get('/oauth/spotify/token', (req: Request, res: Response) => {
  const { session_id } = req.query;

  if (!session_id || typeof session_id !== 'string') {
    res.status(400).json({ error: 'Missing session_id' });
    return;
  }

  const hasTokens = sessionTokens.has(session_id);
  res.json({ authenticated: hasTokens });
});

// Export helper function to get token
function getSpotifyToken(sessionId: string): string | null {
  const tokens = sessionTokens.get(sessionId);
  return tokens?.access_token || null;
}

export { oauthRouter, getSpotifyToken };
