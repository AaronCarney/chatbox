# Task 10: Wire summarizeAppResult into Pipeline

## Summary
Wired `summarizeAppResult` into the chat pipeline to compress old tool results before sending to LLM.

## Changes

### chat.ts
- Imported `summarizeAppResult` from context.ts
- Added summarization logic before token budget check:
  - Maps over `sanitizedMessages` to identify tool messages
  - Calculates `turnsSince` for each tool result
  - Parses JSON content and calls `summarizeAppResult` with turn distance
  - Filters out empty summaries (6+ turns old)
  - Replaces `sanitizedMessages` with `withSummaries` for token budget and trimming

### chat.test.ts
- Added mock for `summarizeAppResult` in context.js mock
- Added test: "calls summarizeAppResult to compress old tool results"
  - Verifies function is called when tool messages are present
  - Tests with messages containing a tool result

## Test Results
- All 96 tests passing
- New test validates `summarizeAppResult` is invoked

## Files Modified
- `server/src/routes/chat.ts`
- `server/tests/routes/chat.test.ts`

## Commit
`ad451a1` - feat: wire summarizeAppResult into chat pipeline (N1)
