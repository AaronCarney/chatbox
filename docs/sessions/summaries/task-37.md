# Task 37: App Timeout + Retries (I6 + I7)

**Status:** COMPLETE

## Summary

Added 30-second timeout and max 3 retries for tool call execution to prevent infinite hangs when apps fail to respond.

## Changes

**File:** `src/renderer/components/ChatBridgeApp.tsx`

### New Helper: `dispatchToolToApp`

Extracted timeout + retry logic into a reusable `useCallback`:

- **Timeout:** Promise.race wraps tool call promise with 30s timeout
- **Retries:** Loops up to 3 attempts, logs each failure, continues on transient errors
- **Error handling:** Captures last error message and returns it to user
- **Dependencies:** Uses existing hooks (handleToolCall, resolveToolCall, iframeRefs)

### Updated Default Case

Replaced inline tool dispatch code with single call to `dispatchToolToApp`:

```typescript
default: {
  const activeApp = getActiveApp()
  if (activeApp) {
    const result = await dispatchToolToApp(id, name, parseArgs(), activeApp)
    addToolResult(id, JSON.stringify(result))
  } else {
    addToolResult(id, JSON.stringify({ error: 'No active app' }))
  }
  break
}
```

## Testing

- Server tests: 96/96 passing
- No new TypeScript errors introduced
- Callback dependency chain verified

## Implementation Notes

- Helper is purely async/await without breaking existing flow
- Reuses existing PostMessageBroker and iframe ref infrastructure
- Logs warnings on each retry attempt for debugging
- Returns error structure consistent with other tool handlers

## Commit

c08b4918e7e3a5c05f8bde3e8dfef3acaa9becd
