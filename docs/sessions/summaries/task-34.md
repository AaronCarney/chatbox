# Task 34: Static File Serving + Dev Scripts

## Status: COMPLETE

## Changes Made

### 1. server/src/index.ts
- Added `import { join, dirname } from 'path'` and `import { fileURLToPath } from 'url'`
- Computed projectRoot: `const __dirname = dirname(fileURLToPath(import.meta.url)); const projectRoot = join(__dirname, '..', '..');`
- Added static routes before other routes:
  - `app.use('/apps', express.static(join(projectRoot, 'apps')))`
  - `app.use('/sdk', express.static(join(projectRoot, 'sdk')))`

### 2. package.json (root)
- Updated `concurrently` devDependency from `^8.1.0` to `^9.1.2`
- Added/updated scripts:
  - `"dev": "concurrently \"cd server && pnpm dev\" \"vite\""`
  - `"dev:server": "cd server && pnpm dev"`
  - `"dev:client": "vite"`

## Verification

Ran server test suite — all 67 tests passed across 10 test files:
- pii, safety, chat, oauth, apps, health, tools, session, llm, db client tests

## Commit

`feat: static file serving + dev scripts` (beba59f)

## Notes

- Static routes added before auth middleware to ensure public access
- concurrently allows parallel dev server + client development
- No breaking changes to existing code
