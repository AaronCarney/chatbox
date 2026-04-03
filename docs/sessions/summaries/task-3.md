# Task 3: Express Server Scaffold

## What was built
Express 5 + TypeScript server with a `/api/health` endpoint returning `{ status: 'ok' }`.

## Files created
- `server/package.json` — dependencies: express 5, cors, dotenv; devDeps: tsx, typescript, vitest, supertest
- `server/tsconfig.json` — ESNext/bundler module resolution
- `server/vitest.config.ts` — includes `tests/**/*.test.ts` (needed because root vitest config excludes tests/ by default)
- `server/src/index.ts` — app setup, CORS, JSON middleware, health router mount, conditional listen
- `server/src/routes/health.ts` — GET /health → 200 `{ status: 'ok' }`
- `server/tests/health.test.ts` — supertest integration test
- `pnpm-workspace.yaml` — added `server` package to workspace

## Test count
1 test, 1 passing

## Deviations
- Added `server/vitest.config.ts` (not in original spec) — required because the root vitest config include pattern excluded the `tests/` directory.
- Added `server` to `pnpm-workspace.yaml` so pnpm installs server deps correctly.
- Root postinstall script `.erb/scripts/postinstall.cjs` is missing in this worktree; used `--ignore-scripts` for the workspace install.
