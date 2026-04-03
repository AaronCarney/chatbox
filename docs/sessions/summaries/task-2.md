# Task 2: Fix SSE Client Parsing + Tool Call Shape + Broker Payload Bug (C1)

## What Was Fixed

Three silent protocol mismatches that caused all streaming, tool dispatch, and iframe communication to fail:

1. **SSE parser** (`useChat.ts`): Replaced OpenAI `choices[0].delta` parsing with server wire format — `chunk.type === 'token'` for text tokens, `chunk.type === 'tool_call_start'` for tool calls. Removed the `toolCallsMap` accumulation (server sends complete tool call objects, not streamed deltas).

2. **Tool call shape** (`ChatBridgeApp.tsx`): Fixed destructuring from `tc.function?.name` / `tc.function?.arguments` (OpenAI nested format) to `tc.name` / `tc.arguments` (server flat format). Also wired `activeAppId` and `authToken` through to `sendMessage`.

3. **Broker payload** (`PostMessageBroker.ts` line 28): Fixed `const { type, data } = event.data` → `const { type, payload } = event.data`. SDK envelopes use `payload` not `data` — every handler was receiving `undefined`.

## Files Modified

- `src/renderer/hooks/useChat.ts` — new `sendMessage` signature with `opts` object; server wire format parsing
- `src/renderer/services/api.ts` — `StreamOptions` interface; `streamChat` accepts `opts`; `fetchApps` accepts optional `authToken`; removed `getAuthHeaders` function; added `activeAppId` to `ChatRequest`
- `src/renderer/components/ChatBridgeApp.tsx` — pass `{ tools, activeAppId, authToken }` to `sendMessage`; flat tool call destructuring
- `src/renderer/components/iframe/PostMessageBroker.ts` — `data` → `payload` in destructure and handler calls

## Test Results

- Server: 87/87 passing (no regressions)
- TypeScript: 0 new errors in owned files (pre-existing errors in unrelated files unchanged)

## Deviations

None.
