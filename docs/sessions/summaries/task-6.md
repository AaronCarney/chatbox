# Task 6: App Seed Data

## Status
COMPLETE

## What Was Done

Created `server/src/db/seed.ts` with hardcoded seed data for three applications:

### Chess App
- Tool definitions: `start_game`, `make_move` (with regex validation for board positions), `get_board_state`, `get_hint`
- Auth: none
- All input schemas configured with `additionalProperties: false`

### Go App
- Tool definitions: `start_game` (board_size: 9|13|19), `place_stone` (x/y integer coords), `get_board_state`, `pass_turn`, `get_hint`
- Auth: none
- All input schemas configured with `additionalProperties: false`

### Spotify App
- Tool definitions: `search_tracks` (query max 200 chars), `create_playlist` (name max 100), `add_to_playlist` (up to 50 track IDs), `get_recommendations` (up to 5 seed track IDs)
- Auth: OAuth2 with proper scopes (user-read-private, playlist-modify-public, playlist-modify-private)
- OAuth config points to official Spotify endpoints

## Implementation Details

- Used PostgreSQL `ON CONFLICT (id) DO UPDATE SET` for upsert semantics
- All tool parameters properly typed as JSON schema with required fields and validation constraints
- Descriptions provided for all tools
- File follows TypeScript conventions with proper imports from `./client.js`

## Verification

- All 21 tests pass (no new test failures)
- Code compiles without syntax errors
- Commit: `0117834` on branch `task-6-seed-data`

## File Path
`server/src/db/seed.ts`
