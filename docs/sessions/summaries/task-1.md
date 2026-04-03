# Task 1: Pass Tools to OpenAI API + tool_choice Wiring

## Status: COMPLETE

## Summary

Fixed critical bug where `streamChat` accepted `tools` parameter but never forwarded it to the OpenAI API, making the entire tool pipeline dead. Implemented wiring for `toolChoice` parameter (C4 requirement).

## Changes Made

### 1. Modified `/server/src/services/llm.ts`
- Added `toolChoice?: string` as third optional parameter to `streamChat()`
- Changed from direct `openai.chat.completions.create()` call to building `params` object
- Conditionally add `tools` and `tool_choice` to params when tools array is non-empty
- Only applies `tool_choice` if explicitly provided

### 2. Added Tests to `/server/tests/services/llm.test.ts`
- Added 3 new test cases for `streamChat`:
  1. Verifies tools are passed to OpenAI API when tools provided
  2. Verifies toolChoice parameter is accepted and passed as `tool_choice` to API
  3. Verifies tools/tool_choice are excluded when tools array is empty
- Imported vitest `afterEach` and implemented mock cleanup with `beforeEach`

## Test Results

All 87 tests pass (11 files):
- 12 LLM service tests (all passing)
- Full integration test suite validates no regressions

## Implementation Details

```typescript
export async function* streamChat(
  messages: Array<{ role: string; content: string; [key: string]: any }>,
  tools: any[],
  toolChoice?: string
) {
  // ... create OpenAI client ...
  
  const params: any = {
    model,
    messages,
    stream: true,
  };

  if (tools.length > 0) {
    params.tools = tools;
    if (toolChoice) {
      params.tool_choice = toolChoice;
    }
  }

  const stream = await openai.chat.completions.create(params);
  // ... yield stream ...
}
```

## Files Modified
- `/home/context/projects/chatbridge/server/src/services/llm.ts`
- `/home/context/projects/chatbridge/server/tests/services/llm.test.ts`

## Commit
- `fd745a6` - fix: pass tools + toolChoice to OpenAI API (critical bugfix + C4)
