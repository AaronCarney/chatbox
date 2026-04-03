# Task 29: Clerk Auth Middleware — Summary

## Completed
- Installed `@clerk/express` package to `server/package.json`
- Created `server/src/middleware/auth.ts` with:
  - `clerkAuth` = `clerkMiddleware()` for global auth state
  - `requireSession` = `requireAuth()` for protected route enforcement
- Updated `server/src/index.ts` to:
  - Import auth middleware
  - Apply `clerkAuth` globally (before routes)
  - Apply `requireSession` to `/api/chat` and `/api/oauth` (protected)
  - Leave `/api/health` and `/api/apps` public
  - Added comment about frontend `@clerk/clerk-react` setup
- Created `server/tests/setup.ts` to mock `@clerk/express` in test environment
- Updated `vitest.config.ts` to include test setup file
- All 67 tests passing

## Implementation Notes
- Middleware pattern follows Clerk Express docs: global `clerkMiddleware()` first, then route-specific `requireAuth()` for protected paths
- Mock strategy: Pass-through middleware in tests that sets minimal auth state (`userId: 'test-user-id'`) to avoid Clerk key requirement failures
- Health and apps routes remain public; chat and oauth routes require authentication

## Files Modified
- `server/src/middleware/auth.ts` (created)
- `server/src/index.ts` (updated)
- `server/package.json` (updated)
- `server/vitest.config.ts` (updated)
- `server/tests/setup.ts` (created)
