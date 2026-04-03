# Task 14: Persist Chat History to PostgreSQL

**Status:** COMPLETE

## Changes Made

### 1. db/client.ts
- Added `saveMessage(sessionPseudonym, role, content, toolCallId?, appId?)` — Inserts messages into chat_messages table with data_classification='ephemeral_context'
- Added `getMessages(sessionPseudonym, limit=30)` — Queries messages ordered by created_at DESC, reverses for chronological order

### 2. server/tests/db/client.test.ts
- Added chat history tests:
  - `saveMessage is callable` — Verifies INSERT works without throwing
  - `getMessages returns array` — Verifies SELECT returns array structure

### 3. server/src/routes/chat.ts
- Imported `saveMessage` from db/client
- Added fire-and-forget persistence after streaming completes
- Saves user message (last in sanitizedMessages) and assistant response (totalContent) separately
- Silently catches errors to prevent disrupting chat flow
- Logs message count when persistence succeeds

## Design Notes

- **Fire-and-forget:** Database saves don't block response stream or res.end()
- **Data classification:** All messages marked 'ephemeral_context' per spec
- **Optional appId:** Captured for multi-app analysis; nullable for app-agnostic sessions
- **Silent error handling:** DB failures don't break chat UX — `.catch(() => {})` drops errors

## Test Results

All 99 tests pass (11 test files):
- db/client tests: 5/5 passing
- chat.test.ts: 18/18 passing (no regressions)
- Full suite: 99/99 passing

## Files Changed

- `/home/context/projects/chatbridge/server/src/db/client.ts` — Added saveMessage, getMessages
- `/home/context/projects/chatbridge/server/src/routes/chat.ts` — Integrated fire-and-forget save
- `/home/context/projects/chatbridge/server/tests/db/client.test.ts` — Added 2 chat history tests
