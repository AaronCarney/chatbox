# Task 15: Spotify Session Binding (C3)

## Summary
Fixed hardcoded `demo-session` ID in Spotify app. OAuth tokens now keyed by per-session UUID via launch payload.

## Changes
1. **apps/spotify/app.js**: Moved `getSessionId()` to variable; updated `ChatBridge.on('launch')` to accept `sessionId` from payload
2. **src/renderer/components/iframe/PostMessageBroker.ts**: Updated `launchApp()` signature to accept optional `extra` data, spreads into launch payload
3. **src/renderer/components/ChatBridgeApp.tsx**: Added `sessionIdRef = useRef(crypto.randomUUID())`; on `launch_app` tool, setTimeout 500ms to call `brokerRef.current.launchApp(iframe, appId, { sessionId })`

## Testing
- TypeScript: No new errors in modified files
- Server tests: All 99 pass
- Commit: `6c1a5781e6f8547fa4efd27d7699499c63ff50e9`

## Status
COMPLETE. Each Spotify session now has a unique session ID, enabling per-session OAuth token storage.
