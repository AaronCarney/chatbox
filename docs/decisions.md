# ChatBridge — Decision Record

## Architecture

| Decision | Choice | Rationale |
|---|---|---|
| Base framework | Chatbox fork (web build) | Pre-built chat UI with Mantine, saves ~3 days. Stripped 90% of features (settings, prompts, masks, MCP). |
| Backend | Express + Node.js | Lightweight, matches existing Chatbox patterns. No framework overhead. |
| Database | PostgreSQL (Railway) | Free tier, relational for app registry + chat history. Redis intentionally omitted (ephemeral design). |
| Auth | Clerk | Free <10K MAU, pre-built React components, webhook support. Development mode for sprint. |
| Hosting | Vercel (frontend) + Railway (API) | Vercel free static hosting, Railway for Node.js + PostgreSQL. Split deploy keeps costs at ~$5/mo. |
| DNS | Cloudflare → chatbridge.aaroncarney.me | Already managed, free tier, CNAME to Vercel. |
| LLM | GPT-4o via OpenAI API | Best function-calling support. max_tokens:1024, 8KB input cap. |

## Security

| Decision | Choice | Rationale |
|---|---|---|
| Data model | Ephemeral-first, 3-tier classification | COPPA/FERPA compliance. No PII stored. Day-scoped pseudonyms via HMAC. |
| Prompt injection defense | Schema validation + random-salt delimiters + system prompt hierarchy | OWASP LLM Risk 1. Delimiters use crypto random salt per request. |
| PII handling | Strip from all roles (user, assistant, tool) before LLM | OWASP LLM Risk 2. Regex-based, covers SSN/email/phone/CC. |
| Token budget | 8KB input cap + 1024 max_tokens + progressive trimming | OWASP LLM Risk 10 (unbounded consumption). |
| Rate limiting | 20/min per user, 100/15min burst | Prevents automated abuse and cost spikes. |
| OAuth auth | Public routes (no Clerk) | Popup window has no Clerk session. State param provides CSRF. |
| CORS | Restrict to ALLOWED_ORIGIN | Only chatbridge.aaroncarney.me can call the API. |
| Iframe sandbox | CSP + postMessage origin validation | Third-party apps run in sandboxed iframes, validated origin on messages. |

## App Integration

| Decision | Choice | Rationale |
|---|---|---|
| Protocol | CHATBRIDGE_V1 postMessage | Sandboxed iframes can't share state; postMessage is the browser-native IPC. |
| Tool routing | Static (4 apps in DB) | Admin-curated allowlist, not open marketplace. Child safety > flexibility. |
| Tool call flow | Server-side assembly | Stream tool_call deltas, assemble on server, emit single `tool_call_start` SSE event. |
| DOS emulator | js-dos v8 (CDN, on-demand) | Loaded only when game launches, not at page load. 18 games in ZIP bundles with dosbox.conf. |
| Spotify integration | OAuth2 via server proxy | Never expose tokens to frontend. Server holds tokens keyed by session_id. |

## Content Safety

| Decision | Choice | Rationale |
|---|---|---|
| Visual moderation | Two-layer: NSFWJS (client) + OpenAI omni-moderation (server) | Client-side catches obvious content in <1s. Server-side covers broader categories (violence, self-harm). |
| NSFWJS runtime | Web Worker + TensorFlow.js WASM SIMD | Offloads classification from main thread. WASM avoids WebGL context limits. Worker isolated from DOM. |
| Capture method | SDK `capture.request` → canvas `toDataURL` / SVG foreignObject | Works inside strict sandbox (`allow-scripts` only). No `allow-same-origin` needed. |
| Blur mechanism | CSS `filter: blur(30px)` + SafetyOverlay React component | Blur is immediate via imperative DOM. Overlay provides user-facing message. Both driven from same code path. |
| Hysteresis | Asymmetric thresholds + 5-frame clean requirement | Flag immediately (safety-first), unflag slowly (prevents flicker). Different flag/unflag thresholds prevent oscillation. |
| Hard block | Terminal `hard_blocked` state, no auto-recovery | `sexual/minors` and `self-harm/instructions` above 0.01 → permanent block. K-12 zero tolerance. |
| Model hosting | Self-hosted NSFWJS MobileNetV2 in `/nsfwjs-model/` | No CDN dependency. Model files served as static assets. ~3.5MB quantized. |
| Worker bundling | Vite `worker.format: 'es'` + separate worker entry | ES format allows TF.js code-splitting inside the worker. Main bundle never loads TF.js. |
| Server logging | MIME type only, no pixel data | Spec: "no frame pixel data persisted." Logs `image/jpeg` not base64 content. |

## Deferred Safety Features

| Feature | Spec section | Status | Rationale |
|---|---|---|---|
| CSP `nonce-{RANDOM}` on `script-src` | §8 Risk 5 | Deferred | No inline scripts in the app — `'self'` sufficient. Would add if user-generated content or markdown-to-HTML pipeline is introduced. |
| `tool_choice: "none"` for conceptual questions | §8 Risk 6 | Unimplemented | Would reduce unnecessary tool calls on knowledge questions. Not a safety risk — `'auto'` still respects system prompt boundaries. Post-MVP enhancement. |
| Per-app HMAC tokens | §2 Pseudonymous identity | Generated, not applied | `SessionManager.generateAppToken()` exists but isn't wired into app launches. Cross-app unlinkability is already enforced by iframe sandbox (no `allow-same-origin`). Wire when multi-tenant app marketplace is added. |
| Session TTL enforcement | §7, §8 Risk 10 | Not enforced | Redis omitted (see tradeoffs). In-memory sessions live for the browser tab lifetime. Acceptable for demo scale — sessions are ephemeral by architecture. |

## Tradeoffs Accepted

| Tradeoff | Accepted risk | Mitigation |
|---|---|---|
| Clerk in development mode | "Development mode" banner visible | Acceptable for sprint demo. Production keys available post-submission. |
| No Redis | No session caching, no rate limit persistence across restarts | Railway restarts are rare. In-memory rate limiting sufficient for demo scale. |
| Hardcoded API_BASE in Spotify app.js | If Railway URL changes, Spotify app breaks | URL stable for project lifetime. Would use env injection in production. |
| 6 pre-existing test failures | token-estimation tests fail | Not from our changes. Would fix in production but not worth sprint time. |
| js-dos cloud saves UI visible | "Hello, guest!" screen before game play button | js-dos v8 default behavior. Would hide with CSS in production. |
