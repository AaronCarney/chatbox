import { moderateContent, moderateImage } from '../middleware/moderation.js';
import { logger } from './logger.js';

interface SafetyResult {
  safe: boolean;
  categories: string[];
  checkedAt: number;
}

const cache = new Map<string, SafetyResult>();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_CACHE = 2000;

function getCached(key: string): SafetyResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.checkedAt > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function setCache(key: string, result: SafetyResult): void {
  cache.set(key, result);
  if (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

async function fetchLyrics(trackName: string, artistName: string, durationMs?: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({ track_name: trackName, artist_name: artistName });
    if (durationMs) params.set('duration', String(Math.round(durationMs / 1000)));
    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { 'User-Agent': 'ChatBridge/1.0 (K-12 education platform)' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { plainLyrics?: string; syncedLyrics?: string };
    return data.plainLyrics || data.syncedLyrics || null;
  } catch (err) {
    logger.debug({ err, trackName, artistName }, 'lrclib fetch failed');
    return null;
  }
}

async function checkAlbumArt(imageUrl: string): Promise<{ flagged: boolean; categories: string[] }> {
  const cacheKey = `art:${imageUrl}`;
  const cached = getCached(cacheKey);
  if (cached) return { flagged: !cached.safe, categories: cached.categories };

  const result = await moderateImage(imageUrl);
  setCache(cacheKey, { safe: !result.flagged, categories: result.categories, checkedAt: Date.now() });
  return result;
}

async function checkLyrics(trackName: string, artistName: string, durationMs?: number): Promise<{ flagged: boolean; categories: string[] }> {
  const lyrics = await fetchLyrics(trackName, artistName, durationMs);
  if (!lyrics) return { flagged: false, categories: [] };
  return moderateContent(lyrics);
}

async function checkTrackSafety(track: {
  id: string;
  name: string;
  artists: { name: string }[];
  album?: { images?: { url: string }[] };
  duration_ms?: number;
}): Promise<SafetyResult> {
  const cacheKey = `track:${track.id}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const albumArtUrl = track.album?.images?.[0]?.url;
  const artistName = track.artists?.[0]?.name || '';

  const [artResult, lyricsResult] = await Promise.allSettled([
    albumArtUrl
      ? checkAlbumArt(albumArtUrl)
      : Promise.resolve({ flagged: false, categories: [] as string[] }),
    checkLyrics(track.name, artistName, track.duration_ms),
  ]);

  const artFlagged = artResult.status === 'fulfilled' && artResult.value.flagged;
  const lyricsFlagged = lyricsResult.status === 'fulfilled' && lyricsResult.value.flagged;

  const categories = [
    ...(artResult.status === 'fulfilled' && artResult.value.flagged
      ? artResult.value.categories.map(c => `art:${c}`) : []),
    ...(lyricsResult.status === 'fulfilled' && lyricsResult.value.flagged
      ? lyricsResult.value.categories.map(c => `lyrics:${c}`) : []),
  ];

  const result: SafetyResult = {
    safe: !artFlagged && !lyricsFlagged,
    categories,
    checkedAt: Date.now(),
  };

  if (!result.safe) {
    logger.info({ trackId: track.id, trackName: track.name, categories }, 'track flagged by content safety');
  }

  setCache(cacheKey, result);
  return result;
}

export async function filterTracksSafety(tracks: any[]): Promise<any[]> {
  if (tracks.length === 0) return [];
  const results = await Promise.all(tracks.map(t => checkTrackSafety(t)));
  return tracks.filter((_, i) => results[i].safe);
}
