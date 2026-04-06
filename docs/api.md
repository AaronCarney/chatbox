# API Reference

Base URL: `http://localhost:3001` (dev) / `https://chatbox-production-d06b.up.railway.app` (prod)

Protected routes require a valid Clerk session cookie. OAuth and Spotify routes are public (OAuth uses state-based CSRF; Spotify routes require session_id for token lookup).

---

## Chat

### POST /api/chat

Stream an AI response. Returns a Server-Sent Events stream.

**Auth:** Required

**Request body:**

```json
{
  "messages": [
    { "role": "user", "content": "Let's play chess" },
    { "role": "assistant", "content": "Sure! I'll open a chess board for you.", "tool_calls": [{ "type": "function", "function": { "name": "launch_app", "arguments": "{\"app_id\":\"chess\"}" } }] }
  ],
  "activeAppId": "chess",
  "toolResult": {
    "name": "get_board_state",
    "data": { "fen": "rnbqkbnr/pp1ppppp/..." },
    "tool_call_id": "call_abc123"
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `messages` | array | yes | Conversation history in OpenAI format (`role` + `content`, optional `tool_calls`) |
| `activeAppId` | string | no | ID of the currently active iframe app |
| `toolResult` | object | no | Result of a previous tool invocation (`name`, `data`, `tool_call_id`) |

**Response:** `text/event-stream`

Custom SSE protocol (not raw OpenAI chunks):

```
data: {"type":"token","content":"Hello! "}
data: {"type":"token","content":"Let's play chess."}
data: {"type":"tool_call_start","toolCall":{"id":"call_abc","name":"launch_app","arguments":"{\"app_id\":\"chess\"}"}}
data: [DONE]
```

| Event type | Description |
|---|---|
| `token` | Streaming text content fragment |
| `tool_call_start` | Assembled tool call (emitted after stream completes) |
| `error` | Error message: `{"type":"error","message":"..."}` |
| `[DONE]` | Stream complete |

**Safety pipeline:** Input capped at 8KB. PII stripped from all roles. Tool results wrapped in random-salt delimiters. max_tokens: 1024. Progressive history trimming to fit token budget.

---

## Apps

### GET /api/apps

Returns all registered third-party apps.

**Auth:** Not required

**Response:**

```json
[
  {
    "id": "chess",
    "name": "Chess",
    "description": "Interactive chess board",
    "url": "https://...",
    "tools": [...]
  }
]
```

### GET /api/apps/:id

Returns a single app by ID.

**Auth:** Not required

**Response:** Single app object (same shape as above), or `404 { "error": "App not found" }`.

---

## Health

### GET /api/health

**Auth:** Not required

**Response:**

```json
{ "status": "ok" }
```

---

## Spotify OAuth

### GET /api/oauth/spotify/authorize

Initiates Spotify OAuth flow. Redirects to Spotify authorization page.

**Auth:** Not required (opens in popup window without Clerk session; state param provides CSRF)

**Query params:**

| Param | Required | Description |
|---|---|---|
| `session_id` | yes | Caller's session identifier for token storage |

**Response:** `302` redirect to `https://accounts.spotify.com/authorize`.

### GET /api/oauth/spotify/callback

Spotify redirects here after user approval. Exchanges authorization code for tokens and closes the popup.

**Auth:** Not required

**Query params:** `code`, `state` (set by Spotify redirect)

**Response:** HTML `<script>window.close()</script>` on success; `400`/`500` JSON on error.

### GET /api/oauth/spotify/token

Checks whether a session has a valid Spotify token.

**Auth:** Not required

**Query params:**

| Param | Required | Description |
|---|---|---|
| `session_id` | yes | Session identifier |

**Response:**

```json
{ "authenticated": true }
```

---

## Spotify Tools

### GET /api/spotify/search

Search for tracks.

**Auth:** Not required (uses session_id for Spotify token lookup)

**Query params:**

| Param | Required | Description |
|---|---|---|
| `q` | yes | Search query string |
| `session_id` | yes | Session identifier for Spotify token lookup |

**Response:**

```json
{ "tracks": [ /* Spotify track objects */ ] }
```

### POST /api/spotify/playlist

Create a new Spotify playlist.

**Auth:** Not required (uses session_id)

**Request body:**

```json
{ "name": "My Study Mix", "session_id": "abc123" }
```

**Response:**

```json
{ "playlist_id": "3cEYpjA...", "url": "https://open.spotify.com/playlist/..." }
```

### POST /api/spotify/playlist/:id/tracks

Add tracks to an existing playlist.

**Auth:** Not required (uses session_id)

**Path params:** `id` — Spotify playlist ID

**Request body:**

```json
{ "track_ids": ["4iV5W9...", "1301WB..."], "session_id": "abc123" }
```

**Response:**

```json
{ "success": true, "added": 2 }
```

### GET /api/spotify/recommendations

Get track recommendations seeded by track IDs.

**Auth:** Not required (uses session_id)

**Query params:**

| Param | Required | Description |
|---|---|---|
| `seeds` | yes | Comma-separated Spotify track IDs (max 5) |
| `session_id` | yes | Authenticated session identifier |

**Response:**

```json
{
  "tracks": [
    {
      "id": "4iV5W9...",
      "name": "Track Name",
      "artists": ["Artist Name"],
      "uri": "spotify:track:4iV5W9...",
      "external_urls": { "spotify": "https://open.spotify.com/track/..." }
    }
  ]
}
```

---

## Content Safety

### POST /api/moderate-image

Classify an image via OpenAI omni-moderation. Used by the client-side content safety pipeline for server-side verification.

**Auth:** Not required (called from the browser's content safety orchestrator)

**Request body:**

```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `image` | string | yes | Base64 data URL (`data:image/...`). Rejected if not a data URL. |

**Response:**

```json
{
  "flagged": true,
  "categories": { "sexual": true, "violence": false },
  "categoryScores": { "sexual": 0.85, "violence": 0.01, "sexual/minors": 0.001 }
}
```

On server error, returns a fail-open response: `{ "flagged": false, "categories": {}, "categoryScores": {} }` with status 500.

---

## CHATBRIDGE_V1 postMessage Protocol

All iframe apps communicate with the parent shell via `window.postMessage`. Every message uses a standard envelope.

### Envelope Format

```json
{
  "schema": "CHATBRIDGE_V1",
  "version": "1.0",
  "type": "tool.invoke",
  "timestamp": 1712000000000,
  "source": "chess",
  "payload": { /* message-type-specific */ },
  "requestId": "req_abc123"
}
```

| Field | Type | Description |
|---|---|---|
| `schema` | string | Always `"CHATBRIDGE_V1"` |
| `version` | string | Protocol version, currently `"1.0"` |
| `type` | string | Message type (see below) |
| `timestamp` | number | Unix ms timestamp |
| `source` | string | Sender app ID, or `"parent"` for shell messages |
| `payload` | object | Type-specific data |
| `requestId` | string | Present on `tool.invoke` and `tool.result` for correlation |

### Message Types

#### `task.launch` — Parent → App

Sent when the shell launches an app. Delivered with a `MessageChannel` port for completion signals.

```json
{
  "type": "task.launch",
  "payload": {
    "appId": "chess",
    "task": "Play a game of chess with the student"
  }
}
```

The first entry in `event.ports` is the completion port. The app should store it and use it for `task.completed` signals.

#### `tool.invoke` — Parent → App

Sent when the AI invokes a tool defined by the app.

```json
{
  "type": "tool.invoke",
  "requestId": "req_abc123",
  "payload": {
    "tool": "chess_move",
    "args": { "from": "e2", "to": "e4" }
  }
}
```

#### `tool.result` — App → Parent

App's response to a `tool.invoke`.

```json
{
  "type": "tool.result",
  "requestId": "req_abc123",
  "payload": {
    "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "moveValid": true
  }
}
```

#### `app.state` — App → Parent

Voluntary state update so the AI maintains context.

```json
{
  "type": "app.state",
  "payload": {
    "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "turn": "black",
    "moveCount": 1
  }
}
```

#### `task.completed` — App → Parent (via completion port)

Signals that the app has finished its task.

```json
{
  "type": "task.completed",
  "payload": {
    "status": "completed",
    "result": { "winner": "white", "reason": "checkmate" }
  }
}
```

#### `app.resize` — App → Parent

Requests the shell to resize the iframe.

```json
{
  "type": "app.resize",
  "payload": { "height": 480 }
}
```

#### `capture.request` — Parent → App

Requests the app to capture its current visual state as a data URL. Used by the content safety pipeline.

```json
{
  "type": "capture.request",
  "payload": { "requestId": "req_capture_abc" }
}
```

#### `capture.response` — App → Parent

App's response with a captured frame. Sent after receiving `capture.request`.

```json
{
  "type": "capture.response",
  "payload": {
    "image": "data:image/jpeg;base64,/9j/4AAQ...",
    "requestId": "req_capture_abc"
  }
}
```

On error: `{ "image": null, "error": "capture failed", "requestId": "req_capture_abc" }`.

The SDK handles `capture.request` automatically — apps do not need to implement it. Canvas-based apps use `toDataURL`; DOM apps use SVG foreignObject fallback.

---

## Tool Schema Format

Third-party apps register tools in their app record. Each tool follows this schema:

```json
{
  "name": "chess_move",
  "description": "Make a chess move using algebraic notation",
  "parameters": {
    "type": "object",
    "properties": {
      "from": {
        "type": "string",
        "description": "Source square in algebraic notation (e.g. 'e2')"
      },
      "to": {
        "type": "string",
        "description": "Target square in algebraic notation (e.g. 'e4')"
      }
    },
    "required": ["from", "to"]
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Unique identifier, used in `tool.invoke` messages |
| `description` | string | yes | Human-readable description sent to the AI |
| `parameters` | object | yes | JSON Schema object describing the tool's arguments |

The AI receives all registered tool names and descriptions in its system context when an app is active. Tool parameter schemas follow JSON Schema draft-07.
