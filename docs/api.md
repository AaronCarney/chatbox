# API Reference

Base URL: `http://localhost:3001` (dev) / `https://<railway-app>.railway.app` (prod)

All protected routes require a valid Clerk session cookie.

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
    { "role": "assistant", "content": "Sure! I'll open a chess board for you." }
  ],
  "tools": ["chess_move", "chess_get_board"],
  "activeAppId": "chess",
  "toolResult": {
    "toolName": "chess_move",
    "result": { "fen": "rnbqkbnr/pp1ppppp/..." }
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `messages` | array | yes | Conversation history (`role` + `content`) |
| `tools` | string[] | no | Tool names available in the current app context |
| `activeAppId` | string | no | ID of the currently active iframe app |
| `toolResult` | object | no | Result of a previous tool invocation to inject |

**Response:** `text/event-stream`

Each event is a JSON-stringified OpenAI streaming chunk:

```
data: {"id":"chatcmpl-...","choices":[{"delta":{"content":"Hello"},...}]}

data: [DONE]
```

On error:

```
data: {"type":"error","message":"..."}
```

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

**Auth:** Required

**Query params:**

| Param | Required | Description |
|---|---|---|
| `session_id` | yes | Caller's session identifier for token storage |

**Response:** `302` redirect to `https://accounts.spotify.com/authorize`.

### GET /api/oauth/spotify/callback

Spotify redirects here after user approval. Exchanges authorization code for tokens and closes the popup.

**Auth:** Required

**Query params:** `code`, `state`, `session_id` (set by Spotify + passed through)

**Response:** HTML `<script>window.close()</script>` on success; `400`/`500` JSON on error.

### GET /api/oauth/spotify/token

Checks whether a session has a valid Spotify token.

**Auth:** Required

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

**Auth:** Required

**Query params:**

| Param | Required | Description |
|---|---|---|
| `q` | yes | Search query string |
| `session_id` | yes | Authenticated session identifier |

**Response:**

```json
{ "tracks": [ /* Spotify track objects */ ] }
```

### POST /api/spotify/playlist

Create a new Spotify playlist.

**Auth:** Required

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

**Auth:** Required

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

**Auth:** Required

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
