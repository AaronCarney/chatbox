## Session Directive
> **MANDATORY:** This progress file defines your assignment. Do NOT interpret, summarize, or re-scope.
> Resume work exactly where the previous session left off. Follow the What's Next section literally.
> If the plan or instructions are unclear, ask the user — do not guess or improvise.

## Application Context
- ChatBridge — K-12 AI chat platform with third-party app integration (chess, go, spotify). GauntletAI take-home sprint, 1-week deadline (final Sunday 2026-04-06 11:59 PM CT).
- Current goal: Deployment phase — Railway + Vercel live, remaining: GitLab push, demo video, cost analysis.

## Position
- Project: ChatBridge, repo: `/home/context/projects/chatbridge` (symlinked at `projects/chatbridge`), branch: `main`, phase: **deployment** (Railway + Vercel live)

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

## Deployment State
- **Railway API:** `https://chatbox-production-d06b.up.railway.app` — LIVE, health check passing
- **Vercel Frontend:** `https://chatbridge.aaroncarney.me` — LIVE
- **Cloudflare DNS:** both CNAMEs configured (chatbridge → Vercel, api.chatbridge → Railway)
- **DB:** PostgreSQL on Railway, schema applied
- **Env vars set:** Railway (OPENAI_API_KEY, CLERK keys, SPOTIFY_CLIENT_ID, DATABASE_URL, SESSION_SECRET, NODE_ENV). Vercel (VITE_API_URL, VITE_CLERK_PUBLISHABLE_KEY).

## What's Next
1. ~~Deploy to Railway~~ DONE
2. ~~Deploy frontend to Vercel~~ DONE
3. ~~Cloudflare DNS~~ DONE
4. ~~Portfolio page~~ DONE — committed + deployed to aaroncarney.me
5. ~~Chess/Go bug fixes + QoL~~ DONE — undo, promotion picker, coords, invalid feedback
6. ~~Apps served from Vercel~~ DONE — moved to `src/renderer/public/`, fixed iframe_url field
7. **NEXT: Execute security hardening L2** — `docs/plans/2026-04-03-security-hardening-l2.md` (8 tasks, 4 waves). Removes all Chatbox direct-LLM paths. Use `parallel-plan-executor`.
8. **DOS emulator setup** — user collecting game files from Internet Archive
9. **Push to GitLab** — `git push gitlab main --force` (needs SSH from user's terminal)
10. **Demo video** (3-5 min) — user records
11. **Cost analysis** — `docs/cost-analysis.md` exists, may need updating with actual dev spend

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
- GitLab push needs SSH from user's terminal (sandbox blocks)
- Spotify client secret not yet provided — Spotify OAuth won't work without it
- Deadline: Sunday 2026-04-06 11:59 PM CT
