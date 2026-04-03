# Task 13: Wire SessionManager Into Pipeline (C8)

## Status
COMPLETE

## Summary
Successfully wired SessionManager singleton into the chat route. Created `sessionSingleton.ts` to avoid circular dependencies from importing index.ts.

## Changes Made

### 1. Created `/server/src/services/sessionSingleton.ts`
- New file that exports a singleton `sessionManager` instance
- Reads `SESSION_SECRET` and `SESSION_TTL` from environment variables with sensible defaults
- Secret: `chatbridge-dev-secret`, TTL: 14400 seconds (4 hours)

### 2. Updated `/server/src/routes/chat.ts`
- Imported `sessionManager` from `sessionSingleton.js`
- Added pseudonym generation from `req.auth.userId` when available
- Logs `'session bound'` event with pseudonym if userId exists
- Code gracefully handles missing userId (dev mode without Clerk keys)

### 3. Updated `/server/tests/routes/chat.test.ts`
- Added test that verifies the chat route logs properly
- Test accounts for dev mode where userId is undefined

## Test Results
All 97 tests passing:
- 11 test files
- No failures
- New pseudonym test integrated seamlessly

## Key Design Decisions
- SessionManager is a true singleton (not per-request)
- Pseudonym generation is deterministic per userId per day (via HMAC)
- No circular dependencies - sessionSingleton.ts only imports session.ts
- Graceful degradation when auth is unavailable

## Commit
`feat: wire SessionManager singleton + pseudonym logging (C8)`
