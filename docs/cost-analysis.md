# Cost Analysis

## Pricing Reference

GPT-4o pricing: $2.50/1M input tokens, $10/1M output tokens.

OpenAI omni-moderation-latest pricing: $2.00/1K images (image moderation).

## Assumptions

| Variable | Value |
|---|---|
| Avg tokens per turn | 8,000 (input + output) |
| Input/output split | 80% input / 20% output |
| Tool invocations per session | 5 |
| Sessions per user per month | 3 |
| Token overhead per tool invocation | ~500 tokens |

Per session token estimate:
- Conversational turns: 8,000 tokens x 3 turns avg = 24,000 tokens
- Tool overhead: 5 invocations x 500 tokens = 2,500 tokens
- Total per session: ~26,500 tokens
- Input (80%): 21,200 tokens — Output (20%): 5,300 tokens

## Development Costs (Sprint: 2026-04-02 to 2026-04-06)

| Item | Detail | Cost |
|---|---|---|
| OpenAI API (GPT-4o) | ~600 calls, ~2.5M input + ~200K output tokens | ~$8 |
| Vercel | Hobby tier (free) | $0 |
| Railway | Starter plan (server + PostgreSQL) | $5/mo |
| Clerk | Free tier (<10K MAU) | $0 |
| Cloudflare DNS | Free tier | $0 |
| Domain (aaroncarney.me) | Pre-existing | $0 |
| **Total Dev Sprint** | | **~$13** |

Breakdown: system prompt ~1,500 tokens/call, user context ~2,500 tokens/call, output ~300 tokens/call avg (capped at 1,024). Heavy testing during security hardening + tool call pipeline debugging accounted for most volume.

## Production Projections (Monthly)

Token cost per user/month:
- 3 sessions x 26,500 tokens = 79,500 tokens/user/month
- Input cost: 63,600 tokens x $2.50/1M = $0.000159/user
- Output cost: 15,900 tokens x $10/1M = $0.000159/user
- **Total: ~$0.000318/user/month = $0.32/1,000 users**

| Scale | Monthly Users | Token Cost | Infra (est.) | Total |
|---|---|---|---|---|
| Pilot | 100 | $0.03 | $5 (Railway starter) | $5.03 |
| Small | 1,000 | $0.32 | $15 (Railway + Redis) | $15.32 |
| Medium | 10,000 | $3.18 | $50 (scaled Railway) | $53.18 |
| Large | 100,000 | $31.80 | $300 (multi-instance) | $331.80 |

## Cost Optimization Strategies

1. **Prompt caching** — OpenAI caches identical prefixes; system prompt (1,500 tokens) cached at 50% discount after first call = ~$0.08/1K users saved.
2. **Token budget** — max_tokens:1024 hard cap prevents runaway output. 8KB input cap prevents abuse.
3. **Session-scoped history** — ephemeral Redis (no persistence) limits context growth. History trimmed to fit token budget.
4. **Rate limiting** — 20 req/min per user, 100 req/15min burst. Prevents cost spikes from automated abuse.
5. **Tool call efficiency** — static tool routing (3 apps) avoids function-calling overhead of dynamic tool discovery.

## Content Safety Pipeline Costs

NSFWJS runs client-side (zero server cost). OpenAI image moderation fires every 30s per active session + early-warning triggers.

| Variable | Value |
|---|---|
| OpenAI moderation calls per active minute | ~2 (periodic) + ~1 (early-warning, worst case) |
| Avg active app time per session | 5 minutes |
| Moderation calls per session | ~10-15 |

Per-session moderation cost: ~15 calls x $0.002/call = **$0.03/session**

| Scale | Monthly Users | Sessions/mo | Moderation Cost | Combined with LLM |
|---|---|---|---|---|
| Pilot | 100 | 300 | $9 | $14.03 |
| Small | 1,000 | 3,000 | $90 | $105.32 |
| Medium | 10,000 | 30,000 | $900 | $953.18 |
| Large | 100,000 | 300,000 | $9,000 | $9,331.80 |

At scale, image moderation dominates cost. Mitigation strategies:
1. **Skip moderation for clean sessions** — after 5 consecutive clean OpenAI results, reduce to 60s interval
2. **NSFWJS-only for low-risk apps** — chess/Go boards rarely contain NSFW content; skip server moderation for known-safe apps
3. **Batch API** — OpenAI batch moderation (if available) at 50% discount

## Notes

- Costs scale linearly with usage; no per-seat licensing for GPT-4o.
- Clerk free tier covers up to 10,000 MAU; paid plans start at $25/mo above that.
- Spotify API: free under standard quota (no per-call cost).
- iNaturalist API: free, no API key, 100 req/min rate limit. Community-maintained. No per-call cost.
- Perenual API: free tier, 100 req/day. API key required (server-side only). Sufficient for classroom use. Paid tier ($2.99/mo) for 300 req/day if needed at scale.
- At 100K users the dominant cost is infrastructure ($300), not LLM tokens ($32).
- Switching to GPT-4o-mini ($0.15/$0.60 per 1M tokens) would reduce token costs by ~90% with acceptable quality for K-12 chat.
