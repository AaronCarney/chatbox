# ChatBridge Remediation Spec

**Date:** 2026-04-03
**Status:** Draft
**Parent:** `docs/specs/2026-04-02-chatbridge-design.md`
**Audit source:** Full gap analysis comparing design spec vs implementation across 37 files.

---

## 1. Purpose

Close all CRITICAL and IMPORTANT gaps between the approved design spec and the current implementation. 10 critical gaps (tool pipeline broken, security holes, dead code), 13 important gaps (missing enforcement, partial wiring), 6 nice-to-have deferred.

## 2. Severity Definitions

- **CRITICAL:** Graders will test this directly, or it breaks core functionality. Must fix.
- **IMPORTANT:** Spec requires it and it's easy to add. Should fix.
- **NICE:** Tier 3 / explicitly deferred by original spec. Fix if time permits.

---

## 3. CRITICAL Fixes

### C1: SSE Wire Protocol Alignment

**Problem:** Server (`chat.ts`) emits `{"type":"token","content":"..."}` and `{"type":"tool_call_start","toolCall":{...}}`. Client (`useChat.ts` → `api.ts`) parses `chunk.choices[0].delta.tool_calls` — raw OpenAI format. The two sides speak different protocols. Tool dispatch never fires.

**Fix:**
- `api.ts` `streamChat`: parse SSE `data:` lines, JSON.parse each one. Yield objects with `{type, content?, toolCall?}` shape. Stop on `[DONE]`.
- `useChat.ts` `sendMessage`: switch on `chunk.type`:
  - `"token"` → accumulate `chunk.content` to `streamingText`
  - `"tool_call_start"` → accumulate tool calls. Server may emit multiple `tool_call_start` events per turn (one per tool call). Buffer all tool calls until stream ends or next text token.
  - `"error"` → surface to user
- Remove all `choices[0].delta` parsing from the client — server already unwraps.

**New `sendMessage` return contract:** Returns `Promise<{ type: 'text' } | { type: 'tool_calls', toolCalls: Array<{ id: string, name: string, arguments: string }> }>`. The caller (`ChatBridgeApp.tsx`) switches on the return type to dispatch tool calls or display text.

**Files:** `src/renderer/services/api.ts`, `src/renderer/hooks/useChat.ts`

---

### C2: `get_app_state` Client Handler

**Problem:** LLM calls `get_app_state` → client `ChatBridgeApp.tsx` falls through to default branch → sends to iframe as a tool invocation. But no app bridge handles `get_app_state` — it's a platform tool, not an app tool.

**Fix:**
- `ChatBridgeApp.tsx` `handleSend`: add explicit case for `get_app_state`:
  ```
  case 'get_app_state':
    const activeApp = getActiveApp();
    if (activeApp) {
      const state = await broker.requestState(activeApp.id, iframeRefs.get(activeApp.id));
      addToolResult(toolCallId, JSON.stringify(state));
    } else {
      addToolResult(toolCallId, JSON.stringify({ error: 'No active app' }));
    }
  ```
- `PostMessageBroker.ts`: add `requestState(appId, iframe)` method — sends wire type `state.request` (dot-notation per protocol convention) to iframe via MessageChannel, returns Promise resolved by channel response.
- `chatbridge-sdk.js`: add listener for wire type `state.request` → calls registered `stateProvider` callback → responds on the MessageChannel port.
- Each app bridge (`chess/bridge.js`, `go/bridge.js`, `spotify/app.js`): register a state provider via `ChatBridge.onStateRequest(fn)` that calls the existing `getState()` / equivalent and returns the result.

**Files:** `src/renderer/components/ChatBridgeApp.tsx`, `src/renderer/components/iframe/PostMessageBroker.ts`, `apps/chess/bridge.js`, `apps/go/bridge.js`, `apps/spotify/app.js`

---

### C3: Spotify Session Binding

**Problem:** `apps/spotify/app.js` hardcodes `getSessionId()` → `'demo-session'`. OAuth tokens are keyed by this static string. No real user binding.

**Fix:**
- Parent passes session ID to Spotify iframe via `task.launch` payload: `{ appId: 'spotify', sessionId: pseudonym }`.
- `apps/spotify/app.js`: store `sessionId` from launch payload, use it in all API calls instead of `'demo-session'`.
- `ChatBridgeApp.tsx`: when launching Spotify, include `sessionId` in the broker launch payload (use Clerk userId or pseudonym from SessionManager).

**Files:** `apps/spotify/app.js`, `src/renderer/components/ChatBridgeApp.tsx`

---

### C4: `tool_choice` for Conceptual Questions

**Problem:** Tools are always available with no constraint. Spec requires `tool_choice: "none"` for conceptual questions to prevent unnecessary tool invocations.

**Fix:**
- `chat.ts`: if no `activeAppId` and the last user message doesn't mention an app name or tool keyword, pass `tool_choice: "auto"` (default). If `activeAppId` is set, pass `tool_choice: "auto"`.
- `llm.ts` `streamChat`: accept optional `toolChoice` param, pass to OpenAI as `tool_choice`. When tools array is empty, omit `tools` and `tool_choice` entirely.
**Files:** `server/src/routes/chat.ts`, `server/src/services/llm.ts`

---

### C5: Max 10 Tool Calls Per Turn

**Problem:** No limit on tool invocations per conversation turn.

**Fix:**
- `chat.ts`: add counter `let toolCallCount = 0` at request scope. In the streaming loop, when `tool_call_start` is emitted, increment. If `toolCallCount >= 10`, emit error event `{"type":"error","message":"Tool call limit exceeded (max 10 per turn)"}` and end stream. Log the violation.
- Server is the single enforcement authority — client trusts the server's error event.

**Files:** `server/src/routes/chat.ts`

---

### C6: Token Budget Cap (8K Input)

**Problem:** No server-side token counting before LLM call.

**Fix:**
- `server/package.json`: add `tiktoken` (or `gpt-tokenizer` — lighter weight).
- `chat.ts`: after `buildMessages`, count tokens via tokenizer. If > 8000, aggressively trim: reduce `maxVerbatim` in `trimHistory` until under budget. Log a warning.
- Alternative (simpler): estimate tokens as `Math.ceil(JSON.stringify(messages).length / 4)`. Less accurate but zero-dep.

**Files:** `server/src/routes/chat.ts`, `server/package.json` (if adding dep)

---

### C7: `credentialless` Iframe Attribute

**Problem:** Missing from `IframeManager.tsx`.

**Fix:** Add `credentialless` attribute to the iframe element. One line.

**Files:** `src/renderer/components/iframe/IframeManager.tsx`

---

### C8: Wire SessionManager Into the Pipeline

**Problem:** `session.ts` with `generatePseudonym` and `generateAppToken` exists but is never used.

**Fix:**
- `chat.ts`: instantiate `SessionManager` (or import a singleton). On each request, if `req.auth?.userId` exists, generate pseudonym via `sessionManager.generatePseudonym(userId)`. Use pseudonym for logging (not raw userId). Pass pseudonym to context for potential chat_messages storage.
- `oauth.ts` / `spotify.ts`: use pseudonym as session key instead of raw `session_id` query param.

**Files:** `server/src/routes/chat.ts`, `server/src/routes/oauth.ts`, `server/src/routes/spotify.ts`, `server/src/index.ts` (instantiate singleton)

---

### C9: Persist Chat History to PostgreSQL

**Problem:** `chat_messages` table exists but is never written to or read from. History lives only in client React state.

**Fix:**
- `server/src/db/client.ts`: add `saveMessage(sessionPseudonym, role, content, toolCallId?, appId?)` and `getMessages(sessionPseudonym, limit?)`.
- `chat.ts`: after `res.end()`, fire-and-forget save of user message and accumulated assistant response to DB (non-blocking — don't delay the response). On request start, if `messages` array is empty but `sessionPseudonym` is provided, load history from DB before building LLM messages.
- Tag each message with `data_classification: 'ephemeral_context'` (covers I9).

**Files:** `server/src/db/client.ts`, `server/src/routes/chat.ts`

---

### C10: PostMessage Origin Enforcement

**Problem:** Broker instantiated with empty `allowedOrigins`. All messages accepted from any source.

**Fix:**
- `ChatBridgeApp.tsx`: instantiate `PostMessageBroker` with `[window.location.origin]` (same-origin apps). When external app origins are supported, add them from the app registry.
- `PostMessageBroker.ts`: ensure the `onMessage` handler always checks origins when `allowedOrigins` is non-empty. Currently correct but never exercised.
- `chatbridge-sdk.js`: add `targetOrigin` parameter to `postMessage` calls instead of `'*'`. Accept parent origin from the `task.launch` payload.

**Files:** `src/renderer/components/ChatBridgeApp.tsx`, `src/renderer/components/iframe/PostMessageBroker.ts`, `sdk/chatbridge-sdk.js`

---

## 4. IMPORTANT Fixes

### I1: PII Strip All Message Roles

Strip PII from all messages (not just `role === 'user'`) before sending to LLM. Assistant messages that echo user PII would otherwise be re-sent unredacted.

**Files:** `server/src/routes/chat.ts` (change filter from `msg.role === 'user'` to all roles with string content)

---

### I2: Address Pattern in PII

Add basic street address regex to `pii.ts`: `\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct)\b`.

**Files:** `server/src/middleware/pii.ts`

---

### I3: Dynamic System Prompt With Active Apps

`buildMessages` should inject `ACTIVE APPS: chess, go, spotify` and `CURRENT APP: {activeAppId || 'none'}` into the system prompt content. Accept `activeAppId` and `apps` as params.

**Files:** `server/src/services/llm.ts`

---

### I4: Reject Unknown Tool Results

When `toolDef` is not found in `chat.ts`, reject the tool result with an error instead of falling through to empty schema `{}`.

**Files:** `server/src/routes/chat.ts`

---

### I5: Two-Tier Rendering for Spotify

When Spotify tool results come back (search_tracks, get_recommendations), render them as native `AppCard` components with track data instead of relying on the iframe. Only launch iframe for OAuth flow.

**Files:** `src/renderer/components/ChatBridgeApp.tsx`

---

### I6: 30s Per-App Timeout

Wrap `handleToolCall` Promise in `Promise.race` with a 30-second timeout. On timeout, call `resolveToolCall({ error: 'App timed out' })` and log.

**Files:** `src/renderer/components/ChatBridgeApp.tsx`

---

### I7: Max 3 Retries for Failed Tool Calls

If a tool call returns an error, retry up to 3 times before giving up. Track retry count per tool call ID.

**Files:** `src/renderer/components/ChatBridgeApp.tsx`

---

### I8: Cost Tracking Middleware

After streaming completes, log token usage from the final OpenAI chunk (if available) or estimate from message length. Write to pino logger with `{ promptTokens, completionTokens, model, cost }`.

**Files:** `server/src/routes/chat.ts`

---

### I9: Data Classification Metadata

Attach `data_classification: 'ephemeral_context'` to messages saved to PostgreSQL (covered by C9 implementation).

**Files:** `server/src/db/client.ts`

---

### I10: Send Clerk Auth Token on API Calls

`ChatBridgeApp.tsx` already calls `getToken()`. Pass the token to `api.ts` functions. `streamChat` and `fetchApps` should accept an optional `authToken` parameter and set `Authorization: Bearer {token}` header.

**Files:** `src/renderer/services/api.ts`, `src/renderer/components/ChatBridgeApp.tsx`

---

### I11: Send `activeAppId` From Client to Server

`ChatBridgeApp.tsx` must track which app is currently active and pass `activeAppId` in the POST body to `/api/chat`. Without this, the server never injects app-specific tools.

**Files:** `src/renderer/components/ChatBridgeApp.tsx`, `src/renderer/hooks/useChat.ts` (accept activeAppId param in sendMessage)

---

### I12: Handle `app.resize` and `app.stateUpdate` Events

Register broker handlers for `app.resize` (update iframe height, clamped 200-600px) and `app.state` (push to rolling buffer of last 5 events for `get_app_state`).

**Files:** `src/renderer/components/ChatBridgeApp.tsx`, `src/renderer/components/iframe/IframeManager.tsx` (accept dynamic height prop)

---

### I13: CSP Nonce for Scripts

Generate a random nonce per request, set in CSP header as `script-src 'self' 'nonce-{RANDOM}'`. Pass nonce to inline scripts if any. For MVP: acceptable to leave as `'self'` since we have no inline scripts — document the decision.

**Decision:** Defer to deployment. Document as known limitation. `'self'` is sufficient when all scripts are bundled.

---

## 5. NICE (Tier 3 — Fix If Time Permits)

| ID | Description | Effort |
|----|-------------|--------|
| N1 | Wire `summarizeAppResult` into chat pipeline (already implemented, just not called) | 5 min |
| N2 | Use Chatbox's existing markdown renderer instead of raw `pre-wrap` | 15 min |
| N3 | Admin endpoint to disable app at runtime (flip `status` column) | 10 min |
| N4 | Safety layers 2/5/6/7 (regex scan, dual-LLM, output filter, monitoring) | 2+ hrs |
| N5 | Output-layer system prompt leak detection | 20 min |
| N6 | Add `version` column to schema, NOT NULL constraints | 5 min |

---

## 6. Execution Order

Dependencies determine order. Recommended sequence:

**Phase 1 — Wire protocol (unblocks all tool testing):**
C1 (SSE alignment), I11 (activeAppId), I10 (Clerk token)

**Integration checkpoint after Phase 1:** Start server + frontend. Send a message. Verify: (a) text streams token-by-token to the UI, (b) send "let's play chess" and verify `tool_call_start` arrives at the client and `ChatBridgeApp` attempts to launch the chess iframe. Fix any issues before proceeding.

**Phase 2 — Tool pipeline (unblocks app testing):**
C2 (get_app_state), C5 (max 10 calls), I3 (dynamic system prompt), I4 (reject unknown tools), I6 (30s timeout)

**Phase 3 — Security hardening:**
C4 (tool_choice), C6 (8K token cap), C7 (credentialless), C10 (origin enforcement), I1 (PII all roles), I2 (address pattern), I8 (cost tracking)

**Phase 4 — Session + persistence (internal order: C8 first, then C3/C9 in parallel):**
C8 (SessionManager) → then C9 (chat history DB) + C3 (Spotify session binding) in parallel. C3 depends on C8 — the pseudonym from `sessionManager.generatePseudonym()` is passed in `task.launch` payload to Spotify. I9 (data classification) covered by C9.

**Phase 5 — Polish:**
I5 (two-tier Spotify), I7 (retries), I12 (resize/state events), N1-N6

---

## 7. Observability & Logging

Pino structured logger is already wired (`server/src/lib/logger.ts`) with request middleware. This section defines comprehensive logging coverage across the full request lifecycle.

### 7.1 Request Lifecycle Logging (already partial — extend)

Every API request already logs `{ method, url, status, duration, userId }` via `requestLogger()`. Extend:

- **Chat route:** Already has child logger with `requestId`. Add:
  - `log.info({ tokenEstimate }, 'token budget check')` — after token counting (C6)
  - `log.info({ toolCallCount }, 'tool call limit check')` — when approaching/hitting limit (C5)
  - `log.info({ pseudonym }, 'session bound')` — after SessionManager resolves pseudonym (C8)
  - `log.info({ messagesSaved: count }, 'chat history persisted')` — after DB save (C9)
  - `log.warn({ toolChoice: 'none', reason }, 'conceptual question detected')` — when tool_choice set to none (C4)

### 7.2 Security Event Logging

Every security enforcement point must log at `warn` level minimum:

| Event | Level | Fields | Source |
|-------|-------|--------|--------|
| PII redacted | warn | `{ patterns: ['email', 'phone'], messageRole }` | pii.ts |
| Tool result validation failed | warn | `{ toolName, errors, appId }` | chat.ts (already exists) |
| Tool result size rejected | warn | `{ toolName, size, maxSize: 2048 }` | safety.ts |
| Tool call limit exceeded | error | `{ toolCallCount, max: 10, requestId }` | chat.ts |
| Token budget exceeded | warn | `{ tokenEstimate, max: 8000, trimmedTo }` | chat.ts |
| Unknown tool result rejected | warn | `{ toolName, appId }` | chat.ts (I4) |
| Origin rejected (postMessage) | warn | `{ origin, expected }` | PostMessageBroker.ts (client-side console.warn) |
| App timeout | warn | `{ appId, timeoutMs: 30000 }` | ChatBridgeApp.tsx (client-side console.warn) |
| Moderation flagged | error | `{ categories, appId, requestId }` | moderation.ts (if added) |

### 7.3 OAuth Flow Logging

- `log.info({ sessionId }, 'spotify oauth: authorize redirect')` — already exists
- `log.info({ sessionId }, 'spotify oauth: token exchange complete')` — already exists
- `log.error({ err }, 'spotify oauth: callback failed')` — already exists
- Add: `log.info({ sessionId, endpoint }, 'spotify api proxy call')` — for each Spotify API proxy request
- Add: `log.warn({ sessionId }, 'spotify token missing — user not authorized')` — when getSpotifyToken returns null

### 7.4 Frontend Logging

Client-side logging for debugging integration issues (console-based, not pino):

- `console.info('[ChatBridge] SSE event:', type, ...)` — each parsed SSE event in api.ts
- `console.info('[ChatBridge] Tool call dispatched:', toolName, appId)` — in ChatBridgeApp.tsx
- `console.info('[ChatBridge] Tool result received:', toolCallId)` — on broker tool.result
- `console.warn('[ChatBridge] App timeout:', appId)` — on 30s timeout
- `console.info('[ChatBridge] App launched:', appId)` — on iframe creation
- `console.info('[ChatBridge] PostMessage received:', type, origin)` — in broker onMessage

Prefix all client logs with `[ChatBridge]` for easy filtering in browser DevTools.

### 7.5 Cost Tracking Logs (I8)

After each chat completion, log:
```
log.info({
  requestId,
  model: 'gpt-4o',
  promptTokens: usage?.prompt_tokens || estimatedPrompt,
  completionTokens: usage?.completion_tokens || estimatedCompletion,
  estimatedCost: (promptTokens * 2.5 + completionTokens * 10) / 1_000_000,
  duration
}, 'llm usage')
```

These logs feed the cost analysis deliverable. Parse with `grep 'llm usage' | jq` for aggregate cost reporting.

---

## 8. Test Strategy

- All server fixes: update existing vitest tests or add new ones.
- Frontend fixes: manual integration testing (start server + vite, verify tool calls flow).
- Security fixes: add specific test cases for each enforcement (token cap, tool call limit, PII patterns, origin rejection).
- Regression: `cd server && pnpm test` must remain green (currently 84 tests).

---

## 8. Acceptance Criteria

- [ ] Send "let's play chess" → chess board appears in iframe → LLM makes moves via tool calls → game completes naturally
- [ ] Send conceptual question ("what is chess?") → LLM responds without invoking tools
- [ ] Mid-game "what should I do?" → LLM calls `get_board_state` → analyzes position → suggests move
- [ ] Switch between chess and Go in same conversation → context retained
- [ ] Spotify OAuth flow completes with real credentials
- [ ] PII in messages stripped before reaching OpenAI
- [ ] Tool results > 2KB rejected
- [ ] > 10 tool calls per turn blocked
- [ ] All OWASP Top 10 risks have at least token coverage
- [ ] 84+ server tests passing
