# Task 8: LLM Service (System Prompt + Message Builder)

## Status
COMPLETE

## What Was Done

### 1. Added OpenAI Dependency
- `pnpm add openai` added v6.33.0 to server/package.json

### 2. Created Test File (TDD)
- `server/tests/services/llm.test.ts` with 9 tests:
  - SYSTEM_PROMPT contains "UNTRUSTED" reference
  - SYSTEM_PROMPT contains "Socratic" method reference
  - SYSTEM_PROMPT contains teaching/guiding reference
  - SYSTEM_PROMPT identifies as TutorMeAI
  - buildMessages prepends system prompt as first message
  - buildMessages includes all history after system prompt
  - buildMessages appends tools list when tools provided
  - buildMessages does not include tools when empty
  - buildMessages handles empty history

### 3. Implemented LLM Service
- `server/src/services/llm.ts` exports:
  - **SYSTEM_PROMPT**: Complete prompt text for K-12 educational assistant with Socratic method, safety guardrails, and UNTRUSTED data warnings
  - **buildMessages(history, tools)**: Prepends system prompt, optionally includes formatted tool list, preserves all history messages
  - **streamChat(messages, tools)**: Async generator wrapping OpenAI chat.completions.create with stream: true, model from process.env.OPENAI_MODEL || 'gpt-4o'

### 4. Test Results
- All 10 tests pass (9 LLM service + 1 health check)
- Tests verify system prompt content and message building logic

## Files Changed
- `server/package.json` - added openai ^6.33.0
- `server/src/services/llm.ts` - new file, 48 lines
- `server/tests/services/llm.test.ts` - new file, 72 lines

## Commit
`feat: LLM service with system prompt` (c0c744e)

## Key Implementation Details
- System prompt emphasizes Socratic teaching method, age-appropriate responses, and treats third-party tool data as UNTRUSTED
- buildMessages formats available tools as a simple bullet list appended to system prompt
- streamChat properly types OpenAI messages and respects environment variables for API key and model selection
