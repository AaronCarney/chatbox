# Task 24: Spotify OAuth Server Proxy

## Summary
Implemented Spotify OAuth proxy routes with full TDD workflow. All tests pass.

## Implementation

### Created Files
- `server/src/routes/oauth.ts`: OAuth router with three endpoints and token store
- `server/tests/routes/oauth.test.ts`: 8 test cases covering all functionality
- Updated `server/src/index.ts`: Registered oauthRouter

### Key Components

**oauth.ts**
- In-memory `tokenStore` Map: state → sessionId mapping
- In-memory `sessionTokens` Map: sessionId → tokens
- Three route handlers + `getSpotifyToken(sessionId)` export

**Three Endpoints**

1. `GET /api/oauth/spotify/authorize`
   - Accepts `session_id` query param
   - Generates 16-byte random state (crypto.randomBytes)
   - Stores state→sessionId mapping
   - Redirects to `https://accounts.spotify.com/authorize` with:
     - client_id, response_type=code, redirect_uri, scopes
     - Scopes: `user-read-private playlist-modify-public playlist-modify-private`
     - Random state for CSRF protection

2. `GET /api/oauth/spotify/callback`
   - Validates state parameter against tokenStore
   - Checks session_id matches stored mapping
   - Exchanges auth code for tokens via POST to Spotify API
   - Uses Basic auth header (base64 of client_id:client_secret)
   - Stores tokens keyed by sessionId
   - Returns HTML: `<script>window.close()</script>`
   - Validates response before storing tokens

3. `GET /api/oauth/spotify/token`
   - Accepts `session_id` query param
   - Returns `{ authenticated: true|false }` based on token existence

**Helper Export**
- `getSpotifyToken(sessionId)`: Returns access_token or null

## Test Results
- 52/52 tests passing (including 8 new oauth tests)
- TDD workflow: wrote failing tests → implemented → all passing
- Tests cover:
  - 302 redirect to correct Spotify authorization endpoint
  - Scope inclusion in redirect URL
  - Random state generation
  - State validation
  - Token exchange with Basic auth header
  - Token storage and retrieval
  - Edge cases (invalid state, missing session_id)

## Commit
`feat: Spotify OAuth proxy` (eaa909d)
