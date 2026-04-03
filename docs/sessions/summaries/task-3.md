# Task 3: get_app_state Handler + SDK State Protocol + Spotify Payload Fix

## What was built

Platform-level `get_app_state` tool handling with a MessageChannel-based state request protocol.

## Files modified

- `src/renderer/components/iframe/PostMessageBroker.ts` — added `requestState(appId, iframe)` using MessageChannel with 5s timeout
- `sdk/chatbridge-sdk.js` — added `state.request` message handler that calls `stateRequest` handler and replies via port; added `onStateRequest(handler)` to public API
- `apps/chess/bridge.js` — registered `ChatBridge.onStateRequest` returning `ChessEngine.getState(game)`
- `apps/go/bridge.js` — registered `ChatBridge.onStateRequest` returning `GoEngine.getState(engine)`
- `apps/spotify/app.js` — registered `ChatBridge.onStateRequest` returning auth status; fixed `payload.tool` → `payload.name` in toolInvoke handler (4 occurrences)
- `src/renderer/components/ChatBridgeApp.tsx` — added `get_app_state` case: looks up app by `args.app_id` or falls back to `getActiveApp()`, calls `brokerRef.current.requestState()`, stringifies result to `addToolResult`

## Test results

88/88 server tests passing. TSC: no errors in modified files (pre-existing errors in unrelated files unchanged).

## Commit

`ad8861c feat: get_app_state handler + SDK state protocol + fix Spotify payload.name (C2)`
