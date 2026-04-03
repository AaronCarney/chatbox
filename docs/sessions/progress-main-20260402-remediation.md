## Session Directive
> **MANDATORY:** This progress file defines your assignment. Do NOT interpret, summarize, or re-scope.
> Resume work exactly where the previous session left off. Follow the What's Next section literally.
> If the plan or instructions are unclear, ask the user — do not guess or improvise.

## Application Context
- ChatBridge — K-12 AI chat platform with third-party app integration (chess, go, spotify). GauntletAI take-home sprint, 1-week deadline (final Sunday 2026-04-06 11:59 PM CT).
- Current goal: Security hardening — remove all Chatbox direct-LLM paths from frontend. Then DOS emulator + remaining deliverables.

## Position
- Project: ChatBridge, repo: `/home/context/projects/chatbridge` (symlinked at `projects/chatbridge`), branch: `main`, phase: **spec → implementation** (security hardening)

## L2 Context
- Original L2 plan (T1-T38): COMPLETE
- Remediation spec: `docs/specs/2026-04-03-chatbridge-remediation.md`
- Remediation L2 plan: `docs/plans/2026-04-03-chatbridge-remediation-l2.md` — 16 tasks, 6 waves — ALL COMPLETE

## Task State (JSON)
```json
{
  "tasks_done": [
    "REMEDIATION-ALL",
    "DEPLOY-RAILWAY",
    "DEPLOY-VERCEL",
    "DEPLOY-DNS",
    "DEPLOY-DB-SCHEMA-SEED",
    "PORTFOLIO-PAGE",
    "CHESS-GO-BUGFIX",
    "CHESS-GO-QOL",
    "APPS-SERVED-FROM-VERCEL",
    "IFRAME-URL-FIX",
    "BROKER-RECREATION-FIX",
    "SECURITY-HARDENING-PLAN"
  ],
  "tasks_remaining": [
    {"id": "SECURITY-SPEC", "description": "Write formal spec for security hardening via /shape-spec — user requested spec phase before execution"},
    {"id": "SECURITY-HARDENING", "description": "Execute L2 plan at docs/plans/2026-04-03-security-hardening-l2.md — 8 tasks, 4 waves. Removes all Chatbox direct-LLM paths."},
    {"id": "DOS-EMULATOR", "description": "Set up js-dos emulator shell + game bundles. User collecting .zip files from Internet Archive."},
    {"id": "GITLAB-PUSH", "description": "git push gitlab main --force (needs SSH from user terminal)"},
    {"id": "DEMO-VIDEO", "description": "3-5 min demo video (user records)"},
    {"id": "COST-ANALYSIS", "description": "Update docs/cost-analysis.md with actual dev spend"}
  ],
  "test_baseline": {"suite": "vitest", "passing": 99, "files": 11}
}
```

## Deployment State
- **Railway API:** `https://chatbox-production-d06b.up.railway.app` — LIVE, health check passing
- **Vercel Frontend:** `https://chatbridge.aaroncarney.me` — LIVE
- **Cloudflare DNS:** both CNAMEs configured (chatbridge → Vercel, api.chatbridge → Railway)
- **DB:** PostgreSQL on Railway, schema applied
- **Env vars set:** Railway (OPENAI_API_KEY, CLERK keys, SPOTIFY_CLIENT_ID, DATABASE_URL, SESSION_SECRET, NODE_ENV). Vercel (VITE_API_URL, VITE_CLERK_PUBLISHABLE_KEY).

## What's Next

1. **NEXT: Write security hardening spec** — User requested `/shape-spec` before executing the L2 plan. Enter plan mode, run shape-spec skill, write formal spec to `agent-os/specs/`. This captures the design intent and acceptance criteria so multi-session execution doesn't drift.
2. **Then: Execute security hardening L2** — `docs/plans/2026-04-03-security-hardening-l2.md` (8 tasks, 4 waves). Use `parallel-plan-executor`. The L2 plan is already written and reviewed — the spec phase adds the "why" and acceptance criteria, then execution begins.
3. **DOS emulator setup** — user collecting .zip game files from Internet Archive (Oregon Trail Deluxe confirmed). Set up js-dos shell in `src/renderer/public/apps/dos/`, register games in DB seed.
4. **Push to GitLab** — `git push gitlab main --force` (needs SSH from user terminal)
5. **Demo video** (3-5 min) — user records
6. **Cost analysis** — update `docs/cost-analysis.md`

## Completed This Session
- Railway deployed: `https://chatbox-production-d06b.up.railway.app` (health OK)
- Vercel deployed: `https://chatbridge.aaroncarney.me`
- Cloudflare DNS: chatbridge + api.chatbridge CNAMEs
- DB schema + seed applied (3 apps: chess, go, spotify)
- Env vars: OPENAI_API_KEY, CLERK keys, SPOTIFY_CLIENT_ID/SECRET, DATABASE_URL, SESSION_SECRET
- Portfolio page committed + deployed to aaroncarney.me
- Chess + Go: 5 bug fixes (API mismatch, board rendering, turn logic, last-move highlights, suicide rollback)
- Chess + Go: 4 QoL features (undo for human moves only, promotion picker, coordinate labels, invalid move flash)
- Apps moved to `src/renderer/public/` (Vite root is `src/renderer/`)
- Fixed iframe_url field mapping (`iframe_url` not `url`)
- Fixed broker recreation (useCallback for resolveToolCall/handleToolCall)
- Fixed duplicate app launches (skip if already active)
- Removed stale `.erb/dll/` from git
- Wrote + refined L2 security hardening plan (8 tasks, 4 waves)

## Key Commits (remediation)
```
0923061 feat: two-tier Spotify rendering as native AppCards (I5)
6c1a578 feat: persist chat history to PostgreSQL with data classification (C9, I9)
069271c feat: wire SessionManager singleton + pseudonym logging (C8)
ed9d762 feat: handle app.resize + app.state events (I12)
c08b491 feat: 30s app timeout + max 3 retries for tool calls (I6, I7)
ad451a1 feat: wire summarizeAppResult into chat pipeline (N1)
d9a3b4d feat: cost tracking middleware logs token usage per request (I8)
570cc3e feat: 8K input token budget cap with progressive trimming (C6)
dd13549 feat: tool call limit + reject unknown tools + tool_choice passthrough (C5, I4, C4)
ee33253 feat: PII strip all message roles + address pattern (I1, I2)
ad8861c feat: get_app_state handler + SDK state protocol + fix Spotify payload.name (C2)
f0d09fb feat: dynamic system prompt + platform tool descriptions (I3)
d9ce258 fix: SSE parser + tool call shape + broker payload destructuring (C1, I10, I11)
fd745a6 fix: pass tools + toolChoice to OpenAI API (critical bugfix + C4)
```

## Key Files
- Remediation spec: `docs/specs/2026-04-03-chatbridge-remediation.md`
- Remediation L2 plan: `docs/plans/2026-04-03-chatbridge-remediation-l2.md`
- Design spec: `docs/specs/2026-04-02-chatbridge-design.md`
- DB schema: `server/src/db/schema.sql`
- DB seed: `server/src/db/seed.ts`
- Railway config: `railway.json`
- Deployment guide (website): `personal-website/app/(main)/portfolio/chatbridge/deployment/page.tsx`
- Project CLAUDE.md: `CLAUDE.md`

## Key Decisions This Session
- **Games are HTML in sandboxed iframes** — matches project spec's iframe integration requirement
- **Apps served from Vercel (frontend)**, not Railway (backend) — iframe src resolves against frontend origin
- **Sidebar must be stripped for child safety** — Chatbox sidebar links to settings (API keys), image creator (direct model calls), copilots (custom prompts). All bypass the secured /api/chat pipeline. Agreed: keep sidebar shell with ChatBridge branding, UserButton, New Chat only.
- **Security hardening is a proper L2** — not a quick fix. 24+ files with direct LLM calls need removal. Plan: `docs/plans/2026-04-03-security-hardening-l2.md`
- **User requested spec phase before execution** — wants formal spec to prevent drift across sessions

## Key Files
- Security hardening L2 plan: `docs/plans/2026-04-03-security-hardening-l2.md`
- Design spec: `docs/specs/2026-04-02-chatbridge-design.md`
- Project instructions: `docs/project-instructions.pdf`
- ChatBridgeApp (safe): `src/renderer/components/ChatBridgeApp.tsx`
- Root layout (needs cleanup): `src/renderer/routes/__root.tsx`
- Sidebar (needs rewrite): `src/renderer/Sidebar.tsx`
- Game apps: `src/renderer/public/apps/{chess,go,spotify}/`
- SDK: `src/renderer/public/sdk/chatbridge-sdk.js`

## Constraints/Blockers
- GitLab push needs SSH from user's terminal (sandbox blocks)
- Vercel auto-deploy not connected for chatbridge — must run `vercel --prod` manually
- Deadline: Sunday 2026-04-06 11:59 PM CT
