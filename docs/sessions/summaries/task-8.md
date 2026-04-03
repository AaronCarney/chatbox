# Task 8: Token Budget Cap 8K (C6)

## Status
COMPLETE

## What Was Done

### 1. Added Failing Test (TDD)
- `server/tests/routes/chat.test.ts`: Added test `trims messages when token estimate exceeds 8000`
  - Creates 40 messages × 1000 chars each (40,000 chars total, ~10,000 tokens)
  - Verifies trimHistory is called with second parameter < 20 when messages exceed budget

### 2. Implemented Token Budget Check
- **Location**: `server/src/routes/chat.ts`, after PII sanitization, before LLM call
- **Algorithm**:
  - Character-based token estimation: `Math.ceil(JSON.stringify(msgs).length / 4)`
  - Progressive trimming: Start at maxVerbatim=20, decrement by 5 each iteration
  - Continue until tokenEstimate ≤ 8000 or maxVerbatim ≤ 5
  - Log warning if budget still exceeded after exhausting trim options
  - Log info event with final token estimate and maxVerbatim value

### 3. Test Results
- All 94 tests pass
- New test validates token budget enforcement
- Zero-dependency implementation (no external token counters)

## Files Changed
- `server/src/routes/chat.ts` - Added token budget check logic
- `server/tests/routes/chat.test.ts` - Added token budget test

## Commit
`feat: 8K input token budget cap with progressive trimming (C6)` (570cc3e)

## Key Implementation Details
- Uses character count / 4 for token estimation per spec requirement
- Progressive trimming respects existing trimHistory interface
- Logging provides visibility into token budget decisions
- Graceful degradation: warns but continues if final estimate still > 8000 (edge case handling)
