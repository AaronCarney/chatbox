import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules that require API keys before any imports
vi.mock('../../src/services/llm.js', () => ({
  buildMessages: vi.fn(() => []),
  streamChat: vi.fn(async function* () {}),
}));

vi.mock('../../src/middleware/moderation.js', () => ({
  moderationMiddleware: () => (req: any, res: any, next: any) => next(),
}));

vi.mock('../../src/lib/content-safety.js', () => ({
  filterTracksSafety: vi.fn(async (tracks: any[]) => tracks),
}));

vi.mock('../../src/db/seed.js', () => ({
  seed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/db/client.js', () => ({
  getApps: vi.fn().mockResolvedValue([]),
  getAppById: vi.fn().mockResolvedValue(null),
  query: vi.fn().mockResolvedValue({ rows: [] }),
  saveMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/langfuse.js', () => ({
  langfuse: null,
}));

import request from 'supertest';
import { app } from '../../src/index.js';

// Mock global fetch for iNaturalist/Perenual API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeInatTaxaResponse(taxa: any[]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ results: taxa, total_results: taxa.length }),
  };
}

function makeInatObsResponse(observations: any[]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ results: observations, total_results: observations.length }),
  };
}

function makeErrorResponse(status: number) {
  return { ok: false, status, json: () => Promise.resolve({ error: 'API error' }) };
}

const MOCK_TAXON = {
  id: 48460,
  name: 'Danaus plexippus',
  preferred_common_name: 'Monarch Butterfly',
  iconic_taxon_name: 'Animalia',
  default_photo: {
    medium_url: 'https://example.com/monarch.jpg',
    license_code: 'cc-by-nc',
  },
  conservation_status: { status: 'LC' },
};

const MOCK_TAXON_DETAIL = {
  ...MOCK_TAXON,
  wikipedia_summary: 'The monarch butterfly is a milkweed butterfly.',
  rank: 'species',
  ancestors: [
    { rank: 'kingdom', name: 'Animalia' },
    { rank: 'phylum', name: 'Arthropoda' },
    { rank: 'class', name: 'Insecta' },
    { rank: 'order', name: 'Lepidoptera' },
    { rank: 'family', name: 'Nymphalidae' },
    { rank: 'genus', name: 'Danaus' },
  ],
  taxon_photos: [
    { photo: { medium_url: 'https://example.com/monarch1.jpg', license_code: 'cc-by-nc', attribution: 'user123' } },
    { photo: { medium_url: 'https://example.com/monarch2.jpg', license_code: 'cc-by', attribution: 'user456' } },
    { photo: { medium_url: 'https://example.com/monarch3.jpg', license_code: 'all-rights-reserved', attribution: 'user789' } },
  ],
};

const MOCK_PLANT_TAXON = {
  id: 47126,
  name: 'Quercus robur',
  preferred_common_name: 'English Oak',
  iconic_taxon_name: 'Plantae',
  default_photo: { medium_url: 'https://example.com/oak.jpg', license_code: 'cc-by' },
  conservation_status: null,
};

const BLOCKED_TAXON = {
  id: 99999,
  name: 'roadkill specimen',
  preferred_common_name: 'roadkill observation',
  iconic_taxon_name: 'Animalia',
  default_photo: { medium_url: 'https://example.com/bad.jpg', license_code: 'cc-by-nc' },
  conservation_status: null,
};

const RESTRICTED_LICENSE_TAXON = {
  id: 88888,
  name: 'Felis catus',
  preferred_common_name: 'Domestic Cat',
  iconic_taxon_name: 'Animalia',
  default_photo: { medium_url: 'https://example.com/cat.jpg', license_code: 'all-rights-reserved' },
  conservation_status: { status: 'LC' },
};

describe('Nature API routes', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.PERENUAL_API_KEY;
  });

  describe('GET /api/nature/search', () => {
    it('returns normalized species from iNaturalist', async () => {
      mockFetch.mockResolvedValueOnce(makeInatTaxaResponse([MOCK_TAXON, MOCK_PLANT_TAXON]));

      const res = await request(app).get('/api/nature/search?q=butterfly');

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0]).toEqual({
        id: 'inat:48460',
        common_name: 'Monarch Butterfly',
        scientific_name: 'Danaus plexippus',
        type: 'animal',
        image_url: 'https://example.com/monarch.jpg',
        iucn_status: 'LC',
      });
      expect(res.body.results[1].type).toBe('plant');
    });

    it('returns 400 when q is missing', async () => {
      const res = await request(app).get('/api/nature/search');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing query parameter/);
    });

    it('filters by type=animal', async () => {
      mockFetch.mockResolvedValueOnce(makeInatTaxaResponse([MOCK_TAXON, MOCK_PLANT_TAXON]));

      const res = await request(app).get('/api/nature/search?q=test&type=animal');

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].type).toBe('animal');
    });

    it('filters by type=plant', async () => {
      mockFetch.mockResolvedValueOnce(makeInatTaxaResponse([MOCK_TAXON, MOCK_PLANT_TAXON]));

      const res = await request(app).get('/api/nature/search?q=test&type=plant');

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].type).toBe('plant');
    });

    it('excludes blocked content', async () => {
      mockFetch.mockResolvedValueOnce(makeInatTaxaResponse([MOCK_TAXON, BLOCKED_TAXON]));

      const res = await request(app).get('/api/nature/search?q=test');

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].common_name).toBe('Monarch Butterfly');
    });

    it('excludes non-CC licensed photos', async () => {
      mockFetch.mockResolvedValueOnce(makeInatTaxaResponse([MOCK_TAXON, RESTRICTED_LICENSE_TAXON]));

      const res = await request(app).get('/api/nature/search?q=test');

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].common_name).toBe('Monarch Butterfly');
    });

    it('returns 500 on iNaturalist API failure', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(503));

      const res = await request(app).get('/api/nature/search?q=butterfly');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/nature/species/:id', () => {
    it('returns species detail with taxonomy', async () => {
      mockFetch.mockResolvedValueOnce(makeInatTaxaResponse([MOCK_TAXON_DETAIL]));

      const res = await request(app).get('/api/nature/species/inat:48460');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('inat:48460');
      expect(res.body.common_name).toBe('Monarch Butterfly');
      expect(res.body.scientific_name).toBe('Danaus plexippus');
      expect(res.body.taxonomy.kingdom).toBe('Animalia');
      expect(res.body.taxonomy.class).toBe('Insecta');
      expect(res.body.taxonomy.species).toBe('Danaus plexippus');
      expect(res.body.description).toContain('milkweed butterfly');
    });

    it('filters images by license', async () => {
      mockFetch.mockResolvedValueOnce(makeInatTaxaResponse([MOCK_TAXON_DETAIL]));

      const res = await request(app).get('/api/nature/species/inat:48460');

      // 3 photos, but one is all-rights-reserved → should get 2
      expect(res.body.images).toHaveLength(2);
      expect(res.body.images[0].credit).toBe('user123');
      expect(res.body.images[1].credit).toBe('user456');
    });

    it('returns 400 for invalid id format', async () => {
      const res = await request(app).get('/api/nature/species/12345');
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-inat source', async () => {
      const res = await request(app).get('/api/nature/species/perenual:123');
      expect(res.status).toBe(400);
    });

    it('returns 404 when species not found', async () => {
      mockFetch.mockResolvedValueOnce(makeInatTaxaResponse([]));

      const res = await request(app).get('/api/nature/species/inat:99999');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/nature/habitat', () => {
    it('returns species for a habitat', async () => {
      mockFetch.mockResolvedValueOnce(makeInatObsResponse([
        { taxon: MOCK_TAXON },
        { taxon: MOCK_PLANT_TAXON },
      ]));

      const res = await request(app).get('/api/nature/habitat?habitat=rainforest');

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2);
    });

    it('deduplicates by taxon id', async () => {
      mockFetch.mockResolvedValueOnce(makeInatObsResponse([
        { taxon: MOCK_TAXON },
        { taxon: MOCK_TAXON }, // duplicate
      ]));

      const res = await request(app).get('/api/nature/habitat?habitat=desert');

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
    });

    it('returns 400 when habitat missing', async () => {
      const res = await request(app).get('/api/nature/habitat');
      expect(res.status).toBe(400);
    });

    it('respects limit parameter', async () => {
      mockFetch.mockResolvedValueOnce(makeInatObsResponse([{ taxon: MOCK_TAXON }]));

      const res = await request(app).get('/api/nature/habitat?habitat=ocean&limit=5');

      expect(res.status).toBe(200);
      // Verify the fetch was called with correct per_page
      const fetchUrl = mockFetch.mock.calls[0][0];
      expect(fetchUrl).toContain('per_page=5');
    });

    it('excludes blocked content in habitat results', async () => {
      mockFetch.mockResolvedValueOnce(makeInatObsResponse([
        { taxon: MOCK_TAXON },
        { taxon: BLOCKED_TAXON },
      ]));

      const res = await request(app).get('/api/nature/habitat?habitat=forest');

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
    });
  });

  describe('GET /api/nature/random', () => {
    it('returns a random species with full detail', async () => {
      // First call: observation endpoint
      mockFetch.mockResolvedValueOnce(makeInatObsResponse([{ taxon: { id: 48460 } }]));
      // Second call: taxa detail
      mockFetch.mockResolvedValueOnce(makeInatTaxaResponse([MOCK_TAXON_DETAIL]));

      const res = await request(app).get('/api/nature/random');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('inat:48460');
      expect(res.body.common_name).toBe('Monarch Butterfly');
      expect(res.body.taxonomy).toBeDefined();
    });

    it('applies type filter via taxon_id', async () => {
      mockFetch.mockResolvedValueOnce(makeInatObsResponse([{ taxon: { id: 48460 } }]));
      mockFetch.mockResolvedValueOnce(makeInatTaxaResponse([MOCK_TAXON_DETAIL]));

      await request(app).get('/api/nature/random?type=animal');

      const fetchUrl = mockFetch.mock.calls[0][0];
      expect(fetchUrl).toContain('taxon_id=1'); // Animalia
    });

    it('returns 404 when no observation found', async () => {
      mockFetch.mockResolvedValueOnce(makeInatObsResponse([]));

      const res = await request(app).get('/api/nature/random');

      expect(res.status).toBe(404);
    });
  });
});
