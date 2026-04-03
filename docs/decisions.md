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

## Tradeoffs Accepted

| Tradeoff | Accepted risk | Mitigation |
|---|---|---|
| Clerk in development mode | "Development mode" banner visible | Acceptable for sprint demo. Production keys available post-submission. |
| No Redis | No session caching, no rate limit persistence across restarts | Railway restarts are rare. In-memory rate limiting sufficient for demo scale. |
| Hardcoded API_BASE in Spotify app.js | If Railway URL changes, Spotify app breaks | URL stable for project lifetime. Would use env injection in production. |
| 6 pre-existing test failures | token-estimation tests fail | Not from our changes. Would fix in production but not worth sprint time. |
| js-dos cloud saves UI visible | "Hello, guest!" screen before game play button | js-dos v8 default behavior. Would hide with CSS in production. |
