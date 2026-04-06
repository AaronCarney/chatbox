// Add this to server/src/db/seed.ts to register Nature Explorer app

export async function seedNatureExplorer() {
  await query(
    `INSERT INTO apps (id, name, description_for_model, iframe_url, auth_type, tools)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description_for_model = EXCLUDED.description_for_model,
       iframe_url = EXCLUDED.iframe_url,
       auth_type = EXCLUDED.auth_type,
       tools = EXCLUDED.tools`,
    [
      'nature-explorer',
      'Nature Explorer',
      'Interactive species exploration tool for discovering animals and plants worldwide. Students search for specific species, explore habitats and regions, compare species side-by-side, learn taxonomy and behavior, and discover random interesting organisms. Uses iNaturalist API for observations and Perenual API for plant details. Rich profiles with images, fun facts, conservation status, and habitat information render in the iframe.',
      '/apps/nature-explorer/index.html',
      'none',
      JSON.stringify([
        {
          name: 'search_species',
          description: 'Search for animals or plants by name, keyword, or scientific term. Returns matching species with basic info (common name, scientific name, image, habitat). Use when students ask about specific creatures like "monarch butterflies" or "shade-loving plants".',
          input_schema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                maxLength: 100,
                description: 'Search term: common name (e.g., "monarch butterfly"), scientific name (e.g., "Danaus plexippus"), or keyword (e.g., "desert predators"). Required.',
              },
              type: {
                type: 'string',
                enum: ['animal', 'plant', 'all'],
                description: 'Filter results: "animal", "plant", or "all". Defaults to "all".',
              },
              region: {
                type: 'string',
                enum: [
                  'North America',
                  'South America',
                  'Europe',
                  'Africa',
                  'Asia',
                  'Australia',
                  'Oceania',
                  'worldwide',
                ],
                description: 'Geographic region to filter observations. Defaults to "worldwide".',
              },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_species_details',
          description: 'Get comprehensive information about a species: description, taxonomy (kingdom through species), habitat, diet, behavior, fun facts, images, and similar species. Call after search_species to display detailed profiles.',
          input_schema: {
            type: 'object',
            properties: {
              species_id: {
                type: 'string',
                description: 'Unique species ID from search_species results (e.g., "inaturalist:12345" or "perenual:67890"). Required.',
              },
              include_images: {
                type: 'boolean',
                description: 'Include photos in the profile. Defaults to true.',
              },
              include_similar: {
                type: 'boolean',
                description: 'Include "similar species" section for comparisons (e.g., frogs vs toads). Defaults to true.',
              },
            },
            required: ['species_id'],
            additionalProperties: false,
          },
        },
        {
          name: 'explore_habitat',
          description: 'Browse species by habitat type or geographic region. Returns a curated list of common species for that environment. Use when students ask "what animals live in the Amazon?" or "show me desert plants".',
          input_schema: {
            type: 'object',
            properties: {
              habitat: {
                type: 'string',
                enum: [
                  'rainforest',
                  'desert',
                  'coral reef',
                  'ocean',
                  'forest',
                  'grassland',
                  'arctic',
                  'wetland',
                  'mountains',
                  'urban',
                ],
                description: 'Habitat type to explore. Each has typical species pre-curated from observations. Required.',
              },
              region: {
                type: 'string',
                enum: [
                  'North America',
                  'South America',
                  'Europe',
                  'Africa',
                  'Asia',
                  'Australia',
                  'Oceania',
                  'worldwide',
                ],
                description: 'Geographic region to narrow search. Defaults to "worldwide".',
              },
              type: {
                type: 'string',
                enum: ['animal', 'plant', 'all'],
                description: 'Filter by organism type. Defaults to "all".',
              },
              limit: {
                type: 'integer',
                minimum: 1,
                maximum: 50,
                description: 'Number of species to return. Defaults to 12.',
              },
            },
            required: ['habitat'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_random_species',
          description: 'Get a random interesting species with full details and images. Great for engagement and serendipitous discovery. Use when students say "show me something cool!" or "I want to learn about something random".',
          input_schema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['animal', 'plant', 'all'],
                description: 'Filter by organism type. Defaults to "all".',
              },
              difficulty: {
                type: 'string',
                enum: ['easy', 'medium', 'hard', 'any'],
                description: 'Educational difficulty: "easy" (common species), "medium" (interesting and moderately well-known), "hard" (rare, teaches deeper concepts). Defaults to "any".',
              },
              region: {
                type: 'string',
                enum: [
                  'North America',
                  'South America',
                  'Europe',
                  'Africa',
                  'Asia',
                  'Australia',
                  'Oceania',
                  'worldwide',
                ],
                description: 'Preference for geographic region. Defaults to "worldwide".',
              },
            },
            required: [],
            additionalProperties: false,
          },
        },
        {
          name: 'compare_species',
          description: 'Compare 2-4 species side-by-side: taxonomy, habitat, diet, behavior, size, lifespan, conservation status. Renders a comparison table. Use when students ask "what\'s the difference between a frog and a toad?" or "compare lions and tigers".',
          input_schema: {
            type: 'object',
            properties: {
              species_ids: {
                type: 'array',
                items: {
                  type: 'string',
                },
                minItems: 2,
                maxItems: 4,
                description: 'Array of 2-4 species IDs to compare (from search_species results). Required.',
              },
              aspects: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: [
                    'taxonomy',
                    'habitat',
                    'diet',
                    'behavior',
                    'size',
                    'lifespan',
                    'conservation',
                    'adaptations',
                  ],
                },
                description: 'Which aspects to compare. Defaults to all if not specified.',
              },
            },
            required: ['species_ids'],
            additionalProperties: false,
          },
        },
      ]),
    ]
  );
}

// Call this in the main seed() function:
// export async function seed() {
//   // ... existing apps ...
//   await seedNatureExplorer();
// }
