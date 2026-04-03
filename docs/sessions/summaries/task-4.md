# Task 4: Redis Session Manager — Summary

## Status
COMPLETE

## Deliverables

### 1. Dependencies Added
- ioredis — added to `server/package.json` for future Redis integration

### 2. Tests Implemented
File: `server/tests/services/session.test.ts`
- 8 test cases covering:
  - `generatePseudonym()`: 16-char hex, deterministic per user+date, varies by user
  - `generateAppToken()`: 32-char hex, deterministic per pseudonym+appId, varies by both inputs
  - `sessionKey()`: returns session:-prefixed Redis key

All tests pass (9/9 total with existing health test).

### 3. Implementation
File: `server/src/services/session.ts`

**SessionManager class:**
```
- Constructor: accepts { secret, ttlSeconds }
- generatePseudonym(userId): HMAC-SHA256(secret, userId:YYYY-MM-DD), sliced to 16 chars
- generateAppToken(pseudonym, appId): HMAC-SHA256(secret, pseudonym:appId), sliced to 32 chars
- sessionKey(pseudonym): returns 'session:' + pseudonym
```

**Design Notes:**
- Uses Node.js built-in `crypto.createHmac()` — no additional dependencies needed for hashing
- Pseudonym determinism tied to calendar date (YYYY-MM-DD) — same user, same day → same pseudonym
- Different date → different pseudonym (privacy-per-session)
- App tokens are app-specific — same pseudonym can't be reused across apps

## Testing
- TDD workflow: tests written first, then implementation
- All tests pass: `pnpm test` returns 9/9
- No breaking changes to existing tests

## Files Changed
- `server/src/services/session.ts` — new implementation
- `server/tests/services/session.test.ts` — new test suite
- `server/package.json` — ioredis dependency

## Commit
`feat: session manager with HMAC pseudonyms` (c30a9ab)
