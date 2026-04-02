# ChatBridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI chat platform with third-party app integration for K-12 education, forking Chatbox as the base.

**Architecture:** Chatbox web fork (Vite SPA) + Express backend + 3 standalone iframe apps (Chess, Go, Spotify). PostMessage protocol for parent-iframe comms. OpenAI GPT-4o for LLM with function calling. Redis for ephemeral sessions, PostgreSQL for persistence.

**Tech Stack:** React 18, Mantine, Vite, Express, TypeScript, OpenAI SDK, chess.js, Redis, PostgreSQL, Clerk

**Spec:** `docs/specs/2026-04-02-chatbridge-design.md`

---

## File Structure

```
chatbridge/
├── src/renderer/                          # Chatbox fork (web frontend)
│   ├── components/iframe/
│   │   ├── IframeManager.tsx              # Iframe lifecycle (create, hide, destroy, sandbox)
│   │   ├── PostMessageBroker.ts           # CHATBRIDGE_V1 protocol handler
│   │   └── AppCard.tsx                    # Structured JSON result cards
│   ├── components/chat/
│   │   └── ToolCallIndicator.tsx          # Loading states during tool execution
│   ├── hooks/
│   │   ├── useChat.ts                     # Server-proxied chat hook (replaces direct LLM)
│   │   ├── useIframeApps.ts               # Iframe lifecycle hook
│   │   └── useToolExecution.ts            # Tool call state machine
│   ├── services/
│   │   └── api.ts                         # Server API client
│   └── ... (existing Chatbox, stripped of Electron)
├── server/
│   ├── src/
│   │   ├── index.ts                       # Express entry, middleware stack
│   │   ├── routes/
│   │   │   ├── chat.ts                    # POST /api/chat with SSE streaming + tool orchestration
│   │   │   ├── apps.ts                    # GET /api/apps, GET /api/apps/:id
│   │   │   ├── auth.ts                    # POST /api/auth/webhook (Clerk)
│   │   │   ├── oauth.ts                   # GET /api/oauth/spotify/*
│   │   │   └── spotify.ts                 # Spotify API proxy routes
│   │   ├── middleware/
│   │   │   ├── auth.ts                    # Clerk session verification
│   │   │   ├── rateLimit.ts               # Per-user rate limiting
│   │   │   └── safety.ts                  # Schema validation + delimiter isolation
│   │   ├── services/
│   │   │   ├── session.ts                 # Redis + HMAC pseudonyms
│   │   │   ├── llm.ts                     # OpenAI streaming + tool call detection
│   │   │   ├── tools.ts                   # Tool router + injection
│   │   │   └── context.ts                 # Token budget + progressive degradation
│   │   └── db/
│   │       ├── schema.sql                 # PostgreSQL tables
│   │       ├── client.ts                  # pg client + queries
│   │       └── seed.ts                    # Seed data for 3 apps
│   ├── tests/                             # Server unit tests (vitest)
│   ├── package.json
│   └── tsconfig.json
├── apps/
│   ├── chess/
│   │   ├── index.html
│   │   ├── app.js                         # chess.js + board UI + ChatBridge SDK
│   │   └── styles.css
│   ├── go/
│   │   ├── index.html
│   │   ├── app.js                         # Go engine + canvas board + ChatBridge SDK
│   │   └── styles.css
│   └── spotify/
│       ├── index.html
│       ├── app.js                         # Search/playlist UI + ChatBridge SDK
│       └── styles.css
├── sdk/
│   └── chatbridge-sdk.js                  # Lightweight postMessage SDK for app developers
└── docs/
```

---

## Wave 1: Foundation (sequential, 2 tasks)

### Task 1: Fork Chatbox + Strip to Web-Only

**Files:**
- Fork: `https://github.com/chatboxai/chatbox` -> GitLab repo
- Delete: `src/main/`, `src/preload/`, `electron-builder.yml`, `.erb/`, `resources/`
- Modify: `electron.vite.config.ts` -> `vite.config.ts`
- Modify: `src/renderer/platform/index.ts`
- Modify: `package.json`

**IMPORTANT:** The PRD requires pushing to GitLab. Fork the Chatbox repo on GitLab (or create a new GitLab repo and push the forked code there). Set GitLab as the primary remote.

**Escape hatch:** If web build does not work after 4 hours, scaffold fresh Vite+React+Mantine app, cherry-pick chat components.

- [ ] Fork https://github.com/chatboxai/chatbox to GitLab (create GitLab repo, clone Chatbox, set GitLab as origin)
- [ ] Delete Electron dirs: `src/main`, `src/preload`, `.erb`, `resources`, `electron-builder.yml`
- [ ] Convert `electron.vite.config.ts` to standard `vite.config.ts` keeping only the renderer config (plugins: TanStackRouterVite, react, tailwindcss; root: src/renderer; aliases for @ and @shared)
- [ ] Simplify `src/renderer/platform/index.ts` to always return WebPlatform (remove Electron detection)
- [ ] Delete `desktop_platform.ts`
- [ ] Clean package.json: remove electron deps, update scripts to `dev: vite`, `build: tsc && vite build`
- [ ] Run `pnpm install && pnpm dev`, verify UI loads at localhost:5173
- [ ] Commit: `chore: strip Chatbox to web-only Vite build`

---

### Task 2: Express Server Scaffold

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/src/index.ts`, `server/src/routes/health.ts`
- Test: `server/tests/health.test.ts`

- [ ] Create server directory structure
- [ ] Write server/package.json (express, cors, dotenv + dev deps: tsx, typescript, vitest, supertest)
- [ ] Write server/tsconfig.json (ES2022, ESNext modules, strict)
- [ ] Write failing test: GET /api/health returns 200 with `{ status: 'ok' }`
- [ ] Implement server/src/index.ts (express app with cors, json, exported for testing) and server/src/routes/health.ts
- [ ] Run `cd server && pnpm install && pnpm test`, verify PASS
- [ ] Commit: `feat: Express server scaffold with health check`

---

## Wave 2: Core Infrastructure (parallel, 7 tasks)

Dependencies: Wave 1 complete.

### Task 3: Redis Session Manager

**Files:**
- Create: `server/src/services/session.ts`
- Test: `server/tests/services/session.test.ts`

HMAC pseudonymous sessions per spec section 2 and section 7.

- [ ] `cd server && pnpm add ioredis`
- [ ] Write tests: generatePseudonym is deterministic for same user+date, different for different users. generateAppToken is different per app, deterministic per pseudonym+app.
- [ ] Implement SessionManager class: generatePseudonym(userId) uses HMAC-SHA256(secret, userId+date), generateAppToken(pseudonym, appId) uses HMAC-SHA256(secret, pseudonym+appId), sessionKey(pseudonym) returns `session:{pseudonym}`
- [ ] Run tests, commit: `feat: session manager with HMAC pseudonyms`

---

### Task 4: PostgreSQL Schema + App Registry API

**Files:**
- Create: `server/src/db/schema.sql`, `server/src/db/client.ts`, `server/src/db/seed.ts`
- Create: `server/src/routes/apps.ts`
- Test: `server/tests/routes/apps.test.ts`

- [ ] `cd server && pnpm add pg && pnpm add -D @types/pg`
- [ ] Create schema.sql: apps table (id, name, description_for_model, iframe_url, tools JSONB, auth_type, oauth_config, trust_safety, sandbox_permissions, status) + chat_messages table
- [ ] Create client.ts: pg Pool, query helper, getApps(), getAppById()
- [ ] Create seed.ts: hardcoded entries for chess, go, spotify with full tool schemas and input_schemas with additionalProperties:false
- [ ] Write tests (mock db): GET /api/apps returns list, GET /api/apps/:id returns app or 404
- [ ] Implement apps.ts route, register in index.ts
- [ ] Run tests, commit: `feat: app registry schema, seed data, and API`

---

### Task 5: LLM Proxy with SSE Streaming

**Files:**
- Create: `server/src/services/llm.ts`, `server/src/routes/chat.ts`
- Test: `server/tests/services/llm.test.ts`

- [ ] `cd server && pnpm add openai`
- [ ] Write tests: buildMessages prepends system prompt, includes history. SYSTEM_PROMPT contains UNTRUSTED warning and Socratic reference.
- [ ] Implement llm.ts: SYSTEM_PROMPT constant, buildMessages(history, tools), streamChat async generator using OpenAI streaming
- [ ] Implement chat.ts: POST /api/chat sets SSE headers, streams chunks as `data: {json}\n\n`, ends with `data: [DONE]\n\n`
- [ ] Register in index.ts, run tests, commit: `feat: LLM proxy with SSE streaming`

---

### Task 6: ChatBridge SDK

**Files:**
- Create: `sdk/chatbridge-sdk.js`
- Test: `tests/sdk/chatbridge-sdk.test.ts`

Lightweight JS for third-party apps. CHATBRIDGE_V1 protocol.

- [ ] Implement sdk/chatbridge-sdk.js: IIFE exposing window.ChatBridge with methods on(event, handler), sendState(state), complete(status, payload, requestId), respondToTool(requestId, result), resize(height). Listens for task.launch (stores completion port) and tool.invoke messages.
- [ ] Write test verifying protocol envelope structure
- [ ] Commit: `feat: ChatBridge postMessage SDK for third-party apps`

---

### Task 7: Iframe Manager Component

**Files:**
- Create: `src/renderer/components/iframe/IframeManager.tsx`, `src/renderer/hooks/useIframeApps.ts`

Max 2 live iframes. Sandbox enforcement.

- [ ] Implement useIframeApps: Map of AppInstance (id, iframeUrl, status, lastUsed), launchApp (hide current, destroy oldest if over limit, add new as active), getActiveApp, iframeRefs
- [ ] Implement IframeManager: renders iframe with sandbox="allow-scripts" allow="" referrerPolicy="no-referrer" loading="lazy", display:block/none based on isActive, reports ref via onRef callback
- [ ] Commit: `feat: iframe manager with lifecycle and sandbox enforcement`

---

### Task 8: PostMessage Broker (Frontend)

**Files:**
- Create: `src/renderer/components/iframe/PostMessageBroker.ts`, `src/renderer/hooks/useToolExecution.ts`

- [ ] Implement PostMessageBroker class: constructor takes allowedOrigins, listens for messages, validates schema=CHATBRIDGE_V1, dispatches to type-based handlers. Methods: on(type, handler), sendToIframe(iframe, type, payload, port?), launchApp(iframe, appId) using MessageChannel for completion, destroy()
- [ ] Implement useToolExecution hook: state machine (idle/streaming/tool_call_detected/tool_executing/streaming_resumed/complete), handleToolCall returns Promise resolved by resolveToolCall
- [ ] Commit: `feat: postMessage broker + tool execution state machine`

---

### Task 9: App Card + Tool Call Indicator

**Files:**
- Create: `src/renderer/components/iframe/AppCard.tsx`, `src/renderer/components/chat/ToolCallIndicator.tsx`

- [ ] Implement AppCard: renders structured result card with colored left border (green/red/yellow), app name, title, score display, item list, encouragement text, action buttons. All content rendered via React JSX (safe by default), no raw HTML injection.
- [ ] Implement ToolCallIndicator: shows friendly status text per tool name (e.g. search_tracks -> "Searching Spotify...") with hourglass/checkmark icon
- [ ] Commit: `feat: structured app cards + tool call indicator`

---

## Wave 3: Tool Orchestration + Board Games (parallel, 5 tasks)

Dependencies: Wave 2 complete.

### Task 10: Tool Router + Schema Injection

**Files:**
- Create: `server/src/services/tools.ts`
- Test: `server/tests/services/tools.test.ts`

- [ ] Write tests: buildToolsForTurn always includes 3 platform tools (launch_app, get_app_state, get_available_apps), includes active app tools when activeAppId matches, excludes inactive app tools
- [ ] Implement: PLATFORM_TOOLS array (3 tools with OpenAI function calling format), buildToolsForTurn(apps, activeAppId) merges platform + active app tools
- [ ] Run tests, commit: `feat: tool router with platform tools + per-app injection`

---

### Task 11: Safety Pipeline

**Files:**
- Create: `server/src/middleware/safety.ts`
- Test: `server/tests/middleware/safety.test.ts`

- [ ] `cd server && pnpm add ajv`
- [ ] Write tests: validateToolResult accepts valid data, rejects additionalProperties, rejects >2KB payloads. wrapWithDelimiters produces salted tags with UNTRUSTED attribute, different salt each call.
- [ ] Implement: validateToolResult uses ajv.compile with 2KB size check. wrapWithDelimiters uses randomBytes(6) salt.
- [ ] Run tests, commit: `feat: safety pipeline layers 1+3`

---

### Task 12: Context Manager

**Files:**
- Create: `server/src/services/context.ts`
- Test: `server/tests/services/context.test.ts`

- [ ] Write tests: trimHistory keeps last N messages when over limit with summary prefix, returns all if under. summarizeAppResult returns full JSON for turns 0-2, summary for 3-5, empty string for 6+.
- [ ] Implement trimHistory and summarizeAppResult per spec section 7b degradation table
- [ ] Run tests, commit: `feat: context manager with progressive degradation`

---

### Task 13: Chess App

**Files:**
- Create: `apps/chess/index.html`, `apps/chess/app.js`, `apps/chess/styles.css`

- [ ] Create index.html: loads chess.js from CDN, /sdk/chatbridge-sdk.js, app.js
- [ ] Create styles.css: 8x8 grid board, 48px squares, light (#f0d9b5) / dark (#b58863), selected/legal-move highlights
- [ ] Implement app.js: Chess() instance, render() builds grid with createElement + Unicode pieces, click to select/move with chess.js validation, ChatBridge.sendState on moves, ChatBridge.complete on game over. ChatBridge.on('toolInvoke') handles start_game/make_move/get_board_state/get_hint. All DOM via createElement/textContent.
- [ ] Manual test in browser, commit: `feat: chess app with chess.js + ChatBridge SDK`

---

### Task 14: Go App

**Files:**
- Create: `apps/go/index.html`, `apps/go/app.js`, `apps/go/styles.css`

**Escape hatch:** If >3 hours, replace with Weather Dashboard.

- [ ] Create index.html + styles.css (canvas element)
- [ ] Implement app.js: flat board array, neighbors(), getGroup() flood-fill with liberty counting, placeStone() with capture+suicide+ko checks, passTurn() with double-pass scoring (stones+captures+6.5 komi), canvas rendering (wooden bg, grid lines, circle stones). ChatBridge integration for all 5 tools.
- [ ] Manual test in browser, commit: `feat: Go app with capture/ko/scoring + ChatBridge SDK`

---

## Wave 4: Spotify + Wiring (parallel, 7 tasks)

Dependencies: Wave 3 complete.

### Task 15: Spotify OAuth Server Proxy

**Files:**
- Create: `server/src/routes/oauth.ts`
- Test: `server/tests/routes/oauth.test.ts`

- [ ] Implement: GET /api/oauth/spotify/authorize (build Spotify auth URL with state, redirect), GET /api/oauth/spotify/callback (exchange code for tokens, store in Map), GET /api/oauth/spotify/token (check auth status). Export getSpotifyToken(sessionId).
- [ ] Test: authorize returns 302 to accounts.spotify.com
- [ ] Register in index.ts, commit: `feat: Spotify OAuth proxy`

---

### Task 16: Spotify API Proxy Routes

**Files:**
- Create: `server/src/routes/spotify.ts`

- [ ] Implement 4 proxy routes using fetch to api.spotify.com with Bearer token: GET /api/spotify/search, POST /api/spotify/playlist, POST /api/spotify/playlist/:id/tracks, GET /api/spotify/recommendations
- [ ] Register in index.ts, commit: `feat: Spotify API proxy routes`

---

### Task 17: Spotify App UI

**Files:**
- Create: `apps/spotify/index.html`, `apps/spotify/app.js`, `apps/spotify/styles.css`

- [ ] HTML + CSS: auth prompt view, connected view with search results and playlist sections, track card styling
- [ ] app.js: checkAuth polling, connect button opens OAuth popup, renderTracks builds DOM via createElement/textContent (safe rendering), ChatBridge.on('toolInvoke') for search_tracks/create_playlist/add_to_playlist/get_recommendations via fetch to server proxy
- [ ] Manual test, commit: `feat: Spotify app with OAuth + search/playlist UI`

---

### Task 18: Frontend Chat Hook

**Files:**
- Create: `src/renderer/services/api.ts`, `src/renderer/hooks/useChat.ts`

- [ ] api.ts: streamChat async generator (POST /api/chat, parse SSE body), fetchApps()
- [ ] useChat: messages state, sendMessage streams response and detects tool_calls, addToolResult, isStreaming/streamingText state
- [ ] Commit: `feat: server-proxied chat hook with SSE streaming`

---

### Task 19: Clerk Auth

**Files:**
- Create: `server/src/middleware/auth.ts`

- [ ] `cd server && pnpm add @clerk/express` + `pnpm add @clerk/clerk-react` (root)
- [ ] Server: clerkMiddleware() + requireAuth() on /api/chat and /api/oauth
- [ ] Frontend: ClerkProvider wrapping app root
- [ ] Commit: `feat: Clerk auth integration`

---

### Task 20: Rate Limiting + Security Headers

**Files:**
- Create: `server/src/middleware/rateLimit.ts`

- [ ] `cd server && pnpm add express-rate-limit helmet`
- [ ] chatLimiter (20/min), generalLimiter (100/min), helmet with CSP
- [ ] Apply in index.ts, commit: `feat: rate limiting + security headers`

---

### Task 21: Static File Serving + Dev Scripts

**Files:**
- Modify: `server/src/index.ts`, root `package.json`

- [ ] express.static for /apps and /sdk directories
- [ ] Root dev script with concurrently (`pnpm add -D concurrently`)
- [ ] Commit: `feat: static file serving + dev scripts`

---

## Wave 5: End-to-End + Deploy (parallel, 5 tasks)

Dependencies: Wave 4 complete.

### Task 22: Wire Tool Orchestration End-to-End

**Files:**
- Modify: `server/src/routes/chat.ts`

- [ ] Update chat route: accept activeAppId + toolResult in body, load apps from registry, build tools for turn, validate + delimiter-wrap tool results via safety middleware, inject as tool message, resume LLM streaming
- [ ] Commit: `feat: end-to-end tool orchestration in chat route`

---

### Task 23: Wire Frontend Integration

**Files:**
- Create: `src/renderer/components/ChatBridgeApp.tsx`

- [ ] Implement: fetches apps on mount, creates PostMessageBroker, handleSend dispatches tool calls (launch_app -> launchApp, get_available_apps -> inline response, app tools -> broker.sendToIframe), renders messages + streaming text + ToolCallIndicator + IframeManagers + input bar
- [ ] Wire into Chatbox main route
- [ ] Commit: `feat: ChatBridgeApp integration component`

---

### Task 24: Deployment Config

**Files:**
- Create: `.env.example`, `vercel.json`, `Procfile`

- [ ] .env.example with all keys, vercel.json for Vite SPA, Procfile for Railway server
- [ ] Commit: `chore: deployment config`

---

### Task 25: Cost Analysis

**Files:**
- Create: `docs/cost-analysis.md`

- [ ] Template: dev costs table, production projections at 4 scales, assumptions
- [ ] Commit: `docs: AI cost analysis`

---

### Task 26: README + API Docs

**Files:**
- Create: `README.md`, `docs/api.md`

- [ ] README: description, setup, architecture, tech stack, deployment
- [ ] API docs: all endpoints, CHATBRIDGE_V1 protocol spec, tool schema format
- [ ] Commit: `docs: README + API documentation`

---

---

## Dependency Graph

### Task Dependencies

| Task | Depends On | Blocks | Files Owned |
|------|-----------|--------|-------------|
| T1: Fork + Strip Chatbox | — | T2, T6-T9, T18 | `vite.config.ts`, `src/renderer/platform/*`, `package.json` |
| T2: Express Server Scaffold | T1 | T3-T5, T10-T12, T15, T19-T21 | `server/src/index.ts`, `server/src/routes/health.ts`, `server/package.json` |
| T3: Redis Session Manager | T2 | — | `server/src/services/session.ts` |
| T4: PostgreSQL + App Registry | T2 | T22 | `server/src/db/*`, `server/src/routes/apps.ts` |
| T5: LLM Proxy + SSE | T2 | T22 | `server/src/services/llm.ts`, `server/src/routes/chat.ts` |
| T6: ChatBridge SDK | T1 | T13, T14, T17 | `sdk/chatbridge-sdk.js` |
| T7: Iframe Manager | T1 | T23 | `src/renderer/components/iframe/IframeManager.tsx`, `src/renderer/hooks/useIframeApps.ts` |
| T8: PostMessage Broker | T1 | T23 | `src/renderer/components/iframe/PostMessageBroker.ts`, `src/renderer/hooks/useToolExecution.ts` |
| T9: App Card + Indicator | T1 | T23 | `src/renderer/components/iframe/AppCard.tsx`, `src/renderer/components/chat/ToolCallIndicator.tsx` |
| T10: Tool Router | T2 | T22 | `server/src/services/tools.ts` |
| T11: Safety Pipeline | T2 | T22 | `server/src/middleware/safety.ts` |
| T12: Context Manager | T2 | — | `server/src/services/context.ts` |
| T13: Chess App | T6 | — | `apps/chess/*` |
| T14: Go App | T6 | — | `apps/go/*` |
| T15: Spotify OAuth Proxy | T2 | T16 | `server/src/routes/oauth.ts` |
| T16: Spotify API Proxy | T15 | — | `server/src/routes/spotify.ts` |
| T17: Spotify App UI | T6 | — | `apps/spotify/*` |
| T18: Frontend Chat Hook | T1 | T23 | `src/renderer/services/api.ts`, `src/renderer/hooks/useChat.ts` |
| T19: Clerk Auth | T2 | — | `server/src/middleware/auth.ts` |
| T20: Rate Limiting | T2 | — | `server/src/middleware/rateLimit.ts` |
| T21: Static Serving + Dev Scripts | T2 | — | (modifies `server/src/index.ts`, root `package.json`) |
| T22: Wire Tool Orchestration | T4, T5, T10, T11 | — | (modifies `server/src/routes/chat.ts`) |
| T23: Wire Frontend Integration | T7, T8, T9, T18 | — | `src/renderer/components/ChatBridgeApp.tsx` |
| T24: Deployment Config | T1, T2 | — | `.env.example`, `vercel.json`, `Procfile` |
| T25: Cost Analysis | — | — | `docs/cost-analysis.md` |
| T26: README + API Docs | — | — | `README.md`, `docs/api.md` |

### Shared Files

Files modified by multiple tasks (resolved by worktree merge — all changes are additive import + registration lines):

- `server/src/index.ts` — T4, T5, T15, T16, T19, T20, T21 (each adds route/middleware registration)
- Root `package.json` — T1 (strip Electron deps), T21 (add concurrently)

### Execution Waves (Optimized)

```
Wave 1 (sequential):  [T1 -> T2]                              — repo foundation
Wave 2 (7 parallel):  [T3, T4, T5, T6, T7, T8, T9]           — core infrastructure
Wave 3 (7 parallel):  [T10, T11, T12, T13, T14, T15, T18]     — orchestration + apps
Wave 4 (7 parallel):  [T16, T17, T19, T20, T21, T24, T25]     — spotify wiring + hardening
Wave 5 (3 parallel):  [T22, T23, T26]                         — convergence + docs
```

**Critical path:** T1 -> T2 -> T5 -> T22 (server foundation -> LLM proxy -> end-to-end wiring) = 4 sequential hops across 5 waves

**Parallelism factor:** 26 tasks in 5 waves (2 sequential + 24 across 4 parallel waves) = ~5.2x speedup vs sequential

### Wave Promotion Notes

Tasks promoted from original plan for better parallelism:
- **T10, T11, T12** promoted to Wave 3 (were Wave 3 already — confirmed no cross-deps with Wave 2 tasks)
- **T15** (Spotify OAuth) promoted to Wave 3 — depends only on T2, not on any Wave 2 task
- **T18** (Frontend Chat Hook) promoted to Wave 3 — depends only on T1, makes HTTP calls without importing from T5

### Execution Strategy

> **For Claude:** Use `parallel-plan-executor` skill to execute this plan with wave-based parallelization.

**Wave 1** — Sequential on main branch
- T1: Fork Chatbox, strip Electron, verify web build
- T2: Scaffold Express server with health check
- After: commit to main, verify both frontend and server run

**Wave 2** — 7 parallel worktrees
- T3 worktree: `wt-t03-session-manager`
- T4 worktree: `wt-t04-app-registry`
- T5 worktree: `wt-t05-llm-proxy`
- T6 worktree: `wt-t06-sdk`
- T7 worktree: `wt-t07-iframe-manager`
- T8 worktree: `wt-t08-postmessage-broker`
- T9 worktree: `wt-t09-app-cards`
- After: merge all, resolve `server/src/index.ts` conflicts (additive), run full test suite

**Wave 3** — 7 parallel worktrees
- T10 worktree: `wt-t10-tool-router`
- T11 worktree: `wt-t11-safety-pipeline`
- T12 worktree: `wt-t12-context-manager`
- T13 worktree: `wt-t13-chess-app`
- T14 worktree: `wt-t14-go-app`
- T15 worktree: `wt-t15-spotify-oauth`
- T18 worktree: `wt-t18-chat-hook`
- After: merge all, resolve index.ts conflicts, run full test suite

**Wave 4** — 7 parallel worktrees
- T16 worktree: `wt-t16-spotify-proxy`
- T17 worktree: `wt-t17-spotify-app`
- T19 worktree: `wt-t19-clerk-auth`
- T20 worktree: `wt-t20-rate-limiting`
- T21 worktree: `wt-t21-static-serving`
- T24 worktree: `wt-t24-deploy-config`
- T25 worktree: `wt-t25-cost-analysis`
- After: merge all, resolve index.ts conflicts, run full test suite

**Wave 5** — 3 parallel worktrees (convergence)
- T22 worktree: `wt-t22-wire-orchestration` (modifies chat.ts to integrate tools+safety+db)
- T23 worktree: `wt-t23-wire-frontend` (creates ChatBridgeApp wiring all components)
- T26 worktree: `wt-t26-docs`
- After: merge all, run full test suite, manual smoke test of complete flow
