# ChatBridge

K-12 AI chat platform with third-party app integration. An AI chatbot orchestrates educational apps embedded via iframes, letting students interact with tools like chess, music, and math without leaving the chat.

## Architecture

```
Browser
  |
  +-- Vite SPA (React 18 + Mantine)
        |
        +-- Express API (port 3001)
        |     |
        |     +-- OpenAI (GPT-4o, streaming SSE)
        |     +-- OpenAI Moderation (omni-moderation-latest)
        |     +-- PostgreSQL (conversation history, app registry)
        |     +-- Redis (session cache, rate limiting)
        |     +-- Clerk (authentication)
        |     +-- Spotify API (OAuth + playlist tools)
        |
        +-- Content Safety Pipeline
        |     |
        |     +-- NSFWJS Web Worker (WASM SIMD, 5s periodic)
        |     +-- OpenAI Image Moderation (30s periodic)
        |     +-- Hysteresis state machine (blur/unblur/hard-block)
        |
        +-- iframes (third-party apps, sandbox=allow-scripts)
              |
              +-- postMessage (CHATBRIDGE_V1 protocol)
                    |
                    +-- Chess app
                    +-- Go app
                    +-- Spotify app
                    +-- DOS Arcade
```

The parent shell and each iframe app communicate exclusively via the `CHATBRIDGE_V1` postMessage envelope protocol. The AI can invoke tools defined by each app; apps send state updates and completion signals back.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 |
| UI components | Mantine 7 |
| Build tool | Vite |
| Backend | Express 5 |
| Language | TypeScript |
| AI | OpenAI SDK (GPT-4o, streaming) |
| Chess logic | chess.js |
| Session cache | Redis |
| Database | PostgreSQL |
| Authentication | Clerk |

## Setup

```bash
git clone <repo>
cd chatbridge

# Root (frontend)
cp .env.example .env        # fill in VITE_CLERK_PUBLISHABLE_KEY
pnpm install
pnpm dev                    # starts Vite dev server on :5173

# Server
cd server
cp .env.example .env        # fill in OPENAI_API_KEY, DATABASE_URL, REDIS_URL,
                            #   CLERK_SECRET_KEY, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET,
                            #   SPOTIFY_REDIRECT_URI
pnpm install
pnpm dev                    # starts Express on :3001
```

## Deployment

- **Frontend**: Vercel — connect repo, set `VITE_CLERK_PUBLISHABLE_KEY`, deploy root.
- **Server**: Railway — connect repo, point to `/server`, set all server env vars.

## Documentation

| Document | Path | Description |
|---|---|---|
| [API Reference](docs/api.md) | `docs/api.md` | REST endpoints, SSE protocol, postMessage protocol, tool schemas |
| [Cost Analysis](docs/cost-analysis.md) | `docs/cost-analysis.md` | Dev costs, per-user projections at scale, optimization strategies |
| [Decision Record](docs/decisions.md) | `docs/decisions.md` | Architecture, security, app integration, and content safety decisions |
| [Design Spec](docs/specs/2026-04-02-chatbridge-design.md) | `docs/specs/` | Original platform design spec |
| [CV Content Safety Spec](docs/specs/2026-04-05-cv-content-safety.md) | `docs/specs/` | Visual content moderation pipeline spec |
| [Research](docs/research/) | `docs/research/` | Pre-search, defense layers, content moderation research, NSFWJS thresholds |
| [Implementation Plans](docs/plans/) | `docs/plans/` | L2 task-level plans for each feature epoch |
