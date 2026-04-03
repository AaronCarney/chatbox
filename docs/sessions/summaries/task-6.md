# Task 6: Credentialless Iframe + Origin Enforcement (C7, C10)

## Status
COMPLETE

## What Was Done

### C7 — Credentialless iframe
Added `{...{ credentialless: '' } as any}` spread to `IframeManager.tsx` via JSX spread (React doesn't type this attribute natively).

### C10 — PostMessage origin enforcement (inbound)
- `ChatBridgeApp.tsx`: Changed `new PostMessageBroker([])` to `new PostMessageBroker([window.location.origin])` so the broker rejects messages not originating from the app's own origin.
- `sdk/chatbridge-sdk.js`: Added `let parentOrigin = '*'` to internal state. On `task.launch`, captures `event.origin` into `parentOrigin`. All four `window.parent.postMessage(envelope, '*')` calls updated to use `parentOrigin` (sendState, respondToTool, resize, complete non-port path).

### Design note
Outbound `PostMessageBroker.sendToIframe` was intentionally left using `'*'` — sandboxed iframes without `allow-same-origin` have effective origin `null`, so posting with a specific origin causes silent drops. Origin enforcement is inbound only.

## Verification

- `pnpm tsc --noEmit`: no errors in modified files (pre-existing unrelated errors in electron-vite config and other files)
- `cd server && pnpm test`: 91/91 tests pass

## Files Modified
- `src/renderer/components/iframe/IframeManager.tsx`
- `src/renderer/components/ChatBridgeApp.tsx`
- `sdk/chatbridge-sdk.js`
