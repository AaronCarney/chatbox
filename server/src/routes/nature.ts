import { Router, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { isBlockedContent, isBlockedTaxon, isAllowedLicense } from '../lib/taxonomy-blocklist.js';

const natureRouter = Router();

const INAT_BASE = 'https://api.inaturalist.org/v1';
const PERENUAL_BASE = 'https://perenual.com/api';

// Iconic taxon name → type mapping (only include K-12-appropriate kingdoms)
const TAXON_TYPE_MAP: Record<string, 'animal' | 'plant'> = {
  Animalia: 'animal',
  Plantae: 'plant',
  Fungi: 'plant',
  Insecta: 'animal',
  Arachnida: 'animal',
  Aves: 'animal',
  Mammalia: 'animal',
  Reptilia: 'animal',
  Amphibia: 'animal',
  Actinopterygii: 'animal',
  Mollusca: 'animal',
};

// Type → iNaturalist taxon_id for filtering
const TYPE_TAXON_ID: Record<string, number> = {
  animal: 1,       // Animalia
  plant: 47126,    // Plantae
};

interface NormalizedSpecies {
  id: string;
  common_name: string;
  scientific_name: string;
  type: 'animal' | 'plant';
  image_url: string | null;
  iucn_status: string | null;
}

async function inatFetch(endpoint: string): Promise<any> {
  const url = `${INAT_BASE}${endpoint}`;
  logger.debug({ url }, 'inat api call');
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ChatBridge/1.0 (K-12 education platform)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`iNaturalist API error: ${res.status}`);
  return res.json();
}

async function perenualFetch(endpoint: string): Promise<any> {
  const key = process.env.PERENUAL_API_KEY;
  if (!key) return null;
  const url = `${PERENUAL_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${key}`;
  logger.debug({ url: url.replace(key, '***') }, 'perenual api call');
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    logger.warn({ status: res.status }, 'perenual api error');
    return null;
  }
  return res.json();
}

function normalizeTaxon(taxon: any): NormalizedSpecies | null {
  const iconicName = taxon.iconic_taxon_name || '';
  if (isBlockedTaxon(iconicName)) return null;
  // Reject taxa not in our allowlist (Chromista, Protozoa, etc.)
  if (iconicName && !TAXON_TYPE_MAP[iconicName]) return null;

  const name = taxon.preferred_common_name || taxon.name || '';
  const sciName = taxon.name || '';
  if (isBlockedContent(name) || isBlockedContent(sciName)) return null;

  const photo = taxon.default_photo;
  if (photo && !isAllowedLicense(photo.license_code ?? null)) return null;

  return {
    id: `inat:${taxon.id}`,
    common_name: name,
    scientific_name: sciName,
    type: TAXON_TYPE_MAP[iconicName] || 'animal',
    image_url: photo?.medium_url || null,
    iucn_status: taxon.conservation_status?.status || null,
    observations_count: taxon.observations_count || null,
    rank: taxon.rank || null,
  };
}

function extractTaxonomy(ancestors: any[]): Record<string, string> {
  const ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus'];
  const taxonomy: Record<string, string> = {};
  for (const a of ancestors || []) {
    if (ranks.includes(a.rank)) taxonomy[a.rank] = a.name;
  }
  return taxonomy;
}

// GET /api/nature/search?q=butterfly&type=animal&region=worldwide
natureRouter.get('/nature/search', async (req: Request, res: Response) => {
  try {
    const { q, type } = req.query;
    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Missing query parameter: q' });
      return;
    }

    const data = await inatFetch(`/taxa/autocomplete?q=${encodeURIComponent(q)}&per_page=12`);
    let results = (data.results || [])
      .map(normalizeTaxon)
      .filter((r: NormalizedSpecies | null): r is NormalizedSpecies => r !== null);

    if (type && typeof type === 'string' && (type === 'animal' || type === 'plant')) {
      results = results.filter((r: NormalizedSpecies) => r.type === type);
    }

    // Supplement with Perenual for plant searches
    if ((!type || type === 'plant') && process.env.PERENUAL_API_KEY) {
      const perenual = await perenualFetch(`/species-list?q=${encodeURIComponent(q)}`);
      if (perenual?.data) {
        for (const p of perenual.data.slice(0, 6)) {
          if (results.some((r: NormalizedSpecies) => r.scientific_name.toLowerCase() === (p.scientific_name || '').toLowerCase())) continue;
          const name = p.common_name || p.scientific_name || '';
          const sciName = p.scientific_name || '';
          if (isBlockedContent(name) || isBlockedContent(sciName)) continue;
          results.push({
            id: `perenual:${p.id}`,
            common_name: name,
            scientific_name: p.scientific_name || '',
            type: 'plant',
            image_url: p.default_image?.medium_url || null,
            iucn_status: null,
          });
        }
      }
    }

    res.json({ query: q, results, total: results.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, 'nature api error');
    res.status(500).json({ error: 'Failed to fetch nature data' });
  }
});

// GET /api/nature/species/:id
natureRouter.get('/nature/species/:id', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id as string;
    const [source, numericId] = rawId.split(':');
    if (!numericId || !/^\d+$/.test(numericId)) {
      res.status(400).json({ error: 'Invalid id format. Expected "inat:{numeric_id}"' });
      return;
    }

    if (source !== 'inat') {
      res.status(400).json({ error: 'Only iNaturalist species details are supported' });
      return;
    }

    const data = await inatFetch(`/taxa/${numericId}`);
    const taxon = data.results?.[0];
    if (!taxon) {
      res.status(404).json({ error: 'Species not found' });
      return;
    }

    // Blocklist check on detail endpoint
    const name = taxon.preferred_common_name || taxon.name || '';
    if (isBlockedContent(name) || isBlockedContent(taxon.name || '')) {
      res.status(404).json({ error: 'Species not found' });
      return;
    }

    const taxonomy = extractTaxonomy(taxon.ancestors || []);
    if (taxon.rank === 'species') taxonomy.species = taxon.name;

    const images = (taxon.taxon_photos || [])
      .filter((tp: any) => isAllowedLicense(tp.photo?.license_code ?? null))
      .slice(0, 10)
      .map((tp: any) => ({
        url: tp.photo?.medium_url || tp.photo?.url || null,
        credit: tp.photo?.attribution || null,
      }));

    // Conservation status enrichment
    const cs = taxon.conservation_status;
    const conservation = cs ? {
      status: cs.status || null,
      status_name: cs.status_name || null,
      authority: cs.authority || null,
      description: cs.description || null,
    } : null;

    // Extract preferred place (native range) from ancestors
    const nativeRange = taxon.listed_taxa_count || null;
    const isEndemic = taxon.endemic || false;
    const isExtinct = taxon.extinct || false;

    res.json({
      id: rawId,
      common_name: name,
      scientific_name: taxon.name,
      taxonomy,
      type: TAXON_TYPE_MAP[taxon.iconic_taxon_name || ''] || 'animal',
      description: taxon.wikipedia_summary || null,
      habitat: null,
      images,
      iucn_status: cs?.status || null,
      conservation,
      is_extinct: isExtinct,
      is_endemic: isEndemic,
      rank: taxon.rank || null,
      ancestors: (taxon.ancestors || []).map((a: any) => ({ rank: a.rank, name: a.name })),
      observations_count: taxon.observations_count || null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, 'nature species detail failed');
    res.status(500).json({ error: 'Failed to fetch nature data' });
  }
});

// GET /api/nature/habitat?habitat=rainforest&type=animal&limit=12
natureRouter.get('/nature/habitat', async (req: Request, res: Response) => {
  try {
    const { habitat, type, limit } = req.query;
    if (!habitat || typeof habitat !== 'string') {
      res.status(400).json({ error: 'Missing query parameter: habitat' });
      return;
    }

    const parsed = Number(limit);
    const perPage = Math.min(parsed > 0 ? Math.floor(parsed) : 12, 30);
    let endpoint = `/observations?q=${encodeURIComponent(habitat)}&quality_grade=research&photos=true&per_page=${perPage}&order=desc&order_by=votes`;

    if (type && typeof type === 'string' && TYPE_TAXON_ID[type]) {
      endpoint += `&taxon_id=${TYPE_TAXON_ID[type]}`;
    }

    const data = await inatFetch(endpoint);
    const seen = new Set<number>();
    const results: NormalizedSpecies[] = [];

    for (const obs of data.results || []) {
      const taxon = obs.taxon;
      if (!taxon || seen.has(taxon.id)) continue;
      seen.add(taxon.id);
      const normalized = normalizeTaxon(taxon);
      if (normalized) results.push(normalized);
    }

    res.json({ habitat: habitat as string, results, total: results.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, 'nature habitat browse failed');
    res.status(500).json({ error: 'Failed to fetch nature data' });
  }
});

// GET /api/nature/random?type=animal
natureRouter.get('/nature/random', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    let endpoint = '/observations?quality_grade=research&photos=true&per_page=1&order=desc&order_by=random';

    if (type && typeof type === 'string' && TYPE_TAXON_ID[type]) {
      endpoint += `&taxon_id=${TYPE_TAXON_ID[type]}`;
    }

    const data = await inatFetch(endpoint);
    const obs = data.results?.[0];
    if (!obs?.taxon) {
      res.status(404).json({ error: 'No species found' });
      return;
    }

    // Fetch full taxon detail for taxonomy info
    const taxonData = await inatFetch(`/taxa/${obs.taxon.id}`);
    const taxon = taxonData.results?.[0];
    if (!taxon) {
      res.status(404).json({ error: 'Species not found' });
      return;
    }

    // Blocklist check on random species
    const name = taxon.preferred_common_name || taxon.name || '';
    if (isBlockedContent(name) || isBlockedContent(taxon.name || '')) {
      res.status(404).json({ error: 'Species not found' });
      return;
    }

    const taxonomy = extractTaxonomy(taxon.ancestors || []);
    if (taxon.rank === 'species') taxonomy.species = taxon.name;

    const images = (taxon.taxon_photos || [])
      .filter((tp: any) => isAllowedLicense(tp.photo?.license_code ?? null))
      .slice(0, 10)
      .map((tp: any) => ({
        url: tp.photo?.medium_url || tp.photo?.url || null,
        credit: tp.photo?.attribution || null,
      }));

    res.json({
      id: `inat:${taxon.id}`,
      common_name: name,
      scientific_name: taxon.name,
      taxonomy,
      description: taxon.wikipedia_summary || null,
      habitat: null,
      images,
      iucn_status: taxon.conservation_status?.status || null,
      ancestors: (taxon.ancestors || []).map((a: any) => ({ rank: a.rank, name: a.name })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, 'nature random failed');
    res.status(500).json({ error: 'Failed to fetch nature data' });
  }
});

// GET /api/nature/species/:id/observations — recent sightings with locations
natureRouter.get('/nature/species/:id/observations', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id as string;
    const [source, numericId] = rawId.split(':');
    if (source !== 'inat' || !numericId || !/^\d+$/.test(numericId)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }

    const data = await inatFetch(
      `/observations?taxon_id=${numericId}&quality_grade=research&photos=true&per_page=12&order=desc&order_by=created_at`
    );

    const observations = (data.results || []).map((obs: any) => ({
      id: obs.id,
      observed_on: obs.observed_on_string || obs.observed_on || null,
      place: obs.place_guess || null,
      location: obs.location ? { lat: parseFloat(obs.location.split(',')[0]), lng: parseFloat(obs.location.split(',')[1]) } : null,
      photo: obs.photos?.[0]?.url?.replace('square', 'medium') || null,
      user: obs.user?.login || null,
    }));

    res.json({ species_id: rawId, observations, total: data.total_results || observations.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, 'nature observations failed');
    res.status(500).json({ error: 'Failed to fetch observations' });
  }
});

// GET /api/nature/species/:id/similar — similar/related species
natureRouter.get('/nature/species/:id/similar', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id as string;
    const [source, numericId] = rawId.split(':');
    if (source !== 'inat' || !numericId || !/^\d+$/.test(numericId)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }

    // Get the taxon to find its parent, then fetch siblings
    const taxonData = await inatFetch(`/taxa/${numericId}`);
    const taxon = taxonData.results?.[0];
    if (!taxon) { res.status(404).json({ error: 'Species not found' }); return; }

    const parentId = taxon.parent_id;
    if (!parentId) { res.json({ species_id: rawId, similar: [] }); return; }

    const siblingsData = await inatFetch(
      `/taxa?parent_id=${parentId}&per_page=12&order=desc&order_by=observations_count`
    );

    const similar = (siblingsData.results || [])
      .filter((t: any) => t.id !== parseInt(numericId))
      .map(normalizeTaxon)
      .filter((r: NormalizedSpecies | null): r is NormalizedSpecies => r !== null)
      .slice(0, 10);

    res.json({ species_id: rawId, similar, total: similar.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, 'nature similar species failed');
    res.status(500).json({ error: 'Failed to fetch similar species' });
  }
});

// GET /api/nature/species/:id/children — subspecies/varieties
natureRouter.get('/nature/species/:id/children', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id as string;
    const [source, numericId] = rawId.split(':');
    if (source !== 'inat' || !numericId || !/^\d+$/.test(numericId)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }

    const data = await inatFetch(
      `/taxa?parent_id=${numericId}&per_page=20&order=desc&order_by=observations_count`
    );

    const children = (data.results || [])
      .map(normalizeTaxon)
      .filter((r: NormalizedSpecies | null): r is NormalizedSpecies => r !== null);

    res.json({ species_id: rawId, children, total: children.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, 'nature children failed');
    res.status(500).json({ error: 'Failed to fetch subspecies' });
  }
});

export { natureRouter };
