# Nature Explorer Spec

## Goal
5th ChatBridge app — browse-based species discovery tool using iNaturalist (free, no key) + Perenual (free tier, API key) APIs. Fills "External Public API" auth pattern gap. No task completion (browse-based, not task-based).

## Architecture

**Server proxy pattern** (like Spotify routes): Express routes proxy to iNaturalist + Perenual, normalize responses, apply taxonomy blocklist + license filtering. Perenual API key stays server-side.

```
Client iframe → /api/nature/* → iNaturalist API (no key)
                              → Perenual API (server-side key)
```

## Server Routes (`server/src/routes/nature.ts`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/nature/search` | GET | Search species by name/keyword via iNaturalist taxa autocomplete |
| `/api/nature/species/:id` | GET | Full species details from iNaturalist taxa endpoint |
| `/api/nature/habitat` | GET | Browse species by habitat — iNaturalist observations filtered by place/taxon |
| `/api/nature/random` | GET | Random species via iNaturalist random observation |

All routes: `quality_grade=research`, CC license filter, taxonomy blocklist, response normalization to unified shape.

## Iframe App (`src/renderer/public/apps/nature-explorer/`)

Files: `index.html`, `app.js`, `bridge.js`, `styles.css`

**Views:**
- **Search results** — card grid (image, common name, scientific name, IUCN badge)
- **Species detail** — hero image, taxonomy tree, habitat, diet, behavior, fun facts, conservation badge, attribution
- **Habitat grid** — species thumbnails for a habitat
- **Comparison table** — side-by-side 2-4 species

**Design:** Nature color palette — forest green `#2D5016`, earth brown `#8B6F47`, cream `#F5E6D3`, sky blue `#87CEEB`. Card-based, image-rich.

## Tool Schemas (5 tools)

1. **search_species** — query, type filter, region filter → species list
2. **get_species_details** — species_id → full profile with taxonomy, images, fun facts
3. **explore_habitat** — habitat enum, region, type, limit → species grid
4. **get_random_species** — type, difficulty, region → full profile
5. **compare_species** — 2-4 species_ids, aspects → comparison with similarities/differences

Full schemas in `docs/schemas/nature-explorer-tools.json`.

## Content Safety

- iNaturalist: `quality_grade=research` filter, CC license check, taxonomy blocklist (parasites, roadkill keywords)
- Perenual: curated images, lower risk
- Existing NSFWJS + OpenAI pipeline handles iframe content monitoring
- Attribution required: "Photo by [user] on iNaturalist (CC BY-NC)"

## Session Model

No `ChatBridge.complete()` — browse-based, no win condition. `ChatBridge.sendState()` after each tool response. `ChatBridge.resize()` on view changes.

## DB Seed

Add `nature-explorer` to apps table with 5 tool schemas. auth_type: `none`.

## API Keys

- iNaturalist: none required, 100 req/min
- Perenual: `PERENUAL_API_KEY` env var, free tier 100 req/day
