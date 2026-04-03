# Task 16: Two-Tier Spotify Rendering (I5)

## Status: COMPLETE

## What Was Done

Added `search_tracks` and `get_recommendations` switch cases to the `handleSend` tool dispatch loop in `ChatBridgeApp.tsx`, before the `default` case.

When either tool fires:
1. `dispatchToolToApp` forwards the call to the active iframe app (same as the default path).
2. The raw result is fed back via `addToolResult`.
3. If `result.tracks` is an array, up to 5 tracks are mapped into an `AppCard` payload and appended to `completedActivities`, rendering natively in the chat UI instead of relying solely on the Spotify iframe.

## Files Changed

- `src/renderer/components/ChatBridgeApp.tsx` — 31 lines added

## Verification

- `pnpm tsc --noEmit`: no errors in ChatBridgeApp.tsx (pre-existing unrelated errors elsewhere unchanged)
- `cd server && pnpm test`: 99/99 tests pass
