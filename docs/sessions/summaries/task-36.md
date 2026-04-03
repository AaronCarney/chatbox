# Task 36: Cost Analysis + README + API Docs

## Status
COMPLETE

## What Was Done

### 1. docs/cost-analysis.md
- GPT-4o pricing table ($2.50/1M input, $10/1M output)
- Per-session token math: 3 turns x 8K tokens + 5 tool invocations x 500 tokens = ~26,500 tokens/session
- Monthly cost per user: ~$0.000318 (~$0.32/1,000 users)
- Production projection table at 100 / 1K / 10K / 100K users with infra estimates
- Dev cost table with OpenAI spend placeholder

### 2. README.md (new)
- Project description: K-12 AI chat with iframe app orchestration
- ASCII architecture diagram: Vite SPA -> Express API -> OpenAI/Postgres/Redis/Clerk/Spotify, plus iframes via CHATBRIDGE_V1 postMessage
- Tech stack table: React 18, Mantine, Vite, Express 5, TypeScript, OpenAI SDK, chess.js, Redis, PostgreSQL, Clerk
- Setup guide: clone, env setup, pnpm install for root + server, pnpm dev for both
- Deployment: Vercel (frontend) + Railway (server)
- Links to docs/api.md and docs/cost-analysis.md

### 3. docs/api.md
- All 11 endpoints documented with request/response formats
- CHATBRIDGE_V1 envelope spec: schema, version, type, timestamp, source, payload, requestId fields
- All 6 message types: task.launch, tool.invoke, tool.result, app.state, task.completed, app.resize
- Tool schema format with JSON Schema draft-07 parameter definitions

## Files Changed
- `README.md` — new, 63 lines
- `docs/api.md` — new, 313 lines
- `docs/cost-analysis.md` — new, 51 lines

## Commit
`docs: cost analysis + README + API docs` (b64d885)
