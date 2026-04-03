# Task 16: Tool Router + Schema Injection

## Status: COMPLETE

## What Was Done

Created the tool router service for building per-turn OpenAI function calling tool arrays with dynamic app-specific tool injection.

### Files Created

1. **server/src/services/tools.ts** (89 lines)
   - Exports `PLATFORM_TOOLS`: constant array of 3 OpenAI-format tool objects
     - `launch_app`: type='function', parameters with required app_id string
     - `get_app_state`: type='function', parameters with required app_id string  
     - `get_available_apps`: type='function', empty parameters object
     - All with `strict: true` in function definition for OpenAI schema strictness
   - Exports `buildToolsForTurn(apps, activeAppId)`: 
     - Returns array starting with [...PLATFORM_TOOLS]
     - If activeAppId matches an app in the apps array, appends that app's tools
     - Converts app tools from internal format to OpenAI format: `{ type: 'function', function: { name, description, parameters: tool.input_schema, strict: true } }`
     - Returns combined tool array

   Types defined:
   - `ToolParameter`: schema for tool input parameters
   - `ToolDefinition`: shape of tools in app registry (name, description, input_schema)
   - `AppWithTools`: shape of apps array (id, tools[])
   - `OpenAITool`: OpenAI-compatible tool object

2. **server/tests/services/tools.test.ts** (152 lines)
   - Test suite with 8 tests across 2 describe blocks

   **PLATFORM_TOOLS tests:**
   - Exports exactly 3 tools
   - launch_app has correct structure with app_id parameter
   - get_app_state has correct structure with app_id parameter
   - get_available_apps has correct structure with empty parameters

   **buildToolsForTurn tests:**
   - Returns 3 platform tools for empty apps array + null activeAppId
   - Includes app tools when activeAppId matches app id in apps array
     - Verifies 5 tools returned (3 platform + 2 chess tools)
     - Verifies chess tool structure (name, description, parameters)
   - Excludes app tools when activeAppId is null
   - Excludes app tools when activeAppId doesn't match any app id

   Mock app structure: chessApp with id='chess' and tools array with tool definitions containing name, description, input_schema

## TDD Process

1. Wrote 8 failing tests first (module not found)
2. Implemented tools.ts with PLATFORM_TOOLS constant and buildToolsForTurn function
3. All 8 tests passed
4. Ran full test suite: 29/29 tests passing (5 test files)
5. Committed: `feat: tool router with per-app injection`

## Key Decisions

- PLATFORM_TOOLS is a constant (not computed per-turn) for simplicity and efficiency
- Tool conversion happens inline in buildToolsForTurn rather than in app registry layer
- Type-safe implementation with interfaces for tool shapes and OpenAI compatibility
- Schema uses `strict: true` for all tools to enable OpenAI strict schema validation

## Integration Notes

- Called by API handler to prepare tool array for OpenAI chat.completions calls
- Receives activeAppId from user/session context and available apps from database
- Pairs with existing `buildMessages` service which formats tool descriptions in system prompt
- Next: integrate into POST /api/chat handler

## No Deviations

Task completed exactly as specified. All test cases covered. 8/8 tests passing. Full suite clean.
