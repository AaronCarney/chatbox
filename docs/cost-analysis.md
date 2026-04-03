# Cost Analysis

## Pricing Reference

GPT-4o pricing: $2.50/1M input tokens, $10/1M output tokens.

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

## Development Costs (Sprint)

| Item | Detail | Cost |
|---|---|---|
| OpenAI API spend | $X (placeholder — log from OpenAI dashboard) | $X |
| Token usage | Estimated 2–5M tokens during dev + testing | — |
| API calls | ~500–1,000 calls during dev cycle | — |
| Infrastructure | Vercel hobby (free) + Railway starter ($5/mo) | $5 |
| **Total Dev** | | **$X + $5** |

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

## Notes

- Costs scale linearly with usage; no per-seat licensing for GPT-4o.
- Redis (session caching) reduces repeat token spend for recurring users.
- Clerk free tier covers up to 10,000 MAU; paid plans start at $25/mo above that.
- Spotify API: free under standard quota (no per-call cost).
- At 100K users the dominant cost is infrastructure, not LLM tokens.
