# Nature Explorer - Quick Reference

## The 5 Tools

```json
1. search_species(query, type?, region?)
   → Returns: search results with id, name, image, habitat, status

2. get_species_details(species_id, include_images?, include_similar?)
   → Returns: full profile with taxonomy, description, images, facts

3. explore_habitat(habitat, region?, type?, limit?)
   → Returns: list of 12+ species from that ecosystem

4. get_random_species(type?, difficulty?, region?)
   → Returns: full profile of random interesting species

5. compare_species(species_ids[], aspects?)
   → Returns: comparison table + similarities/differences
```

## When to Use Each Tool

| Student Says | Use This Tool | Why |
|---|---|---|
| "Tell me about X" | search_species → get_species_details | Find and load full profile |
| "What animals live in the Amazon?" | explore_habitat | Show ecosystem species |
| "What's the difference between X and Y?" | search_species (both) → compare_species | Highlight differences |
| "Show me something cool!" | get_random_species | Surprise discovery |
| "Show me more / Tell me more" | get_species_details (with include_similar) | Deepen learning |

## Tool Parameters Quick Guide

### search_species
- **query** (required): "monarch butterfly", "Danaus plexippus", "desert predators"
- **type** (optional): "animal", "plant", or "all" (default: "all")
- **region** (optional): "North America", "South America", "Africa", "Asia", "Australia", "Europe", "Oceania", or "worldwide" (default: "worldwide")

### get_species_details
- **species_id** (required): From search_species results, e.g., "inaturalist:12345"
- **include_images** (optional): true/false (default: true)
- **include_similar** (optional): true/false (default: true)

### explore_habitat
- **habitat** (required): "rainforest", "desert", "coral reef", "ocean", "forest", "grassland", "arctic", "wetland", "mountains", "urban"
- **region** (optional): Geographic region (default: "worldwide")
- **type** (optional): "animal", "plant", or "all" (default: "all")
- **limit** (optional): 1-50 (default: 12)

### get_random_species
- **type** (optional): "animal", "plant", or "all" (default: "all")
- **difficulty** (optional): "easy" (common), "medium" (interesting), "hard" (rare/unusual), or "any" (default: "any")
- **region** (optional): Geographic region (default: "worldwide")

### compare_species
- **species_ids** (required): Array of 2-4 species IDs from search_species
- **aspects** (optional): Array of: "taxonomy", "habitat", "diet", "behavior", "size", "lifespan", "conservation", "adaptations"

## Return Types

### search_species returns:
```
{
  results: [
    {
      id: "inaturalist:31156",
      common_name: "Monarch Butterfly",
      scientific_name: "Danaus plexippus",
      type: "animal",
      image_url: "https://...",
      habitat: "Milkweed meadows",
      iucn_status: "LC"
    }
  ],
  total: number
}
```

### get_species_details returns:
```
{
  id: string,
  common_name: string,
  scientific_name: string,
  taxonomy: { kingdom, phylum, class, order, family, genus, species },
  description: string,
  habitat: string,
  diet: string,
  behavior: string,
  fun_facts: [string, ...],
  iucn_status: string,
  images: [{ url, credit }, ...],
  similar_species: [{ id, name, difference }, ...]
}
```

### explore_habitat returns:
```
{
  habitat: string,
  region: string,
  species: [
    {
      id: string,
      common_name: string,
      type: string,
      image_url: string,
      brief_description: string
    }
  ]
}
```

### compare_species returns:
```
{
  comparison: [
    {
      species_id: string,
      common_name: string,
      taxonomy: {...},
      habitat: string,
      diet: string,
      size: string,
      lifespan: string,
      conservation: string
    }
  ],
  similarities: [string, ...],
  differences: [string, ...]
}
```

## Code Examples

### Search and Show Details
```javascript
// Chatbot: "Tell me about monarch butterflies"
ChatBridge.invokeTool('search_species', {
  query: 'monarch butterfly'
});
// Response: [{ id: "inaturalist:31156", ... }]

ChatBridge.invokeTool('get_species_details', {
  species_id: 'inaturalist:31156'
});
// Response: Full profile, iframe renders it
```

### Explore Habitat
```javascript
// Chatbot: "What animals live in the Amazon?"
ChatBridge.invokeTool('explore_habitat', {
  habitat: 'rainforest',
  region: 'South America',
  type: 'animal'
});
// Response: 12 rainforest animals
// Iframe: Shows grid of species
```

### Compare Two Species
```javascript
// Chatbot: "Compare frogs and toads"
ChatBridge.invokeTool('search_species', { query: 'frog' });
// → { id: "inaturalist:1001" }

ChatBridge.invokeTool('search_species', { query: 'toad' });
// → { id: "inaturalist:1002" }

ChatBridge.invokeTool('compare_species', {
  species_ids: ['inaturalist:1001', 'inaturalist:1002']
});
// Response: Comparison table
```

## Key Design Decisions

1. **Browse-based, not task-based** — No task.completed() called
2. **5 tools, not more** — Covers all K-12 use cases
3. **Enum habitats, not free-text** — Ensures consistent results
4. **Chatbot orchestrates, iframe displays** — Clear separation of concerns
5. **iNaturalist + Perenual** — Free/cheap, curated for K-12 content safety

## Content Safety

- Filter: Graphic predation, mating, gore
- Keep: Educational animal behavior, anatomy, adaptations
- Source: iNaturalist community moderation + manual filtering
- COPPA/FERPA: No persistent student data

## Integration Files

- `nature-explorer-tools.json` — Tool definitions (copy to database)
- `NATURE-EXPLORER-SEED.ts` — Database registration code
- `NATURE-EXPLORER-DEV-GUIDE.md` — Implementation templates
- `NATURE-EXPLORER-DESIGN.md` — Full design philosophy

## Chatbot System Prompt Template

```
When students ask about animals, plants, species, habitats, or ecosystems:

1. ALWAYS use Nature Explorer tools. Never answer from knowledge alone.
2. Use search_species for specific creatures ("Tell me about X")
3. Use explore_habitat for ecosystems ("What lives in X?")
4. Use compare_species for differences ("Compare X and Y")
5. Use get_random_species for discovery ("Show me something cool")
6. Chain tools to deepen learning
7. Narrate what students see. Explain the science.
8. Never call task.completed() — Nature Explorer is browse-based.
```

## Testing Checklist

- [ ] search_species("monarch butterfly") returns results
- [ ] get_species_details("inaturalist:31156") returns full profile
- [ ] explore_habitat(habitat="rainforest") returns 12+ species
- [ ] get_random_species() returns unique species on each call
- [ ] compare_species([id1, id2]) returns comparison with differences
- [ ] Iframe renders all response types correctly
- [ ] Images load (validate URLs)
- [ ] Content is K-12 appropriate (spot check 10 species)
- [ ] No XSS vulnerabilities (use textContent, not innerHTML)
- [ ] Error handling works (bad species ID, API timeout)

## Deployment

1. Add seed code from NATURE-EXPLORER-SEED.ts
2. Create `/apps/nature-explorer/` directory
3. Implement bridge.js (use dev guide template)
4. Implement API clients (use dev guide template)
5. Update system prompt for chatbot
6. Test all 5 tools
7. Content safety review
8. Deploy to production

---

**For details, see:** `NATURE-EXPLORER-DESIGN.md`, `NATURE-EXPLORER-DEV-GUIDE.md`, or `INDEX.md`
