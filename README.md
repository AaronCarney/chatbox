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
        |     +-- PostgreSQL (conversation history, app registry)
        |     +-- Redis (session cache, rate limiting)
        |     +-- Clerk (authentication)
        |     +-- Spotify API (OAuth + playlist tools)
        |
        +-- iframes (third-party apps)
              |
              +-- postMessage (CHATBRIDGE_V1 protocol)
                    |
                    +-- Chess app
                    +-- Go app
                    +-- Spotify app
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

## Links

- [API Reference](docs/api.md)
- [Cost Analysis](docs/cost-analysis.md)
