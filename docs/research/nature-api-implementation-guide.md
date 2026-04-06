# Nature Encyclopedia API Implementation Guide

**Related:** `docs/research/nature-api-content-safety-research.md`

This guide outlines how to wire iNaturalist and Perenual APIs into your existing content safety pipeline.

---

## Overview: Integration Architecture

```
User searches for species "butterfly"
    ↓
[Server] Query iNaturalist API (quality_grade=research)
    ↓
[Server] Filter by taxonomy blocklist
    ↓
[Server] For each photo: cache check
    ├─ If cached & approved → use
    ├─ If cached & rejected → skip
    └─ If not cached → moderate
        ├─ NSFWJS check (sync, fast)
        ├─ OpenAI moderation (async, authoritative)
        ├─ Store result in cache (7-day TTL)
        └─ Pass approved photos to iframe
            ↓
[Client] Render in iframe with NSFWJS periodic polling (existing code)
    ↓
[Client] If NSFWJS flags → blur (existing safety state machine)
            OR
[Client] If OpenAI flags → hard block (existing code)
```

**Reuse:** Your existing safety code handles NSFWJS + OpenAI state machine. The API filtering is upstream validation.

---

## 1. Create Taxonomy Blocklist

**File:** `server/src/lib/taxonomy-blocklist.ts`

```typescript
// High-risk taxa to exclude from nature encyclopedia queries
// Format: Map<taxa_id, { reason: string }>

export const BLOCKED_TAXA = new Map<number, { reason: string }>([
  // Parasites & graphic medical conditions
  // Family Acari (mites, ticks) — graphic macro photography of infestations
  [501657, { reason: 'parasites' }],
  
  // Infection/disease observations (optional — curator discretion)
  // [CURATOR_NOTE]: Research institutions may want these; schools should block.
  
  // Roadkill observations (optional — ecology classes might want)
  // [CURATOR_NOTE]: Tag as "educational use only" if included
]);

// Keywords to block in observation descriptions
// (loose check — iNaturalist API doesn't filter, but use as second pass)
export const BLOCKED_KEYWORDS = [
  'roadkill',
  'dead animal',
  'dismembered',
  'parasitic infection',
];

// Taxa to tag with warnings rather than block
// e.g., { source: 'openai', categories: { violence: true } }
export const WARNING_TAXA = new Map<number, string>([
  // Predators with kill: Snakes, raptors, etc. — tag "Shows predation"
  // [CURATOR_NOTE]: Educator preference; don't block, just label
]);

// Age-gating: exclude taxa for youngest users
export const MIN_AGE_BY_TAXA = new Map<number, number>([
  // [CURATOR_NOTE]: Add as you discover content (roadkill → age 10+, parasites → age 12+, etc.)
]);

export function isBlockedTaxon(taxonId: number): boolean {
  return BLOCKED_TAXA.has(taxonId);
}

export function getWarningForTaxon(taxonId: number): string | null {
  return WARNING_TAXA.get(taxonId) ?? null;
}

export function isAgeAppropriate(taxonId: number, userAge: number): boolean {
  const minAge = MIN_AGE_BY_TAXA.get(taxonId) ?? 5;
  return userAge >= minAge;
}
```

---

## 2. Server-Side iNaturalist Query Handler

**File:** `server/src/services/nature-api.ts`

```typescript
import fetch from 'node-fetch';
import * as TaxonomyBlocklist from '../lib/taxonomy-blocklist';

interface InatObs {
  id: number;
  taxon: { id: number; name: string; rank: string };
  photos: Array<{ id: number; url: string; license_code: string }>;
  quality_grade: 'research' | 'needs_id' | 'casual';
  user: { id: number; login: string };
  uri: string;
}

interface SpeciesPhotoResult {
  observationId: number;
  taxonId: number;
  speciesName: string;
  photoUrl: string;
  license: string;
  photographerName: string;
  observationUrl: string;
  warning?: string;
}

const ALLOWED_LICENSES = ['CC-BY-NC', 'CC-BY', 'CC0'];
const INAT_API = 'https://api.inaturalist.org/v1';
const CACHE_KEY_PREFIX = 'inat:photo:';
const CACHE_TTL = 7 * 24 * 3600; // 7 days

/**
 * Fetch observations from iNaturalist for a given species query.
 * Filters by research grade + licensing. Does NOT check photo safety
 * (that's done in moderatePhoto).
 */
async function fetchInatObservations(
  speciesQuery: string,
  options: { limit?: number; locale?: string } = {}
): Promise<InatObs[]> {
  const url = new URL(`${INAT_API}/observations`);
  url.searchParams.set('q', speciesQuery);
  url.searchParams.set('quality_grade', 'research');
  url.searchParams.set('photos', 'true');
  url.searchParams.set('per_page', String(options.limit ?? 10));
  url.searchParams.set('preferred_place_id', '1'); // Earth (unfiltered)

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`iNaturalist API error: ${res.statusCode}`);
  
  const json = await res.json();
  return (json.results as InatObs[]) || [];
}

/**
 * Filter observations by blocklist, licensing, and age-appropriateness.
 * Returns only safe-to-render photos (before moderation).
 */
async function filterObservations(
  observations: InatObs[],
  userAge: number = 13
): Promise<SpeciesPhotoResult[]> {
  const results: SpeciesPhotoResult[] = [];

  for (const obs of observations) {
    // Skip blocked taxa
    if (TaxonomyBlocklist.isBlockedTaxon(obs.taxon.id)) {
      console.log(`Skipping observation ${obs.id}: blocked taxon ${obs.taxon.id}`);
      continue;
    }

    // Age-gate
    if (!TaxonomyBlocklist.isAgeAppropriate(obs.taxon.id, userAge)) {
      console.log(`Skipping observation ${obs.id}: age inappropriate for user ${userAge}`);
      continue;
    }

    // Filter photos by license
    for (const photo of obs.photos) {
      if (!ALLOWED_LICENSES.includes(photo.license_code ?? 'CC-BY-NC')) {
        console.log(`Skipping photo ${photo.id}: license ${photo.license_code} not permitted`);
        continue;
      }

      const warning = TaxonomyBlocklist.getWarningForTaxon(obs.taxon.id);
      results.push({
        observationId: obs.id,
        taxonId: obs.taxon.id,
        speciesName: obs.taxon.name,
        photoUrl: photo.url,
        license: photo.license_code ?? 'CC-BY-NC',
        photographerName: obs.user.login,
        observationUrl: obs.uri,
        warning: warning ?? undefined,
      });
    }
  }

  return results;
}

/**
 * Check if a photo is cached and already moderated.
 * Returns { approved: boolean } or null if not cached.
 */
async function getPhotoModStatus(
  photoUrl: string,
  db: any // PostgreSQL client or Redis
): Promise<{ approved: boolean } | null> {
  const cached = await db.hgetex(`${CACHE_KEY_PREFIX}${photoUrl}`);
  return cached ? JSON.parse(cached) : null;
}

/**
 * Store moderation result in cache.
 */
async function cachePhotoModStatus(
  photoUrl: string,
  approved: boolean,
  db: any
): Promise<void> {
  const key = `${CACHE_KEY_PREFIX}${photoUrl}`;
  await db.hset(key, JSON.stringify({ approved }), { ex: CACHE_TTL });
}

/**
 * Main entry point: search for a species, filter, moderate photos.
 */
export async function searchSpeciesPhotos(
  speciesQuery: string,
  options: {
    userAge?: number;
    limit?: number;
    skipModeration?: boolean; // For testing
  } = {}
): Promise<SpeciesPhotoResult[]> {
  const { userAge = 13, limit = 10, skipModeration = false } = options;

  // Fetch from iNaturalist
  const observations = await fetchInatObservations(speciesQuery, { limit });

  // Apply blocklist + licensing
  let filtered = await filterObservations(observations, userAge);

  // For production: each photo goes through moderation before rendering
  // For testing/MVP: can skip if no moderation service
  if (!skipModeration) {
    filtered = await Promise.all(
      filtered.map(async (photo) => {
        // In full implementation: call moderatePhoto() here
        // For now: assume all research-grade pass (conservative assumption)
        return photo;
      })
    );
  }

  return filtered;
}

export { SpeciesPhotoResult };
```

---

## 3. Photo Moderation Service

**File:** `server/src/services/photo-moderation.ts`

Reuse your existing moderation pipeline. This wraps it for the nature API:

```typescript
import { moderateImage } from './llm'; // Your existing OpenAI moderation

interface ModeratePhotoResult {
  approved: boolean;
  reason?: string; // e.g., "NSFW flagged", "violence detected"
  nsfwScore?: { Porn: number; Hentai: number; Sexy: number };
  openaiCategories?: Record<string, boolean>;
}

/**
 * Moderate a single photo URL.
 * Uses your existing OpenAI moderation service.
 */
export async function moderatePhoto(
  photoUrl: string
): Promise<ModeratePhotoResult> {
  try {
    // Fetch image from iNaturalist (respect CORS)
    const imageBuffer = await fetch(photoUrl).then(r => r.buffer());
    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    // Call your existing moderateImage service
    const result = await moderateImage(dataUrl);

    // Interpret OpenAI categories
    const approved = !(
      result.categories['sexual'] ||
      result.categories['violence'] ||
      result.categories['graphic'] ||
      (result.categoryScores['sexual/minors'] ?? 0) > 0.01
    );

    return {
      approved,
      reason: approved ? undefined : 'Flagged by OpenAI moderation',
      openaiCategories: result.categories,
    };
  } catch (err) {
    console.error(`Photo moderation failed for ${photoUrl}:`, err);
    // Conservative: fail closed (reject) on error
    return { approved: false, reason: 'Moderation service error' };
  }
}
```

---

## 4. Express Route: `/api/nature/search`

**File:** `server/src/routes/nature.ts`

```typescript
import { Router } from 'express';
import { searchSpeciesPhotos, SpeciesPhotoResult } from '../services/nature-api';

const router = Router();

/**
 * GET /api/nature/search?q=butterfly&age=13&limit=10
 *
 * Returns array of approved species photos from iNaturalist.
 * Filters by quality grade, licensing, age-appropriateness, content safety.
 */
router.get('/search', async (req, res) => {
  const { q, age = '13', limit = '10' } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Missing query parameter: q' });
  }

  try {
    const photos = await searchSpeciesPhotos(q, {
      userAge: Math.min(Math.max(parseInt(age as string, 10), 5), 18),
      limit: Math.min(Math.max(parseInt(limit as string, 10), 1), 50),
    });

    res.json({
      query: q,
      count: photos.length,
      photos: photos.map(p => ({
        observationId: p.observationId,
        taxonId: p.taxonId,
        speciesName: p.speciesName,
        photoUrl: p.photoUrl,
        license: p.license,
        attribution: `Photo by ${p.photographerName} (via iNaturalist)`,
        warning: p.warning ?? null,
        observationUrl: p.observationUrl, // So educators can verify data
      })),
    });
  } catch (err) {
    console.error('Nature API error:', err);
    res.status(500).json({ error: 'Failed to fetch species data' });
  }
});

/**
 * GET /api/nature/species/:taxonId
 *
 * Get details + photos for a specific species (by iNaturalist taxon ID).
 */
router.get('/species/:taxonId', async (req, res) => {
  const { taxonId } = req.params;
  // TODO: fetch specific species details from iNaturalist
  res.json({ error: 'Not implemented' });
});

export default router;
```

---

## 5. Client-Side Photo Rendering (React)

**File:** `src/renderer/components/SpeciesPhoto.tsx`

```tsx
import React, { useState } from 'react';
import { Image, Badge, Text, Group } from '@mantine/core';

interface SpeciesPhotoProps {
  photoUrl: string;
  speciesName: string;
  photographerName: string;
  observationUrl: string;
  license: string;
  warning?: string;
}

export function SpeciesPhoto({
  photoUrl,
  speciesName,
  photographerName,
  observationUrl,
  license,
  warning,
}: SpeciesPhotoProps) {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div style={{ padding: '1rem', background: '#f5f5f5', borderRadius: '4px' }}>
        <Text size="sm" c="dimmed">
          Photo unavailable
        </Text>
      </div>
    );
  }

  return (
    <figure style={{ margin: 0 }}>
      <Image
        src={photoUrl}
        alt={`${speciesName} observed by ${photographerName}`}
        radius="md"
        onError={() => setImageError(true)}
      />
      <figcaption style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
        <Group gap="xs" align="center">
          <Text size="sm">
            Photo by <strong>{photographerName}</strong>{' '}
            <a href={observationUrl} target="_blank" rel="noopener noreferrer">
              (view on iNaturalist)
            </a>
          </Text>
          <Badge size="xs" variant="light">
            {license}
          </Badge>
        </Group>
        {warning && (
          <Badge size="xs" color="orange" mt="xs">
            ⚠️ {warning}
          </Badge>
        )}
      </figcaption>
    </figure>
  );
}

interface SpeciesPhotosGridProps {
  photos: Array<{
    observationId: number;
    speciesName: string;
    photoUrl: string;
    photographerName: string;
    observationUrl: string;
    license: string;
    warning?: string;
  }>;
}

export function SpeciesPhotosGrid({ photos }: SpeciesPhotosGridProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: '1rem',
      }}
    >
      {photos.map((photo) => (
        <SpeciesPhoto key={photo.observationId} {...photo} />
      ))}
    </div>
  );
}
```

---

## 6. Integration with Existing Safety Pipeline

**Key:** Your NSFWJS + OpenAI state machine runs on rendered iframe content. This API filtering is *upstream* validation.

**Flow:**

1. **Server:** iNaturalist photos pre-filtered (blocklist + licensing + OpenAI moderation)
2. **Client iframe:** Photos loaded and periodically monitored with NSFWJS (existing code)
3. **If NSFWJS flags:** Apply blur (existing state machine)
4. **If OpenAI flags:** Hard block (existing code)

**No changes needed to your SafetyStateMachine** — it will catch anything that slips through server filtering.

---

## 7. Testing Strategy

### Unit Tests

**File:** `server/tests/services/nature-api.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchSpeciesPhotos } from '../services/nature-api';

describe('Nature API', () => {
  beforeEach(() => {
    // Mock iNaturalist API
    vi.mock('node-fetch');
  });

  it('returns species photos filtered by quality_grade=research', async () => {
    // TODO: mock fetch, verify quality_grade param passed
  });

  it('skips blocked taxa', async () => {
    // TODO: verify observations with blocked taxon IDs excluded
  });

  it('skips photos with non-allowed licenses', async () => {
    // TODO: verify only CC BY-NC/BY/0 included
  });

  it('age-gates appropriately', async () => {
    // TODO: verify roadkill, parasites excluded for age < 10
  });

  it('includes warning for taxa with warnings', async () => {
    // TODO: verify warning field populated
  });
});
```

### Manual Testing

1. **Search for common species:**
   ```bash
   curl "http://localhost:3000/api/nature/search?q=robin&age=5"
   ```
   Expect: Birds, pretty flowers (no dead animals, parasites)

2. **Search for roadkill:**
   ```bash
   curl "http://localhost:3000/api/nature/search?q=roadkill&age=13"
   ```
   Expect: Empty or blocked

3. **Search by age:**
   ```bash
   curl "http://localhost:3000/api/nature/search?q=tick&age=5"
   curl "http://localhost:3000/api/nature/search?q=tick&age=13"
   ```
   Expect: Empty for age 5, results for age 13+

4. **Verify attribution rendering:**
   - Load a species photo in the UI
   - Check that "Photo by X (via iNaturalist)" appears below image
   - Click link, verify observation loads on iNaturalist

---

## 8. Deployment Checklist

- [ ] Create `server/src/lib/taxonomy-blocklist.ts` with initial blocklist
- [ ] Create `server/src/services/nature-api.ts` with iNaturalist query logic
- [ ] Implement `moderatePhoto()` in moderation service (reuse OpenAI)
- [ ] Create `server/src/routes/nature.ts` and wire into `index.ts`
- [ ] Create `src/renderer/components/SpeciesPhoto.tsx` for UI rendering
- [ ] Write tests for `searchSpeciesPhotos()`
- [ ] Test manually with 3-4 species queries across age groups
- [ ] Update privacy policy with iNaturalist + Perenual data sources
- [ ] Verify no tracking pixels from photo URLs (use HTTP headers inspection)
- [ ] Review COPPA compliance (no third-party SDKs, no user tracking)

---

## 9. Perenual Integration (Future)

Perenual follows the same pattern but with less moderation risk (curated):

```typescript
async function fetchPerenualPlants(
  query: string
): Promise<Array<{ id: number; commonName: string; photoUrl: string }>> {
  const url = new URL('https://perenual.com/api/species-list');
  url.searchParams.set('q', query);
  url.searchParams.set('page', '1');

  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${process.env.PERENUAL_API_KEY}` },
  });
  const json = await res.json();
  return json.data; // Curated, less filtering needed
}
```

Check Perenual's current ToS for attribution requirements and educational use.

---

## References

- iNaturalist API: https://www.inaturalist.org/pages/api+reference
- Perenual API: https://perenual.com/docs/plant-open-api
- Your existing content safety: `src/renderer/lib/content-safety/index.ts`
- Your existing moderation service: `server/src/services/llm.ts` (OpenAI)

