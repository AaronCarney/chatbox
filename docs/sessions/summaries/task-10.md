# Task 10 Summary: ChatBridge SDK

## Objective
Create the ChatBridge postMessage SDK for iframe-based applications.

## Implementation

### Files Created

#### `/sdk/chatbridge-sdk.js` (IIFE Module)
Vanilla JavaScript module that exposes `window.ChatBridge` with the following:

**Schema & Version:**
- Schema: `CHATBRIDGE_V1`
- Version: `1.0`

**Internal State:**
- `appId`: Extracted from `task.launch` message payload
- `completionPort`: Channel [0] from `task.launch` message for dedicated completion signaling
- `handlers`: Registry of event handlers mapped by camelCase event names

**Core Functions:**
- `createEnvelope(type, payload, extra)`: Constructs envelope with schema, version, type, timestamp, source, payload, and any extra fields
- `wireToHandlerName(wireType)`: Maps wire protocol dot-notation to camelCase handler names
  - `task.launch` → `launch`
  - `tool.invoke` → `toolInvoke`
  - Other types: first part + capitalized subsequent parts

**Message Listener:**
- Listens on `window.message` events
- Routes `task.launch` messages to `launch` handler, extracting port and appId
- Routes `tool.invoke` messages to `toolInvoke` handler with requestId
- Generic handler routing for other message types

**Public API Methods:**
- `on(event, handler)`: Register handler for camelCase event name
- `sendState(state)`: Send app state via window.parent.postMessage with type `app.state`
- `complete(status, payload, requestId)`: Signal task completion with type `task.completed`. If requestId provided, include it. Uses completionPort if available, falls back to window.parent
- `respondToTool(requestId, result)`: Respond to tool invocation with type `tool.result` and requestId
- `resize(height)`: Signal iframe resize with type `app.resize` and height in payload

#### `/src/sdk/chatbridge-sdk.test.ts` (Test Suite)
Comprehensive test suite with 17 tests covering:

**Envelope Shape (4 tests):**
- Required fields present and correct types
- Wire protocol → camelCase mapping
- RequestId handling
- Extra field support

**postMessage Methods (4 tests):**
- sendState creates correct envelope type
- complete with/without requestId
- respondToTool includes requestId
- resize includes height

**SDK Global API (9 tests):**
- ChatBridge is exposed on window with correct methods
- Event handler registration
- All public methods send correctly formatted envelopes
- Message listener dispatches to registered handlers for launch and toolInvoke

**Test Environment:** `@vitest-environment jsdom` for DOM/postMessage simulation

## Results

All 17 tests passing:
- Test Files: 1 passed
- Tests: 17 passed
- Duration: ~324ms

## Protocol Summary

**Wire Protocol Types:**
- `task.launch`: Initialize app with port and appId
- `tool.invoke`: Request tool execution with requestId
- `app.state`: App state update
- `task.completed`: Task completion signal
- `tool.result`: Tool result response
- `app.resize`: Iframe resize signal

**Handler Registration:**
Uses camelCase names despite dot-notation wire types. SDK automatically bridges the protocol conversion.

## Key Design Decisions

1. **IIFE Pattern**: Encapsulates state (appId, completionPort, handlers) with no global pollution beyond `window.ChatBridge`
2. **Wire → Handler Mapping**: Special case for `task.launch` → `launch` to avoid verbose handler names
3. **Dual Completion Channels**: Uses dedicated MessageChannel port when available, falls back to parent postMessage
4. **Timestamp Auto-Generation**: Envelope timestamp set at creation time for accurate message timing
5. **Minimal Dependencies**: Pure JavaScript, no external libraries, suitable for iframe injection
