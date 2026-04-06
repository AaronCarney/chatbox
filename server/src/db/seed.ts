import { query } from './client.js';

export async function seed() {
  // Chess app
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
      'chess',
      'Chess',
      'Interactive chess game where players can start a new game, make moves on the board, get the current board state, and receive hints for the next move.',
      '/apps/chess/index.html',
      'none',
      JSON.stringify([
        {
          name: 'start_game',
          description: 'Start a new chess game',
          input_schema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
        {
          name: 'make_move',
          description: 'Make a move on the chess board',
          input_schema: {
            type: 'object',
            properties: {
              from: {
                type: 'string',
                pattern: '^[a-h][1-8]$',
                description: 'Starting square (e.g., e2)',
              },
              to: {
                type: 'string',
                pattern: '^[a-h][1-8]$',
                description: 'Destination square (e.g., e4)',
              },
            },
            required: ['from', 'to'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_board_state',
          description: 'Get the current state of the chess board',
          input_schema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
        {
          name: 'get_hint',
          description: 'Get a hint for the next move',
          input_schema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
      ]),
    ]
  );

  // Go app
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
      'go',
      'Go',
      'Interactive Go game where players can start a game with configurable board size, place stones on the board, get the current board state, pass their turn, and receive hints for optimal play.',
      '/apps/go/index.html',
      'none',
      JSON.stringify([
        {
          name: 'start_game',
          description: 'Start a new Go game with a specified board size',
          input_schema: {
            type: 'object',
            properties: {
              board_size: {
                type: 'integer',
                enum: [9, 13, 19],
                description: 'Size of the Go board',
              },
            },
            required: ['board_size'],
            additionalProperties: false,
          },
        },
        {
          name: 'place_stone',
          description: 'Place a stone on the Go board',
          input_schema: {
            type: 'object',
            properties: {
              x: {
                type: 'integer',
                minimum: 0,
                description: 'X coordinate',
              },
              y: {
                type: 'integer',
                minimum: 0,
                description: 'Y coordinate',
              },
            },
            required: ['x', 'y'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_board_state',
          description: 'Get the current state of the Go board',
          input_schema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
        {
          name: 'pass_turn',
          description: 'Pass the current turn',
          input_schema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
        {
          name: 'get_hint',
          description: 'Get a hint for the next move',
          input_schema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
      ]),
    ]
  );

  // DOS Arcade app
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
      'dos',
      'DOS Arcade',
      'A collection of 19 classic DOS games including Oregon Trail, Civilization, SimCity 2000, Tetris, Chess, Mahjong, and more. Students can browse the catalog or launch a specific game by ID. Games run in a DOS emulator in the browser.',
      '/apps/dos/index.html',
      'none',
      JSON.stringify([
        {
          name: 'list_games',
          description: 'List all available DOS games with their IDs and categories',
          input_schema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
        {
          name: 'launch_game',
          description: 'Launch a specific DOS game by its ID',
          input_schema: {
            type: 'object',
            properties: {
              game_id: {
                type: 'string',
                description: 'Game ID (e.g., oregon-trail, tetris, civilization)',
              },
            },
            required: ['game_id'],
            additionalProperties: false,
          },
        },
      ]),
    ]
  );

  // Nature Explorer app
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
      'Interactive species exploration tool for discovering animals and plants worldwide. Students search by name, explore habitats, compare species side-by-side, learn taxonomy, and discover random organisms. Uses iNaturalist and Perenual APIs. Rich profiles with images, fun facts, and conservation status render in the iframe. Session ends when student closes the app (no task completion).',
      '/apps/nature-explorer/index.html',
      'none',
      JSON.stringify([
        {
          name: 'search_species',
          description: 'Search for animals or plants by name, keyword, or scientific term. Returns matching species with basic info. Use when students ask about specific creatures.',
          input_schema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                maxLength: 100,
                description: 'Search term: common name, scientific name, or keyword.',
              },
              type: {
                type: 'string',
                enum: ['animal', 'plant', 'all'],
                description: 'Filter results. Defaults to "all".',
              },
              region: {
                type: 'string',
                enum: ['North America', 'South America', 'Europe', 'Africa', 'Asia', 'Australia', 'Oceania', 'worldwide'],
                description: 'Geographic region filter. Defaults to "worldwide".',
              },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_species_details',
          description: 'Get comprehensive species info: taxonomy, habitat, images, conservation status. Call after search_species to display detailed profiles.',
          input_schema: {
            type: 'object',
            properties: {
              species_id: {
                type: 'string',
                description: 'Species ID from search results (e.g., "inat:12345").',
              },
              include_images: {
                type: 'boolean',
                description: 'Include photos. Defaults to true.',
              },
              include_similar: {
                type: 'boolean',
                description: 'Include similar species section. Defaults to true.',
              },
            },
            required: ['species_id'],
            additionalProperties: false,
          },
        },
        {
          name: 'explore_habitat',
          description: 'Browse species by habitat type. Use when students ask "what animals live in the Amazon?" or "show me desert plants".',
          input_schema: {
            type: 'object',
            properties: {
              habitat: {
                type: 'string',
                enum: ['rainforest', 'desert', 'coral reef', 'ocean', 'forest', 'grassland', 'arctic', 'wetland', 'mountains', 'urban'],
                description: 'Habitat type to explore.',
              },
              region: {
                type: 'string',
                enum: ['North America', 'South America', 'Europe', 'Africa', 'Asia', 'Australia', 'Oceania', 'worldwide'],
                description: 'Geographic region. Defaults to "worldwide".',
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
          description: 'Get a random interesting species with full details. Great for engagement when students say "show me something cool!".',
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
                description: 'Educational difficulty. Defaults to "any".',
              },
              region: {
                type: 'string',
                enum: ['North America', 'South America', 'Europe', 'Africa', 'Asia', 'Australia', 'Oceania', 'worldwide'],
                description: 'Geographic region preference. Defaults to "worldwide".',
              },
            },
            required: [],
            additionalProperties: false,
          },
        },
        {
          name: 'compare_species',
          description: 'Compare 2-4 species side-by-side. Use when students ask "what\'s the difference between a frog and a toad?".',
          input_schema: {
            type: 'object',
            properties: {
              species_ids: {
                type: 'array',
                items: { type: 'string' },
                minItems: 2,
                maxItems: 4,
                description: 'Array of 2-4 species IDs to compare.',
              },
              aspects: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['taxonomy', 'habitat', 'diet', 'behavior', 'size', 'lifespan', 'conservation', 'adaptations'],
                },
                description: 'Aspects to compare. Defaults to all.',
              },
            },
            required: ['species_ids'],
            additionalProperties: false,
          },
        },
      ]),
    ]
  );

  // Spotify app
  await query(
    `INSERT INTO apps (id, name, description_for_model, iframe_url, auth_type, oauth_config, tools)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description_for_model = EXCLUDED.description_for_model,
       iframe_url = EXCLUDED.iframe_url,
       auth_type = EXCLUDED.auth_type,
       oauth_config = EXCLUDED.oauth_config,
       tools = EXCLUDED.tools`,
    [
      'spotify',
      'Spotify',
      'Music streaming service. Search tracks, create playlists, add tracks to playlists, get recommendations. Tracks open in the Spotify app for playback (no in-app playback). All results are filtered for age-appropriate content.',
      '/apps/spotify/index.html',
      'oauth2',
      JSON.stringify({
        authorize_url: 'https://accounts.spotify.com/authorize',
        token_url: 'https://accounts.spotify.com/api/token',
        scopes: [
          'user-read-private',
          'playlist-modify-public',
          'playlist-modify-private',
        ],
      }),
      JSON.stringify([
        {
          name: 'search_tracks',
          description: 'Search for tracks on Spotify',
          input_schema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                maxLength: 200,
                description: 'Search query',
              },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
        {
          name: 'create_playlist',
          description: 'Create a new playlist',
          input_schema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                maxLength: 100,
                description: 'Playlist name',
              },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
        {
          name: 'add_to_playlist',
          description: 'Add tracks to a playlist',
          input_schema: {
            type: 'object',
            properties: {
              playlist_id: {
                type: 'string',
                description: 'ID of the playlist',
              },
              track_ids: {
                type: 'array',
                items: {
                  type: 'string',
                },
                maxItems: 50,
                description: 'Array of track IDs to add',
              },
            },
            required: ['playlist_id', 'track_ids'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_recommendations',
          description: 'Get track recommendations based on seed tracks',
          input_schema: {
            type: 'object',
            properties: {
              seed_track_ids: {
                type: 'array',
                items: {
                  type: 'string',
                },
                maxItems: 5,
                description: 'Array of seed track IDs',
              },
            },
            required: ['seed_track_ids'],
            additionalProperties: false,
          },
        },
      ]),
    ]
  );
}
