# ChatBridge Security Hardening — L2 Plan

> **Purpose:** Remove all Chatbox code paths that allow LLM interaction outside the secured ChatBridge pipeline. A student should have exactly one way to talk to an LLM: through `/api/chat`, which enforces Clerk auth, pseudonymous sessions, PII stripping, moderation, token limits, and tool sandboxing.

> **Constraint:** ChatBridgeApp.tsx is already clean — it only imports from `services/api.js`, its own hooks, and its own components. None of the Chatbox stores or model packages. The work is removing everything around it that a student could reach.

> **Risk level:** HIGH — every route we miss is a direct child-safety vulnerability. Every dependency we break crashes the app. Each task must verify it doesn't break the build or ChatBridgeApp.

---

## Decision Framework

For each Chatbox feature, apply this test:
1. **Can a student reach it?** (via URL, sidebar link, or keyboard shortcut)
2. **Does it make an LLM call outside `/api/chat`?**
3. **Does it expose configuration a student shouldn't see?** (API keys, model settings)
4. **Is it needed by ChatBridgeApp or `__root.tsx`?**

If YES to 1+2 or 1+3, and NO to 4: **remove it**.
If YES to 4: **modify it** (strip dangerous parts, keep what's needed).

---

## Wave 1: Replace Sidebar (sequential — foundation)

### T1: Replace Sidebar with ChatBridge sidebar
**Why:** Current sidebar links to Settings (API keys), Image Creator (direct model calls), Copilots (custom system prompts), session routes (direct LLM). All bypass safety pipeline.
**What:**
- Replace `src/renderer/Sidebar.tsx` with a minimal ChatBridge sidebar:
  - ChatBridge branding (not Chatbox logo)
  - Clerk `<UserButton />` (keep — our auth)
  - "New Chat" button (navigates to `/`, which is ChatBridgeApp)
  - Remove: Settings, Image Creator, Copilots, Help, About, Dev Tools, Session List, Task toggle
- Keep the `SwipeableDrawer` shell and responsive behavior (small screen support)
- Keep the sidebar collapse button
**Files:** `src/renderer/Sidebar.tsx`
**Verify:** App loads, sidebar shows only branding + UserButton + New Chat. No links to Settings/Copilots/Image Creator.

---

## Wave 2: Lock routes + clean root (2 parallel tasks)

### T2: Remove unsafe routes, redirect stragglers to `/`
**Why:** Students can type `/session/xxx`, `/image-creator`, `/settings`, `/copilots` directly in the URL bar. Each leads to unsafe code.
**What:**
- Delete these route files/directories entirely:
  - `src/renderer/routes/session/` (direct Chatbox LLM sessions)
  - `src/renderer/routes/image-creator/` (direct model.paint())
  - `src/renderer/routes/settings/` (API key config, provider settings)
  - `src/renderer/routes/copilots/` (custom system prompts + direct LLM)
  - `src/renderer/routes/task/` (Chatbox task mode)
  - `src/renderer/routes/dev/` (dev tools)
  - `src/renderer/routes/about.tsx` (Chatbox about page)
  - `src/renderer/routes/guide/` (Chatbox onboarding — tries to configure providers)
- Keep `src/renderer/routes/index.tsx` (ChatBridgeApp) and `src/renderer/routes/__root.tsx`
- TanStack Router auto-generates routes from the file system, so deleting files removes routes
- Add a catch-all route that redirects unknown paths to `/`
**Files:** All listed route dirs/files, plus add `src/renderer/routes/$catchAll.tsx`
**Verify:** Navigate to `/settings`, `/session/test`, `/copilots`, `/image-creator` — all redirect to `/`. Only `/` works as ChatBridgeApp.

### T3: Clean `__root.tsx` — remove unsafe initializations and navigation
**Why:** Root layout initializes settings store (loads API keys), prefetches model registry, auto-navigates to `/guide` (provider setup), auto-navigates to last session (direct LLM). Also renders `<SettingsModal />`, `<Sidebar />` (old one), and other Chatbox dialogs.
**What:**
- Remove `prefetchModelRegistry()` call
- Remove `settingActions.needEditSetting()` check and guide navigation
- Remove auto-navigate to last session (`/session/${sid}`)
- Remove `premiumActions.useAutoValidate()` (license checking for Chatbox)
- Remove `<SettingsModal />` render
- Remove `<RemoteDialogWindow />` (fetches remote Chatbox config)
- Remove `<SearchDialog />` (Chatbox search)
- Remove `<BackgroundImageOverlay />` (depends on session store)
- Keep: `<ClerkProvider>`, `<SignedIn>`/`<SignedOut>`, `<MantineProvider>`, `<Sidebar />` (will be new sidebar from T1), `<Outlet />`, `<Toasts />`
- Keep: theme initialization, spellCheck, language/i18n, `<ErrorBoundary>`
- Remove imports for deleted modules (settingActions, premiumActions, model-registry, etc.)
**Files:** `src/renderer/routes/__root.tsx`
**Verify:** App loads without errors. No console warnings about missing routes/stores. No auto-navigation to guide/session.

---

## Wave 3: Remove unsafe packages and stores (3 parallel tasks)

### T4: Delete direct model-call packages
**Why:** These make direct LLM API calls from the browser, bypassing the server pipeline entirely.
**What:**
- Delete `src/renderer/packages/model-calls/` (stream-text, generate-image, preprocess)
- Delete `src/renderer/packages/web-search/` (tavily, bing, duckduckgo, etc.)
- Delete `src/renderer/packages/context-management/` (summary-generator, compaction — uses model.chat())
- Delete `src/renderer/packages/model-registry/` (model factory/capabilities)
- Delete `src/renderer/packages/model-setting-utils/` (provider config utilities)
- Fix any import errors in remaining code by removing references
**Files:** Listed package directories
**Verify:** `npx tsc --noEmit` passes (or only has pre-existing errors). No references to deleted packages in remaining code.

### T5: Delete unsafe stores
**Why:** These stores hold API keys, make direct LLM calls, or manage Chatbox sessions that bypass the pipeline.
**What:**
- Delete `src/renderer/stores/session/generation.ts` (direct streamText calls)
- Delete `src/renderer/stores/session/naming.ts` (generates titles via direct model.chat())
- Delete `src/renderer/stores/imageGenerationActions.ts` (direct image generation)
- Delete `src/renderer/stores/premiumActions.ts` (Chatbox license management)
- Delete `src/renderer/stores/providerSettings.ts` (provider API key management)
- Review `src/renderer/stores/settingsStore.ts` — keep i18n, theme, spellCheck. Remove provider-related fields/initialization.
- Review `src/renderer/stores/chatStore.ts` — determine if ChatBridgeApp depends on it. If not, mark for removal.
- Fix broken imports in remaining code
**Files:** Listed store files
**Verify:** `npx tsc --noEmit` passes. ChatBridgeApp renders and functions.

### T6: Remove unused Chatbox components and modals
**Why:** Dead code that references deleted stores/packages will cause build errors and confusion.
**What:**
- Delete `src/renderer/components/InputBox/` (Chatbox input box — ChatBridgeApp has its own)
- Delete `src/renderer/components/chat/MessageList.tsx` and related (Chatbox message rendering — ChatBridgeApp has its own)
- Delete `src/renderer/modals/Settings.tsx` and `src/renderer/modals/ModelEdit.tsx`
- Delete `src/renderer/components/session/SessionList.tsx`, `SessionItem.tsx`, `TaskSessionList.tsx`
- Delete `src/renderer/pages/PictureDialog.tsx`, `RemoteDialogWindow.tsx`, `SearchDialog.tsx`
- **Be conservative**: only delete files that have zero imports from remaining code. Use `grep` to verify before each deletion.
**Files:** Listed component files (verify each)
**Verify:** Build succeeds. No broken imports.

---

## Wave 4: Verification + build (sequential)

### T7: Full build + runtime verification
**Why:** After 6 tasks of deletion and modification, we need to confirm nothing is broken and no unsafe paths remain.
**What:**
- Run `npx tsc --noEmit` — fix any type errors from deleted dependencies
- Run `pnpm test` — verify existing tests still pass (expect some test files for deleted features to fail — delete those test files)
- Run `pnpm vite build` — verify production build succeeds
- Grep entire `src/renderer/` for dangerous patterns:
  - `model.chat(` — should have 0 results
  - `model.paint(` — should have 0 results
  - `streamText(` — should have 0 results (except test mocks)
  - `apiKey` in stores — should have 0 results outside of Clerk config
  - Direct fetch to LLM providers (`api.openai.com`, `api.anthropic.com`) — should have 0 results
- Verify the only `fetch` calls in the app go to `VITE_API_URL` (the secured backend)
- Deploy to Vercel, test live:
  - `/` loads ChatBridgeApp
  - `/settings` redirects to `/`
  - `/session/test` redirects to `/`
  - Ask "let's play chess" — chess loads in iframe
  - Ask "what should I do?" — chatbot responds via safe pipeline
**Files:** Various (grep verification, test cleanup)
**Verify:** All checks above pass. Zero direct LLM call paths in frontend.

### T8: Commit + push + update progress
**What:**
- Commit with clear message describing what was removed and why
- Push to GitHub (triggers Railway rebuild — server unchanged, should pass)
- Deploy to Vercel
- Update progress file
**Files:** git operations, `docs/sessions/progress-main-20260402-remediation.md`

---

## Dependency Graph

```
T1 (sidebar) ─────┐
                   ├──→ T2 (routes) ──┐
                   ├──→ T3 (root)  ───┤
                   │                   ├──→ T4 (packages) ──┐
                   │                   ├──→ T5 (stores)  ───┤──→ T7 (verify) ──→ T8 (deploy)
                   │                   └──→ T6 (components)─┘
                   │
```

Wave 1: T1 (sequential — sidebar must exist before routes reference it)
Wave 2: T2 + T3 (parallel — independent)
Wave 3: T4 + T5 + T6 (parallel — independent deletions)
Wave 4: T7 → T8 (sequential — verify then deploy)

---

## What We're NOT Doing

- **Not removing Mantine/MUI** — ChatBridgeApp may use Mantine components indirectly via the theme provider
- **Not removing i18n** — harmless, and may be used by components we keep
- **Not removing the Clerk integration** — that's our auth
- **Not removing `src/renderer/stores/settingsStore.ts` entirely** — theme, language, spellCheck are needed by `__root.tsx`. Just stripping provider fields.
- **Not touching the server** — server pipeline is already secured
- **Not removing `src/renderer/stores/uiStore.ts`** — sidebar state management, needed
