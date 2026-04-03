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
      'Music streaming service integration that allows searching tracks, creating playlists, adding tracks to playlists, and getting recommendations based on seed tracks.',
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
