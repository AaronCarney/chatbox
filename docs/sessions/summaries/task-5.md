# Task 5: PostgreSQL Schema + DB Client

## What Was Built

Created a typed PostgreSQL database layer for chatbridge server. Schema supports an app registry and chat message storage with proper indexing. Database client provides query helpers with parameterized queries to prevent SQL injection.

## Files Created

- `server/src/db/schema.sql` — PostgreSQL schema with two main tables:
  - `apps` — registry of approved third-party applications (id, name, description, iframe_url, tools, auth config, trust/safety, sandbox, status, created_at)
  - `chat_messages` — chat history and context storage (id, session_pseudonym, role, content, tool_call_id, app_id, data_classification, created_at)
  - Index on `chat_messages(session_pseudonym)` for efficient session lookups

- `server/src/db/client.ts` — typed database client
  - Exports Pool from pg library initialized with DATABASE_URL env var
  - `query(text, params)` helper for parameterized queries
  - `getApps()` — returns all approved applications
  - `getAppById(id)` — returns single app or null

- `server/tests/db/client.test.ts` — comprehensive test suite (3 tests)
  - Tests mock pg.Pool to avoid needing live database
  - Verifies `getApps()` executes correct SQL with status filter
  - Verifies `getAppById()` uses parameterized query with id parameter
  - Verifies null return on missing app

- `server/tests/__mocks__/pg.ts` — pg module mock for vitest
  - Exports mockQuery function for test assertions
  - Pool returns mock with query method

- `server/package.json` — updated
  - Added `pg` as production dependency
  - Added `@types/pg` as dev dependency

## Test Results

All 4 tests passing (3 new db tests + 1 pre-existing health test):
```
Test Files  2 passed (2)
Tests  4 passed (4)
```

## TDD Process

1. Wrote failing test first (verified file-not-found error)
2. Installed pg and @types/pg dependencies
3. Created schema.sql with proper table definitions and indexing
4. Implemented client.ts with query helpers and specific functions
5. Fixed mocking strategy using vitest __mocks__ pattern
6. All tests passed
7. Committed: `feat: PostgreSQL schema + DB client`

## Key Decisions

- Used parameterized queries ($1 syntax) throughout for security
- schema.sql uses standard PostgreSQL types (TEXT, SERIAL, TIMESTAMPTZ, JSONB, TEXT[])
- Apps filtered by status='approved' at query level for simplicity
- Index added on session_pseudonym for chat message lookups (common query path)
- vitest mocks via __mocks__/pg.ts pattern avoids hoisting issues with vi.mock()

## No Deviations

Task completed exactly as specified.
