## Session Directive
> **MANDATORY:** This progress file defines your assignment. Do NOT interpret, summarize, or re-scope.
> Resume work exactly where the previous session left off. Follow the What's Next section literally.
> If the plan or instructions are unclear, ask the user — do not guess or improvise.

## Application Context
- ChatBridge — K-12 AI chat platform with third-party app integration (chess, go, spotify). GauntletAI take-home sprint, 1-week deadline (final Sunday 2026-04-06 11:59 PM CT).
- Current goal: Execute remediation L2 plan — 16 tasks across 6 waves. ALL 16 TASKS COMPLETE.

## Position
- Project: ChatBridge, repo: `/home/context/projects/chatbridge` (symlinked at `projects/chatbridge`), branch: `main`, phase: **implementation** (remediation complete, deployment next)

## L2 Context
- Original L2 plan (T1-T38): COMPLETE
- Remediation spec: `docs/specs/2026-04-03-chatbridge-remediation.md`
- Remediation L2 plan: `docs/plans/2026-04-03-chatbridge-remediation-l2.md` — 16 tasks, 6 waves — ALL COMPLETE

## Task State (JSON)
```json
{
  "tasks_done": ["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12","T13","T14","T15","T16"],
  "tasks_remaining": [],
  "test_baseline": {"suite": "vitest", "passing": 99, "files": 11},
  "planning_status": "complete",
  "remediation_status": "ALL 16 TASKS COMPLETE — 99 tests passing"
}
```

## What's Next
1. **Deploy to Railway** — user needs to set up Railway project via dashboard (CLI auth failed in WSL). Schema file at `server/src/db/schema.sql`, seed at `server/src/db/seed.ts`. The `railway.json` config is ready.
2. **Deploy frontend to Vercel** — Vite SPA, env vars: `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`
3. **Cloudflare DNS** — two CNAME records: `chatbridge` → `cname.vercel-dns.com`, `api.chatbridge` → Railway URL. DNS only (grey cloud).
4. **Push to GitLab** — `git remote add gitlab ssh://git@labs.gauntletai.com:22022/aaroncarney/chatbridge.git && git push gitlab main` (needs SSH from user's terminal)
5. **Demo video** (3-5 min) — user records
6. **Cost analysis** — `docs/cost-analysis.md` exists, may need updating with actual dev spend
7. **Personal website** — ChatBridge project page created at `personal-website/content/projects/chatbridge.json` and deployment guide at `personal-website/app/(main)/portfolio/chatbridge/deployment/page.tsx`

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

## Constraints/Blockers
- Railway CLI auth fails in WSL — user deploying via dashboard
- GitLab push needs SSH from user's terminal (sandbox blocks)
- Spotify OAuth needs SPOTIFY_CLIENT_ID/SECRET env vars
- Clerk needs CLERK_PUBLISHABLE_KEY/SECRET_KEY
- OpenAI needs OPENAI_API_KEY
- Deadline: Sunday 2026-04-06 11:59 PM CT
