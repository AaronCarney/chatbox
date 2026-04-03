# Task 9: Cost Tracking Middleware (I8)

## Status: COMPLETE

## Overview
Implemented LLM usage logging with token counts and cost estimation. Every chat request now logs token consumption and estimated costs for analysis.

## Implementation Details

### Test-Driven Approach
Added failing test that verifies:
- `logger.child().info()` called with message type `'llm usage'`
- Logged object contains: `promptTokens`, `completionTokens`, `estimatedCost`
- Optional: `model`, `requestId`, `duration` context fields

Test validates cost tracking is captured after stream completion, not during streaming.

### Implementation
**server/src/routes/chat.ts**: Enhanced streaming loop with usage tracking
- Initialize tracking variables before streaming loop:
  - `totalContent`: accumulate delta.content from each chunk
  - `lastUsage`: capture usage data from stream chunks
- During streaming: accumulate content and capture usage when present
- After streaming completes:
  - Calculate `promptTokens`: prefer `chunk.usage.prompt_tokens`, fallback to `estimateTokens(llmMessages)`
  - Calculate `completionTokens`: prefer `chunk.usage.completion_tokens`, fallback to `Math.ceil(totalContent.length / 4)`
  - Calculate `estimatedCost`: `(promptTokens * 2.5 + completionTokens * 10) / 1_000_000` (USD, GPT-4o pricing)
  - Log all metrics with request context

**server/tests/routes/chat.test.ts**: Added 1 new test
- Validates usage logging captures all required fields
- Mocks logger to verify `info()` call with correct message type

## Cost Estimation Logic
- **Prompt tokens**: Use actual count from LLM stream if available, else estimate based on message JSON length
- **Completion tokens**: Use actual count from LLM stream if available, else estimate ~4 chars per token
- **Pricing**: Based on GPT-4o (input $2.50/1M, output $10/1M)
- **Result**: Accurate costs when LLM provides usage, reasonable estimates as fallback

## Test Results
All 95 tests passing (11 test files):
- 16 tests in routes/chat.test.ts (including new usage logging test)
- No regressions in existing functionality
- TDD: test → fail → implement → pass

## Key Files Modified
- `/home/context/projects/chatbridge/server/src/routes/chat.ts`
- `/home/context/projects/chatbridge/server/tests/routes/chat.test.ts`

## Git Commit
```
feat: cost tracking middleware logs token usage per request (I8)
commit d9a3b4d
```

## Deliverable
✅ Token usage logged per chat completion for cost analysis
✅ Handles both actual usage from LLM and estimation fallback
✅ Clean structured logging with request context
✅ Cost calculation using GPT-4o pricing model
