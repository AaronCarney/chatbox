# Task 4: Dynamic System Prompt + PLATFORM_TOOLS Descriptions (I3)

## Status
COMPLETE

## Changes Made

### 1. Test Implementation
Added failing test to `server/tests/services/llm.test.ts`:
- Test: `injects active apps and current app into system prompt`
- Verifies system prompt includes `ACTIVE APPS: Chess, Go, Spotify`
- Verifies system prompt includes `CURRENT APP: chess`

### 2. buildMessages Function Updated
Modified `server/src/services/llm.ts`:
- Added `apps: Array<{ id: string; name: string }> = []` parameter
- Added `activeAppId: string | null = null` parameter
- Injected app context into system prompt:
  - When apps present: `ACTIVE APPS: {app names}`
  - Always includes: `CURRENT APP: {activeAppId || 'none'}`
- Maintains backward compatibility with default parameters

### 3. Call Site Updated
Modified `server/src/routes/chat.ts`:
- Changed: `buildMessages(trimmed, tools)`
- To: `buildMessages(trimmed, tools, apps, activeAppId)`
- Apps already loaded in the route handler, passed through directly

### 4. PLATFORM_TOOLS Descriptions Added
Enhanced `server/src/services/tools.ts` with descriptions:
- `launch_app`: "Launch a third-party app (chess, go, spotify) in the chat. Use when the student asks to play a game or use an app."
- `get_app_state`: "Get the current state of an active app (e.g. chess board position, game score). Use when the student asks about what is happening in the app."
- `get_available_apps`: "List all available third-party apps the student can use. Use when the student asks what apps or games are available."

## Testing
- TDD workflow: tests written first, then implementation
- All 88 tests passing (11 test files)
- New test verifies app context injection in system prompt

## Files Modified
- `server/src/services/llm.ts`
- `server/src/services/tools.ts`
- `server/src/routes/chat.ts`
- `server/tests/services/llm.test.ts`

## Commit
`feat: dynamic system prompt + platform tool descriptions (I3)` (f0d09fb)
