# Task 7: Tool Call Limit + Reject Unknown Tools + tool_choice Passthrough

**Status:** COMPLETE

## Summary

Implemented three complementary fixes to the chat route handler:

### Changes Made

1. **Tool Call Limit (C5)**
   - Added `toolCallCount` counter before streaming loop
   - Increment counter on each tool_call detection
   - Error when `toolCallCount > 10` with message "Tool call limit exceeded (max 10 per turn)"
   - Break streaming loop on limit exceeded

2. **Reject Unknown Tools (I4)**
   - Check if `toolDef` exists immediately after lookup
   - If not found, emit error "Unknown tool: {name}" and end response
   - This happens before schema validation, preventing fallthrough to empty schema {}

3. **tool_choice Passthrough (C4)**
   - Changed `streamChat(llmMessages, tools)` to `streamChat(llmMessages, tools, 'auto')`
   - Wires the toolChoice parameter from Task 1's llm.ts through the chat route

### Files Modified

- `server/src/routes/chat.ts`
  - Added tool call counter + limit check
  - Added unknown tool rejection before validation
  - Updated streamChat call to pass 'auto' tool_choice

- `server/tests/routes/chat.test.ts`
  - Added test for tool call limit (11 calls → error)
  - Added test for unknown tool rejection
  - Fixed existing tests to include `name` field in toolResult

### Test Results

All 93 tests pass:
```
Test Files  11 passed (11)
Tests  93 passed (93)
```

### Commit

```
feat: tool call limit + reject unknown tools + tool_choice passthrough (C5, I4, C4)
```

Hash: dd13549
