import { Router, Request, Response } from 'express';
import { getSpotifyToken } from './oauth.js';

const spotifyRouter = Router();

// Helper function to fetch from Spotify API
async function spotifyFetch(
  endpoint: string,
  sessionId: string,
  options?: RequestInit
): Promise<any> {
  const token = getSpotifyToken(sessionId);
  if (!token) {
    throw new Error('Spotify token not found. User must authorize first.');
  }

  const url = `https://api.spotify.com/v1${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// GET /api/spotify/search?q=...&session_id=...
spotifyRouter.get('/spotify/search', async (req: Request, res: Response) => {
  try {
    const { q, session_id } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Missing query parameter: q' });
      return;
    }

    if (!session_id || typeof session_id !== 'string') {
      res.status(400).json({ error: 'Missing query parameter: session_id' });
      return;
    }

    const result = await spotifyFetch(
      `/search?q=${encodeURIComponent(q)}&type=track&limit=10`,
      session_id
    );

    res.json({ tracks: result.tracks.items });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMessage });
  }
});

// POST /api/spotify/playlist
spotifyRouter.post('/spotify/playlist', async (req: Request, res: Response) => {
  try {
    const { name, session_id } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Missing body parameter: name' });
      return;
    }

    if (!session_id || typeof session_id !== 'string') {
      res.status(400).json({ error: 'Missing body parameter: session_id' });
      return;
    }

    // Get user ID
    const meResult = await spotifyFetch('/me', session_id);
    const userId = meResult.id;

    // Create playlist
    const playlistResult = await spotifyFetch(
      `/users/${userId}/playlists`,
      session_id,
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          public: false
        })
      }
    );

    res.json({
      playlist_id: playlistResult.id,
      url: playlistResult.external_urls.spotify
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMessage });
  }
});

// POST /api/spotify/playlist/:id/tracks
spotifyRouter.post('/spotify/playlist/:id/tracks', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { track_ids, session_id } = req.body;

    if (!Array.isArray(track_ids) || track_ids.length === 0) {
      res.status(400).json({ error: 'Missing or invalid body parameter: track_ids (must be non-empty array)' });
      return;
    }

    if (!session_id || typeof session_id !== 'string') {
      res.status(400).json({ error: 'Missing body parameter: session_id' });
      return;
    }

    // Map track IDs to Spotify URIs
    const uris = track_ids.map((trackId: string) => `spotify:track:${trackId}`);

    // Add tracks to playlist
    await spotifyFetch(
      `/playlists/${id}/tracks`,
      session_id,
      {
        method: 'POST',
        body: JSON.stringify({ uris })
      }
    );

    res.json({
      success: true,
      added: track_ids.length
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMessage });
  }
});

// GET /api/spotify/recommendations?seeds=...&session_id=...
spotifyRouter.get('/spotify/recommendations', async (req: Request, res: Response) => {
  try {
    const { seeds, session_id } = req.query;

    if (!seeds || typeof seeds !== 'string') {
      res.status(400).json({ error: 'Missing query parameter: seeds' });
      return;
    }

    if (!session_id || typeof session_id !== 'string') {
      res.status(400).json({ error: 'Missing query parameter: session_id' });
      return;
    }

    const result = await spotifyFetch(
      `/recommendations?seed_tracks=${encodeURIComponent(seeds)}&limit=10`,
      session_id
    );

    res.json({
      tracks: result.tracks.map((track: any) => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map((a: any) => a.name),
        uri: track.uri,
        external_urls: track.external_urls
      }))
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMessage });
  }
});

export { spotifyRouter };
