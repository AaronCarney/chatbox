# ChatBridge

AI chat platform with third-party app integration for K-12 education. Case study: TutorMeAI — 30-person startup, 10K+ districts, 200K+ daily users.

## What It Is

Platform where an AI chatbot orchestrates third-party apps embedded via iframes. Students interact with educational tools (chess, math, etc.) without leaving the chat. Teachers control which apps are available. The chatbot maintains awareness of app state and responds contextually.

## Core Challenge

The communication boundary between chatbot and third-party apps: tool discovery, invocation, inline UI rendering, state tracking, and completion signaling — all without prior knowledge of what any app does. Trust and safety for children (COPPA/FERPA) is the second axis.

## Project Structure

```
docs/
  project-instructions.pdf    # Full assignment spec (8 pages)
  research/
    presearch.md              # 17-question deep research (identity, privacy, app contracts, trust/safety)
    defenseLayers.md          # OWASP Top 10 LLM security analysis
src/                          # Application code
tests/                        # Test suites
```

## Deadlines

- MVP + Pre-search: Tuesday (24 hours) — planning gate
- Early Submission: Friday (4 days) — full plugin system + 3+ apps
- Final: Sunday 11:59 PM CT (7 days) — polish, auth, docs, deploy

## Requirements

### Chat Features
- Real-time AI chat with streaming responses
- Persistent conversation history across sessions
- Context awareness of active third-party apps and their state
- Multi-turn conversations spanning app interactions
- Graceful error recovery when apps fail/timeout
- User authentication

### Third-Party App Integration (core engineering challenge)
- App registration API with tool schema definitions
- Tool discovery and invocation by chatbot
- Iframe-embedded UI rendering within chat
- Bidirectional communication (postMessage protocol)
- Completion signaling from app to chatbot
- Independent app state management

### Required Apps (minimum 3)
1. **Chess** (required) — complex state, bidirectional comms, no auth
2. Two more showcasing different complexity levels, auth patterns, interaction styles
3. At least one app requires user authentication (OAuth2)

### Auth Categories
- Internal (no auth): calculator, unit converter
- External public (API key/none): weather, dictionary
- External authenticated (OAuth2): Spotify, GitHub, Google Calendar

### Deliverables
- GitLab repo with setup guide, architecture docs, API docs, deployed link
- Demo video (3-5 min)
- AI cost analysis (dev spend + projections at 100/1K/10K/100K users)
- Deployed application with 3+ working apps
- Social post (final only)

## Stack (TBD — decide during planning)

| Layer | Options |
|-------|---------|
| Frontend | React, Next.js, Vue, Svelte |
| Backend | Node.js/Express, Python/FastAPI, serverless |
| Real-time | WebSockets, SSE, polling |
| AI | OpenAI GPT-4 or Anthropic Claude with function calling |
| App Sandboxing | Iframes + postMessage |
| Auth | NextAuth, Auth0, Clerk, Firebase Auth, custom JWT |
| Database | PostgreSQL, MongoDB, Firebase, Supabase |
| Deployment | Vercel, Railway, Render |

## Build Priority Order

1. Basic chat with conversation history
2. App registration — tool spec contract, registration API
3. Tool invocation — chatbot discovers and calls app tools
4. UI embedding — app renders UI within chat
5. Completion signaling — app tells chatbot when done
6. Context retention — chatbot remembers app results
7. Multiple apps — register and route between 3+ apps
8. Auth flows — OAuth for authenticated apps
9. Error handling — timeouts, crashes, invalid tool calls
10. Developer docs — API documentation for third-party devs

## Key Architecture Decisions (from pre-search)

- **Sessions:** Redis-backed ephemeral sessions, no persistent student data, TTL 1-8 hours
- **Data tiers:** Ephemeral context (in-memory) → Session context (Redis TTL) → Prohibited PII (never stored)
- **App isolation:** `sandbox="allow-scripts"` only, never `allow-same-origin`, `credentialless` attribute
- **Communication:** postMessage with strict origin validation, schema-validated payloads
- **Prompt injection defense:** 7-layer architecture (schema validation, regex sanitization, delimiter isolation, system prompt hierarchy, dual-LLM safety, output filtering, monitoring)
- **App marketplace:** Admin-curated allowlist for MVP, tiered review at scale
- **Tool versioning:** Semver with session pinning, school-calendar-aligned deprecation
- **Compliance:** COPPA, FERPA, state laws — design to UK Children's Code as global baseline

## Base

Fork of [Chatbox](https://github.com/nicepkg/chatbox) — push to GitLab.

## Commands

TBD after stack selection.
