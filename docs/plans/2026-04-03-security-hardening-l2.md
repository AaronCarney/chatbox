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
- Rewrite `src/renderer/Sidebar.tsx` — keep the `SwipeableDrawer` shell, responsive behavior, and collapse button. Replace contents with:
  - ChatBridge branding (not Chatbox logo/link)
  - Clerk `<UserButton />` (our auth)
  - "New Chat" button → navigates to `/`
  - Remove everything else: Settings, Image Creator, Copilots, Help, About, Dev Tools, Session List, Task toggle, version check
- Match existing Mantine/MUI patterns from the current sidebar (don't introduce new UI libraries)
- Remove imports for deleted features (SessionList, TaskSessionList, navigateToSettings, etc.) but don't delete those files yet — Wave 3 handles that
**Files:** `src/renderer/Sidebar.tsx`
**Verify:** App loads, sidebar shows only branding + UserButton + New Chat. No navigation to any Chatbox feature. No broken imports.

---

## Wave 2: Lock routes + clean root (2 parallel tasks)

### T2: Remove unsafe routes, redirect stragglers to `/`
**Why:** Students can type `/session/xxx`, `/image-creator`, `/settings`, `/copilots` directly in the URL bar. Each leads to unsafe code.
**What:**
- Delete every route file/directory under `src/renderer/routes/` EXCEPT `__root.tsx` and `index.tsx`. This includes but is not limited to: `session/`, `image-creator/`, `settings/`, `copilots/`, `task/`, `dev/`, `about.tsx`, `guide/`.
- If any new route files exist at execution time that weren't listed above, apply the decision framework — if a student can reach it and it bypasses the pipeline, delete it.
- Add a catch-all route (`src/renderer/routes/$catchAll.tsx`) that redirects to `/`
- After deletion, regenerate the TanStack Router route tree: run `pnpm exec tsr generate` or delete `routeTree.gen.ts` and let the dev server regenerate it. Verify the generated file only contains `/` and the catch-all.
- Check `useShortcut` hook and any keyboard shortcut bindings that might navigate to deleted routes — disable those.
**Files:** `src/renderer/routes/` (most files), `routeTree.gen.ts` (regenerate)
**Verify:** Navigate to `/settings`, `/session/test`, `/copilots`, `/image-creator` — all redirect to `/`. Only `/` works as ChatBridgeApp. `routeTree.gen.ts` contains no references to deleted routes.

### T3: Clean `__root.tsx` — remove unsafe initializations and navigation
**Why:** Root layout initializes settings store (loads API keys), prefetches model registry, auto-navigates to `/guide` (provider setup), auto-navigates to last session (direct LLM). Also renders `<SettingsModal />` and other Chatbox dialogs.
**What:**
- **Guiding principle:** `__root.tsx` should do exactly 3 things: (1) provide theming/i18n, (2) render the auth gate (SignedIn/SignedOut), (3) render Sidebar + Outlet. Everything else is Chatbox machinery that needs to go.
- Remove from the `useEffect` initialization block:
  - `prefetchModelRegistry()` — loads LLM model catalog
  - `settingActions.needEditSetting()` check + guide navigation — pushes to provider setup
  - Auto-navigate to last session (`/session/${sid}` block) — routes to direct LLM
  - `premiumActions.useAutoValidate()` — Chatbox license system
  - `remote.getRemoteConfig()` — fetches Chatbox remote config
  - Onboarding store init (if it only serves the guide flow)
- Remove from the JSX render:
  - `<BackgroundImageOverlay />` — depends on session store + image storage
  - `<SettingsModal />` — API key configuration modal
  - `<RemoteDialogWindow />` — Chatbox remote dialogs
  - `<SearchDialog />` — Chatbox search
  - `<PictureDialog />` — image preview for image creator
- Keep in JSX: `<ClerkProvider>`, `<SignedIn>`/`<SignedOut>`/`<SignIn>`, `<MantineProvider>`, `<Sidebar />` (new from T1), `<Outlet />`, `<Toasts />`, `<ErrorBoundary>`, `<CssBaseline>`
- Keep in logic: theme (`useTheme`, `setColorScheme`), spellCheck, language/i18n, `useAppTheme`, `useI18nEffect`
- After removing, clean up all now-unused imports. If an import points to a file that will be deleted in Wave 3, just remove the import — don't worry about the file existing yet.
- **Watch for:** `initSettingsStore()` — the settings store handles theme/language which we keep. If removing it breaks theming, keep the call but verify it doesn't load provider API keys into memory. Trace what `initSettingsStore` actually does.
**Files:** `src/renderer/routes/__root.tsx`
**Verify:** App loads. Theme works. Auth gate works. No console errors. No auto-navigation. No modals appear.

---

## Wave 3: Remove unsafe packages and stores (3 parallel tasks)

### T4: Delete direct model-call packages
**Why:** These make direct LLM API calls from the browser, bypassing the server pipeline entirely.
**What:**
- Delete these package directories: `model-calls/`, `web-search/`, `context-management/`, `model-registry/`, `model-setting-utils/` (all under `src/renderer/packages/`)
- Also scan for any OTHER packages under `src/renderer/packages/` that import from deleted packages or make direct API calls to LLM providers. Apply the decision framework.
- After deletion, grep the remaining codebase for imports from deleted paths. For each broken import:
  - If the importing file is itself slated for deletion (Wave 3 stores/components), leave it — it'll be cleaned up there
  - If the importing file is one we keep (e.g. `settingsStore.ts`), remove just the import and any code that depends on it
- **Cascading imports are the main risk here.** Don't just delete directories and hope — trace each broken reference.
**Files:** Listed package directories + any files that import from them
**Verify:** `grep -r "from.*model-calls\|from.*web-search\|from.*context-management\|from.*model-registry\|from.*model-setting-utils" src/renderer/` returns 0 results (excluding deleted files). Build doesn't fail on missing imports.

### T5: Delete unsafe stores and clean surviving ones
**Why:** These stores hold API keys, make direct LLM calls, or manage Chatbox sessions that bypass the pipeline.
**What:**
- Delete these store files: `session/generation.ts`, `session/naming.ts`, `imageGenerationActions.ts`, `premiumActions.ts`, `providerSettings.ts` (all under `src/renderer/stores/`)
- Also scan the `stores/` directory for any other files that import from deleted packages (model-calls, web-search, etc.) or make direct LLM calls. Delete those too.
- **`settingsStore.ts` — modify, don't delete.** This store handles theme, language, spellCheck which `__root.tsx` needs. But it also contains provider settings (API keys, model configs). The implementer should:
  - Trace what `initSettingsStore()` loads from persistent storage
  - If provider fields are interleaved with theme/language fields in the same store, keep the store but remove provider-related state fields and any functions that read/write API keys
  - If provider settings are in a separate section/slice, just remove that section
  - Don't guess — read the file and understand its structure before editing
- **`chatStore.ts` — check dependency.** ChatBridgeApp does NOT import it directly, but `__root.tsx` might. If `__root.tsx` references it only for the session navigation (which T3 removes), it can go. If it's needed for something we keep, leave it.
- **`sessionActions.ts` — likely needs cleanup.** It re-exports from `session/generation.ts`. Once generation.ts is deleted, sessionActions will break. Either delete it or remove the re-exports.
- Fix cascading import errors in remaining code.
**Files:** Listed store files + any additional unsafe stores found during scan
**Verify:** `grep -r "apiKey\|apikey\|api_key" src/renderer/stores/` returns 0 results (except Clerk-related). ChatBridgeApp renders.

### T6: Remove unused Chatbox components and modals
**Why:** Dead code that references deleted stores/packages will cause build errors and confusion. Also reduces attack surface — less code = fewer places for vulnerabilities to hide.
**What:**
- **Method:** Don't delete from a hardcoded list. Instead, work from build errors: after T4+T5 delete stores/packages, run `npx tsc --noEmit` (or `pnpm vite build`). Every file that fails to compile because it imports something deleted is a candidate for deletion — but only if ChatBridgeApp and `__root.tsx` don't import it.
- **Likely deletions** (verify each with grep before deleting):
  - `components/InputBox/` — Chatbox input (ChatBridgeApp has its own inline input)
  - `components/chat/MessageList.tsx` — Chatbox message rendering
  - `modals/Settings.tsx`, `modals/ModelEdit.tsx` — settings/model modals
  - `components/session/SessionList.tsx`, `SessionItem.tsx`, `TaskSessionList.tsx` — session list UI
  - `pages/PictureDialog.tsx`, `RemoteDialogWindow.tsx`, `SearchDialog.tsx` — Chatbox dialogs
- **Be conservative:** for each file, run `grep -r "from.*<filename>" src/renderer/` against the remaining code. If something we keep still imports it, don't delete it — stub it or fix the import instead.
- **Don't chase perfection.** The goal is removing safety risks and fixing build errors, not achieving zero dead code. If a harmless utility file has no imports from remaining code but also isn't hurting anything, leave it.
**Files:** Determined at execution time by build errors
**Verify:** `pnpm vite build` succeeds. No import errors.

---

## Wave 4: Verification + build (sequential)

### T7: Full build + runtime verification
**Why:** After 6 tasks of deletion and modification, we need to confirm nothing is broken and no unsafe paths remain.
**What:**
- **Build checks:**
  - `npx tsc --noEmit` — fix any remaining type errors
  - `pnpm test` — delete test files for deleted features, verify remaining tests pass
  - `pnpm vite build` — production build must succeed
- **Security grep sweep:** Search `src/renderer/` for patterns that indicate unsafe LLM access. Use these as signals, not a rigid checklist — the implementer may find additional patterns:
  - Direct model calls: `model.chat(`, `model.paint(`, `streamText(`, `generateText(`
  - API key exposure: `apiKey` in stores (Clerk keys are OK, LLM provider keys are not)
  - Direct provider URLs: `api.openai.com`, `api.anthropic.com`, `api.tavily.com`
  - Any `fetch(` call that doesn't go to `VITE_API_URL` or a CDN — trace each one
- **Runtime checks** (deploy to Vercel first):
  - `/` loads ChatBridgeApp with chat interface
  - Any other URL redirects to `/`
  - Sidebar shows only branding, user button, new chat
  - Browser devtools Network tab shows no calls to LLM provider APIs
  - Ask "let's play chess" — chess loads
  - Ask "what should I do?" — chatbot responds (proves pipeline works end-to-end)
- **Test cleanup:** Delete test files that import from deleted modules. Don't rewrite tests for deleted features — just remove them.
**Files:** Various
**Verify:** Build passes, security grep clean, runtime checks pass.

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
