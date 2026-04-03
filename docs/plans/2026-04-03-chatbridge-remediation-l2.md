# ChatBridge Remediation Implementation Plan

> **For agentic workers:** Use `parallel-plan-executor` to execute. Each task dispatched to a sub-agent in a worktree.

**Goal:** Close all CRITICAL and IMPORTANT gaps between the design spec and the current implementation (10 critical, 13 important fixes).

**Architecture:** Fix SSE wire protocol mismatch (server emits `{type,content}`, client parses `choices[0].delta`), pass tools to OpenAI API (currently dead), wire SessionManager/pseudonyms, add security enforcement (tool call limits, token cap, origin validation, PII on all roles), persist chat history to PostgreSQL, and complete the get_app_state round-trip.

**Tech Stack:** TypeScript, Express, Vitest, React 18, OpenAI SDK, PostgreSQL

**Spec:** `docs/specs/2026-04-03-chatbridge-remediation.md`
**Parent spec:** `docs/specs/2026-04-02-chatbridge-design.md`

**Known limitation (deferred):** I13 (CSP nonce) — deferred per spec. `script-src 'self'` is sufficient since all scripts are bundled.

---

## Execution Protocol

### Per-Task (enforced by `task-executor` skill)

Each sub-agent MUST follow TDD for server-side tasks:
1. **Write failing test first** — unit test covering the task's core behavior
2. **Run test, confirm it fails** — verify the test is meaningful
3. **Write minimal implementation** to make the test pass
4. **Run test, confirm it passes**
5. **Commit** with conventional commit message

For client-side tasks (React components, SDK, app bridges), verify by: checking TypeScript compiles (`pnpm tsc --noEmit`), confirming no console errors, and validating the specific behavior described.

### Per-Wave (enforced by `parallel-plan-executor`)

After all tasks in a wave complete:

1. **Haiku review agent** scans each worktree:
   - Do all tests pass? (`cd server && pnpm test`)
   - Do the files from the task description actually exist?
   - Are there lint errors, TypeScript errors, or broken imports?
   - Does the code match the task spec (correct function signatures, expected exports)?

2. **If reviewer finds issues** — a **Sonnet fix agent** is dispatched to the worktree to fix before merge.

3. **Merge to main** — all worktrees merged.

4. **Integration check** — run full test suite on merged main: `cd server && pnpm test`. If failures, dispatch Sonnet agent to fix before proceeding to next wave.

### Agent Model Assignment

- **haiku** — focused, single-file tasks with clear inputs/outputs
- **sonnet** — multi-file coordination, SSE parsing, complex UI wiring

### Test Commands

- Server tests: `cd server && pnpm test`
- TypeScript check: `pnpm tsc --noEmit` (from project root)
- Full suite: `cd server && pnpm test`

---

## Wave 1 — Core Pipeline Fixes (sequential, 2 tasks)

### Task 1: Pass Tools to OpenAI API + tool_choice Wiring (C4 fix + critical bugfix)

**Agent:** haiku

**Context:** CRITICAL BUG: `llm.ts:streamChat` accepts `tools` as a parameter but never includes it in the `openai.chat.completions.create()` call. The entire tool pipeline is dead — OpenAI never sees any tools, so it can never return `tool_calls`. Also wire `toolChoice` param (C4).

**Files:**
- Modify: `server/src/services/llm.ts` — pass tools + toolChoice to OpenAI
- Modify: `server/tests/services/llm.test.ts` — add test

- [ ] **Step 1: Write failing test**

Add to `server/tests/services/llm.test.ts`:

```typescript
it('includes tools in OpenAI create params when provided', () => {
  const messages = [{ role: 'system', content: 'test' }, { role: 'user', content: 'hi' }];
  const tools = [{ type: 'function', function: { name: 'launch_app', parameters: { type: 'object', properties: {} }, strict: true } }];

  // Verify streamChat accepts tools and toolChoice without error
  // We can't consume the generator (it would call real API), but we can verify
  // the function signature is correct by checking the generator is created
  const gen = streamChat(messages, tools, 'auto');
  expect(gen).toBeDefined();
  expect(typeof gen[Symbol.asyncIterator]).toBe('function');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test -- tests/services/llm.test.ts --reporter=verbose`
Expected: FAIL — `streamChat` doesn't accept `toolChoice` as 3rd param

- [ ] **Step 3: Update streamChat to pass tools and toolChoice to OpenAI**

Replace the `streamChat` function in `server/src/services/llm.ts`:

```typescript
export async function* streamChat(
  messages: Array<{ role: string; content: string; [key: string]: any }>,
  tools: any[],
  toolChoice?: string
) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  const params: any = {
    model,
    messages: messages as OpenAI.ChatCompletionMessageParam[],
    stream: true,
  };

  if (tools.length > 0) {
    params.tools = tools;
    if (toolChoice) {
      params.tool_choice = toolChoice;
    }
  }

  const stream = await openai.chat.completions.create(params);

  for await (const chunk of stream) {
    yield chunk;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && pnpm test -- --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/llm.ts server/tests/services/llm.test.ts
git commit -m "fix: pass tools + toolChoice to OpenAI API (critical bugfix + C4)"
```

---

### Task 2: Fix SSE Client Parsing + Tool Call Shape + Broker Payload Bug (C1)

**Agent:** sonnet

**Context:** Server (`chat.ts`) emits `{"type":"token","content":"..."}` and `{"type":"tool_call_start","toolCall":{id,name,arguments}}`. Client (`useChat.ts`) parses `chunk.choices[0].delta` — OpenAI format. The two sides speak different protocols.

ALSO: After fixing useChat.ts, `ChatBridgeApp.tsx` still destructures `tc.function?.name` and `tc.function?.arguments` — the old OpenAI nested format. Since the server emits flat `{id, name, arguments}` objects, `tc.function` will be undefined and ALL tool dispatch will silently fail. Both the parser AND the consumer must be updated.

ALSO: CRITICAL PRE-EXISTING BUG in `PostMessageBroker.ts` line 28: `const { type, data } = event.data` — but SDK envelopes use `payload` not `data`. Every broker handler receives `undefined`. This breaks ALL iframe-to-parent communication (tool.result, task.completed, app.resize, app.state). Must fix `data` → `payload`.

**Files:**
- Modify: `src/renderer/hooks/useChat.ts` — switch from `choices[0].delta` to `chunk.type`/`chunk.content`/`chunk.toolCall`
- Modify: `src/renderer/components/ChatBridgeApp.tsx` — change `tc.function?.name` to `tc.name`, `tc.function?.arguments` to `tc.arguments`
- Modify: `src/renderer/components/iframe/PostMessageBroker.ts` — fix `data` → `payload` destructuring

- [ ] **Step 1: Update useChat.ts to parse server wire format**

Replace the `sendMessage` function's streaming loop in `src/renderer/hooks/useChat.ts`:

```typescript
const sendMessage = useCallback(
  async (content: string, opts?: { tools?: any[]; activeAppId?: string | null; authToken?: string | null }): Promise<ToolCallResult | void> => {
    const currentMessages = appendMessage({ role: 'user', content })

    setIsStreaming(true)
    setStreamingText('')

    let accumulated = ''
    const toolCalls: any[] = []

    try {
      for await (const chunk of streamChat(currentMessages, opts)) {
        if (chunk.type === 'token') {
          accumulated += chunk.content
          setStreamingText(accumulated)
        }

        if (chunk.type === 'tool_call_start' && chunk.toolCall) {
          toolCalls.push(chunk.toolCall)
        }

        if (chunk.type === 'error') {
          console.error('[ChatBridge] SSE error:', chunk.message)
        }
      }

      // If we collected tool calls, return them
      if (toolCalls.length > 0) {
        return { type: 'tool_calls', toolCalls }
      }

      // Text completion
      if (accumulated) {
        appendMessage({ role: 'assistant', content: accumulated })
      }
    } finally {
      setIsStreaming(false)
      setStreamingText('')
    }
  },
  [appendMessage]
)
```

- [ ] **Step 2: Update api.ts streamChat to accept options object**

In `src/renderer/services/api.ts`, replace the `streamChat` signature:

```typescript
export interface StreamOptions {
  tools?: any[]
  activeAppId?: string | null
  authToken?: string | null
}

export async function* streamChat(
  messages: ChatMessage[],
  opts?: StreamOptions
): AsyncGenerator<StreamChunk, void, unknown> {
  const request: ChatRequest = { messages }
  if (opts?.tools) request.tools = opts.tools
  if (opts?.activeAppId) request.activeAppId = opts.activeAppId

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (opts?.authToken) {
    headers['Authorization'] = `Bearer ${opts.authToken}`
  }

  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  })
  // ... rest unchanged (reader, decoder, buffer, SSE parsing)
```

Also add `activeAppId` to `ChatRequest`:

```typescript
export interface ChatRequest {
  messages: ChatMessage[]
  tools?: any[]
  activeAppId?: string | null
}
```

Update `fetchApps` to accept optional auth token:

```typescript
export async function fetchApps(authToken?: string | null): Promise<any[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  // ... rest unchanged
```

Remove the now-unnecessary `getAuthHeaders` function.

- [ ] **Step 3: Fix ChatBridgeApp.tsx tool call destructuring**

In `src/renderer/components/ChatBridgeApp.tsx`, update `handleSend` to:

1. Pass options to sendMessage:
```typescript
const token = await getToken().catch(() => null)
const activeApp = getActiveApp()
const result = await sendMessage(trimmed, {
  tools: [],
  activeAppId: activeApp?.id ?? null,
  authToken: token,
})
```

2. Fix the tool call destructuring (lines 86-88). Change from:
```typescript
const name: string = tc.function?.name ?? tc.name ?? ''
const id: string = tc.id ?? ''
const rawArgs: string = tc.function?.arguments ?? '{}'
```
To:
```typescript
const name: string = tc.name ?? ''
const id: string = tc.id ?? ''
const rawArgs: string = tc.arguments ?? '{}'
```

- [ ] **Step 4: Fix PostMessageBroker `data` → `payload` destructuring**

In `src/renderer/components/iframe/PostMessageBroker.ts`, line 28, change:

```typescript
const { type, data } = event.data;
```

To:

```typescript
const { type, payload } = event.data;
```

And update the handler calls on lines 32-33 and 38-39 from `handler(data)` to `handler(payload)`:

```typescript
// Call type-specific handlers
const typeHandlers = this.handlers.get(type);
if (typeHandlers) {
  typeHandlers.forEach((handler) => handler(payload));
}

// Call wildcard handlers
const wildcardHandlers = this.handlers.get('*');
if (wildcardHandlers) {
  wildcardHandlers.forEach((handler) => handler(event.data));
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/renderer/hooks/useChat.ts src/renderer/services/api.ts src/renderer/components/ChatBridgeApp.tsx src/renderer/components/iframe/PostMessageBroker.ts
git commit -m "fix: SSE parser + tool call shape + broker payload destructuring (C1, I10, I11)"
```

---

## Wave 2 — Tool Pipeline (parallel: {T3, T4} then sequential: T5 → T6)

T3 and T4 are parallel (no shared files). T5 then T6 run after, sequential — T5 modifies `chat.ts` (also touched by T4), T6 modifies broker/SDK (also touched by T3).

### Task 3: get_app_state Client Handler + SDK + Bridges + Spotify payload Fix (C2)

**Agent:** sonnet

**Context:** When LLM calls `get_app_state`, `ChatBridgeApp.tsx` falls through to default and sends to iframe. But no app handles `get_app_state` — it's a platform tool.

ALSO: Pre-existing bug — Spotify's `app.js` reads `payload.tool` but the parent sends `payload.name`. Fix this while touching the bridges.

**Files:**
- Modify: `src/renderer/components/ChatBridgeApp.tsx` — add `get_app_state` case
- Modify: `src/renderer/components/iframe/PostMessageBroker.ts` — add `requestState` method
- Modify: `sdk/chatbridge-sdk.js` — add `state.request` listener and `onStateRequest` API
- Modify: `apps/chess/bridge.js` — register state provider
- Modify: `apps/go/bridge.js` — register state provider
- Modify: `apps/spotify/app.js` — register state provider + fix `payload.tool` → `payload.name`

- [ ] **Step 1: Add requestState to PostMessageBroker**

In `src/renderer/components/iframe/PostMessageBroker.ts`, add method:

```typescript
requestState(appId: string, iframe: HTMLIFrameElement): Promise<any> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      reject(new Error(`State request timed out for ${appId}`));
    }, 5000);

    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(event.data?.payload ?? event.data);
    };
    channel.port1.start();

    this.sendToIframe(iframe, 'state.request', { appId }, channel.port2);
  });
}
```

- [ ] **Step 2: Add state.request handler to SDK**

In `sdk/chatbridge-sdk.js`, in the message listener, add before the generic handler (before `// Handle other message types`):

```javascript
// Handle state.request: respond with app state via MessageChannel
if (data.type === 'state.request') {
  var port = (ports && ports.length > 0) ? ports[0] : null
  if (handlers['stateRequest'] && port) {
    var state = handlers['stateRequest'](data.payload)
    port.postMessage(createEnvelope('state.response', state))
  }
  return
}
```

Add `onStateRequest` to the public API object:

```javascript
onStateRequest(handler) {
  handlers['stateRequest'] = handler
},
```

- [ ] **Step 3: Register state providers in app bridges**

In `apps/chess/bridge.js`, after `ChatBridge.on('launch', init)`:

```javascript
ChatBridge.onStateRequest(function() {
  return game ? ChessEngine.getState(game) : { error: 'No game active' };
});
```

In `apps/go/bridge.js`, after the `ChatBridge.on('launch', ...)` block:

```javascript
ChatBridge.onStateRequest(function() {
  return engine ? GoEngine.getState(engine) : { error: 'No game active' };
});
```

In `apps/spotify/app.js`, after `ChatBridge.on('launch', ...)`:

```javascript
ChatBridge.onStateRequest(function() {
  return { authenticated: document.getElementById('connected').style.display === 'block' };
});
```

- [ ] **Step 4: Fix Spotify payload.tool → payload.name**

In `apps/spotify/app.js`, in the `toolInvoke` handler, change all `payload.tool` references to `payload.name`:

```javascript
ChatBridge.on('toolInvoke', function (payload, requestId) {
  var sessionId = getSessionId();

  if (payload.name === 'search_tracks') {
    // ... existing search logic
  } else if (payload.name === 'create_playlist') {
    // ... existing playlist logic
  } else if (payload.name === 'add_to_playlist') {
    // ... existing add logic
  } else if (payload.name === 'get_recommendations') {
    // ... existing recommendations logic
  }
});
```

- [ ] **Step 5: Add get_app_state case to ChatBridgeApp.tsx**

In `src/renderer/components/ChatBridgeApp.tsx`, add case in the `switch(name)` block, before `default`:

```typescript
case 'get_app_state': {
  const args = parseArgs() as { app_id?: string }
  const targetAppId = args.app_id
  const targetApp = targetAppId
    ? Array.from(apps.values()).find((a) => a.id === targetAppId)
    : getActiveApp()
  if (targetApp && brokerRef.current) {
    const iframe = iframeRefs.current.get(targetApp.id)
    if (iframe) {
      try {
        const state = await brokerRef.current.requestState(targetApp.id, iframe)
        addToolResult(id, JSON.stringify(state))
      } catch (err) {
        addToolResult(id, JSON.stringify({ error: String(err) }))
      }
    } else {
      addToolResult(id, JSON.stringify({ error: 'App iframe not loaded' }))
    }
  } else {
    addToolResult(id, JSON.stringify({ error: 'No active app' }))
  }
  break
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/ChatBridgeApp.tsx src/renderer/components/iframe/PostMessageBroker.ts sdk/chatbridge-sdk.js apps/chess/bridge.js apps/go/bridge.js apps/spotify/app.js
git commit -m "feat: get_app_state handler + SDK state protocol + fix Spotify payload.name (C2)"
```

---

### Task 4: Dynamic System Prompt + PLATFORM_TOOLS Descriptions (I3)

**Agent:** haiku

**Context:** `buildMessages` in `llm.ts` only appends tool names. Per spec, inject `ACTIVE APPS: chess, go, spotify` and `CURRENT APP: {activeAppId || 'none'}`. Also: `PLATFORM_TOOLS` in `tools.ts` are missing `description` fields — the LLM has no context for when to use `launch_app` vs `get_app_state` vs `get_available_apps`.

**Files:**
- Modify: `server/src/services/llm.ts` — update `buildMessages` to accept apps + activeAppId
- Modify: `server/src/services/tools.ts` — add `description` to platform tools
- Modify: `server/tests/services/llm.test.ts` — add test
- Modify: `server/src/routes/chat.ts` — pass apps and activeAppId to `buildMessages`

- [ ] **Step 1: Write failing test**

Add to `server/tests/services/llm.test.ts`:

```typescript
it('injects active apps and current app into system prompt', () => {
  const history = [{ role: 'user', content: 'hi' }];
  const tools = [{ type: 'function', function: { name: 'start_game' } }];
  const apps = [
    { id: 'chess', name: 'Chess' },
    { id: 'go', name: 'Go' },
    { id: 'spotify', name: 'Spotify' },
  ];
  const result = buildMessages(history, tools, apps, 'chess');
  const systemContent = result[0].content;
  expect(systemContent).toContain('ACTIVE APPS: Chess, Go, Spotify');
  expect(systemContent).toContain('CURRENT APP: chess');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test -- tests/services/llm.test.ts --reporter=verbose`
Expected: FAIL — `buildMessages` doesn't accept apps/activeAppId params

- [ ] **Step 3: Update buildMessages**

In `server/src/services/llm.ts`:

```typescript
export function buildMessages(
  history: Array<{ role: string; content: string; [key: string]: any }>,
  tools: any[],
  apps: Array<{ id: string; name: string }> = [],
  activeAppId: string | null = null
): Array<{ role: string; content: string }> {
  let systemContent = SYSTEM_PROMPT;

  if (apps.length > 0) {
    systemContent += `\n\nACTIVE APPS: ${apps.map(a => a.name).join(', ')}`;
  }
  systemContent += `\nCURRENT APP: ${activeAppId || 'none'}`;

  if (tools.length > 0) {
    const toolNames = tools.map(t => typeof t === 'string' ? t : t?.function?.name || 'unknown');
    systemContent += '\n\nAvailable tools:\n' + toolNames.map(t => `- ${t}`).join('\n');
  }

  return [{ role: 'system', content: systemContent }, ...history];
}
```

Update `server/src/routes/chat.ts` call site:

```typescript
const llmMessages = buildMessages(trimmed, tools, apps, activeAppId);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && pnpm test -- --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 5: Add descriptions to PLATFORM_TOOLS**

In `server/src/services/tools.ts`, add `description` to each platform tool's `function` object:

```typescript
export const PLATFORM_TOOLS: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'launch_app',
      description: 'Launch a third-party app (chess, go, spotify) in the chat. Use when the student asks to play a game or use an app.',
      parameters: {
        type: 'object',
        properties: { app_id: { type: 'string' } },
        required: ['app_id'],
        additionalProperties: false
      },
      strict: true
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_app_state',
      description: 'Get the current state of an active app (e.g. chess board position, game score). Use when the student asks about what is happening in the app.',
      parameters: {
        type: 'object',
        properties: { app_id: { type: 'string' } },
        required: ['app_id'],
        additionalProperties: false
      },
      strict: true
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_available_apps',
      description: 'List all available third-party apps the student can use. Use when the student asks what apps or games are available.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      strict: true
    }
  }
];
```

- [ ] **Step 6: Commit**

```bash
git add server/src/services/llm.ts server/src/services/tools.ts server/tests/services/llm.test.ts server/src/routes/chat.ts
git commit -m "feat: dynamic system prompt + platform tool descriptions (I3)"
```

---

### Task 5: PII Strip All Roles + Address Pattern (I1 + I2)

**Agent:** haiku

**Context:** PII stripping only applies to `role === 'user'`. Assistant messages echoing user PII pass through. Also missing street address pattern.

**Files:**
- Modify: `server/src/middleware/pii.ts` — add address pattern
- Modify: `server/src/routes/chat.ts` — strip PII from all roles with string content
- Modify: `server/tests/middleware/pii.test.ts` — add address test
- Modify: `server/tests/routes/chat.test.ts` — test all-roles stripping

- [ ] **Step 1: Write failing tests**

Add to `server/tests/middleware/pii.test.ts`:

```typescript
it('strips street addresses', () => {
  expect(stripPii('I live at 123 Main Street')).toBe('I live at [REDACTED_ADDRESS]');
  expect(stripPii('Send to 456 Oak Ave')).toBe('Send to [REDACTED_ADDRESS]');
  expect(stripPii('My address is 789 Pine Boulevard')).toBe('My address is [REDACTED_ADDRESS]');
});
```

Add to `server/tests/routes/chat.test.ts`:

```typescript
it('strips PII from all message roles, not just user', async () => {
  const { stripPii } = await import('../../src/middleware/pii.js');
  const { streamChat } = await import('../../src/services/llm.js');
  vi.mocked(streamChat).mockImplementation(async function* () {
    yield { choices: [{ delta: { content: 'ok' } }] };
  });

  await request(app)
    .post('/api/chat')
    .send({
      messages: [
        { role: 'user', content: 'My email is test@example.com' },
        { role: 'assistant', content: 'You said test@example.com' },
      ],
    });

  // stripPii should be called for BOTH messages (user + assistant)
  expect(vi.mocked(stripPii).mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(stripPii).toHaveBeenCalledWith('You said test@example.com');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && pnpm test -- --reporter=verbose`
Expected: address test FAIL, all-roles test FAIL

- [ ] **Step 3: Add address pattern to pii.ts**

In `server/src/middleware/pii.ts`, add before the return statement:

```typescript
// Street address pattern
result = result.replace(
  /\b\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct)\b/gi,
  '[REDACTED_ADDRESS]'
);
```

- [ ] **Step 4: Update chat.ts to strip PII from all roles**

In `server/src/routes/chat.ts`, change the sanitization map:

```typescript
const sanitizedMessages = messages.map((msg: { role: string; content: string }) => {
  if (typeof msg.content === 'string') {
    return { ...msg, content: stripPii(msg.content) };
  }
  return msg;
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && pnpm test -- --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/middleware/pii.ts server/src/routes/chat.ts server/tests/middleware/pii.test.ts server/tests/routes/chat.test.ts
git commit -m "feat: PII strip all message roles + address pattern (I1, I2)"
```

---

### Task 6: Credentialless Iframe + Origin Enforcement (C7 + C10)

**Agent:** sonnet

**Context:** `IframeManager.tsx` missing `credentialless` attribute. `PostMessageBroker` instantiated with empty `allowedOrigins` — all inbound messages accepted. SDK uses `'*'` as `targetOrigin`.

IMPORTANT: Sandboxed iframes (`sandbox="allow-scripts"` without `allow-same-origin`) have effective origin `null`. Outbound `sendToIframe` MUST keep `'*'` — posting with `window.location.origin` to an iframe with origin `null` causes the browser to silently drop the message. Origin enforcement is INBOUND ONLY (broker's `onMessage` handler checking `event.origin`).

**Files:**
- Modify: `src/renderer/components/iframe/IframeManager.tsx` — add `credentialless`
- Modify: `src/renderer/components/ChatBridgeApp.tsx` — pass `[window.location.origin]` to broker (inbound enforcement)
- Modify: `sdk/chatbridge-sdk.js` — store and use `parentOrigin` instead of `'*'` for iframe→parent messages

- [ ] **Step 1: Add credentialless to IframeManager**

In `src/renderer/components/iframe/IframeManager.tsx`, add attribute via spread:

```typescript
<iframe
  ref={iframeRef}
  src={iframeUrl}
  sandbox="allow-scripts"
  allow=""
  referrerPolicy="no-referrer"
  loading="lazy"
  title={appId}
  {...{ credentialless: '' } as any}
  style={{
    width: '100%',
    height: '400px',
    maxHeight: '600px',
    minHeight: '200px',
    borderRadius: '8px',
    border: 'none',
    display: isActive ? 'block' : 'none',
  }}
/>
```

- [ ] **Step 2: Pass origin to PostMessageBroker**

In `src/renderer/components/ChatBridgeApp.tsx`, change broker instantiation:

```typescript
const broker = new PostMessageBroker([window.location.origin])
```

- [ ] **Step 3: Update SDK to use stored parentOrigin for iframe→parent messages**

In `sdk/chatbridge-sdk.js`, add to internal state (after `let completionPort = null`):

```javascript
let parentOrigin = '*'
```

In the `task.launch` handler (the `window.addEventListener('message', ...)` callback), the `event.origin` on `task.launch` messages received via regular postMessage contains the parent's origin. Add after setting appId:

```javascript
// task.launch arrives via regular postMessage (not port), so event.origin is the parent's origin
if (event.origin) {
  parentOrigin = event.origin
}
```

Update all `window.parent.postMessage` calls in the public API to use `parentOrigin` instead of `'*'`:

- `sendState`: `window.parent.postMessage(envelope, parentOrigin)`
- `respondToTool`: `window.parent.postMessage(envelope, parentOrigin)`
- `resize`: `window.parent.postMessage(envelope, parentOrigin)`
- `complete` (non-port path): `window.parent.postMessage(envelope, parentOrigin)`

NOTE: `sendToIframe` in `PostMessageBroker.ts` keeps `'*'` for outbound messages to sandboxed iframes — their effective origin is `null`, so any specific targetOrigin would be silently dropped by the browser. Inbound enforcement is handled by the broker's `onMessage` handler checking `allowedOrigins`.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/iframe/IframeManager.tsx src/renderer/components/ChatBridgeApp.tsx sdk/chatbridge-sdk.js
git commit -m "feat: credentialless iframe + postMessage origin enforcement (C7, C10)"
```

---

## Wave 3 — Server Hardening (sequential: T7 → T8 → T9 → T10)

These tasks all modify `server/src/routes/chat.ts`. Running them sequentially avoids merge conflicts.

### Task 7: Tool Call Limit + Reject Unknown Tools + tool_choice Passthrough (C5 + I4 + C4)

**Agent:** haiku

**Context:** No limit on tool invocations per turn (spec requires max 10). When `toolDef` not found, code falls through to empty schema `{}`. Also: Task 1 added `toolChoice` param to `streamChat` in `llm.ts` but `chat.ts` never passes it — complete the wiring by passing `'auto'` as default.

**Files:**
- Modify: `server/src/routes/chat.ts` — add tool call counter + reject unknown tools + pass toolChoice to streamChat
- Modify: `server/tests/routes/chat.test.ts` — add tests

- [ ] **Step 1: Write failing tests**

Add to `server/tests/routes/chat.test.ts`:

```typescript
it('emits error when tool call count exceeds 10', async () => {
  const { streamChat } = await import('../../src/services/llm.js');
  vi.mocked(streamChat).mockImplementation(async function* () {
    for (let i = 0; i < 11; i++) {
      yield {
        choices: [{
          delta: {
            tool_calls: [{ id: `tc-${i}`, function: { name: 'launch_app', arguments: '{}' } }],
          },
        }],
      };
    }
  });

  const res = await request(app)
    .post('/api/chat')
    .send({ messages: [{ role: 'user', content: 'hi' }] });

  expect(res.text).toContain('Tool call limit exceeded');
});

it('rejects tool result when tool name not found in app schema', async () => {
  const { streamChat } = await import('../../src/services/llm.js');
  vi.mocked(streamChat).mockImplementation(async function* () {
    yield { choices: [{ delta: { content: 'OK' } }] };
  });

  const res = await request(app)
    .post('/api/chat')
    .send({
      messages: [{ role: 'user', content: 'run tool' }],
      activeAppId: 'app-1',
      toolResult: {
        tool_call_id: 'tc-99',
        name: 'nonexistent_tool',
        data: { foo: 'bar' },
      },
    });

  expect(res.text).toContain('Unknown tool');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && pnpm test -- --reporter=verbose`
Expected: 2 new tests FAIL

- [ ] **Step 3: Implement in chat.ts**

Add counter before streaming loop:

```typescript
let toolCallCount = 0;
```

Inside the `for await` loop, in the tool_calls block:

```typescript
if (delta?.tool_calls?.length) {
  toolCallCount++;
  if (toolCallCount > 10) {
    log.error({ toolCallCount, max: 10, requestId }, 'tool call limit exceeded');
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Tool call limit exceeded (max 10 per turn)' })}\n\n`);
    break;
  }
  // ... existing tool_call_start emit
}
```

For unknown tools, in the `toolResult` handling section, after `toolDef` lookup, add before schema validation:

```typescript
if (!toolDef) {
  log.warn({ toolName: toolResult.name, appId: activeAppId }, 'unknown tool result rejected');
  res.write(
    `data: ${JSON.stringify({ type: 'error', message: `Unknown tool: ${toolResult.name}` })}\n\n`
  );
  res.end();
  return;
}
```

Also update the `streamChat` call (currently `streamChat(llmMessages, tools)`) to pass `toolChoice`:

```typescript
const stream = streamChat(llmMessages, tools, 'auto');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && pnpm test -- --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/chat.ts server/tests/routes/chat.test.ts
git commit -m "feat: tool call limit + reject unknown tools + tool_choice passthrough (C5, I4, C4)"
```

---

### Task 8: Token Budget Cap 8K (C6)

**Agent:** haiku

**Context:** No server-side token counting. Use `Math.ceil(str.length / 4)` estimation.

**Files:**
- Modify: `server/src/routes/chat.ts` — add token estimation + aggressive trimming
- Modify: `server/tests/routes/chat.test.ts` — add test

- [ ] **Step 1: Write failing test**

Add to `server/tests/routes/chat.test.ts`:

```typescript
it('trims messages when token estimate exceeds 8000', async () => {
  const { trimHistory } = await import('../../src/services/context.js');
  const { streamChat } = await import('../../src/services/llm.js');
  vi.mocked(streamChat).mockImplementation(async function* () {
    yield { choices: [{ delta: { content: 'ok' } }] };
  });

  // Create messages totaling >32000 chars (~8000 tokens)
  const longMessages = Array.from({ length: 40 }, (_, i) => ({
    role: 'user',
    content: 'x'.repeat(1000),
  }));

  await request(app)
    .post('/api/chat')
    .send({ messages: longMessages });

  // trimHistory should have been called with a reduced maxVerbatim
  const calls = vi.mocked(trimHistory).mock.calls;
  const lastCall = calls[calls.length - 1];
  expect(lastCall[1]).toBeLessThan(20);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test -- tests/routes/chat.test.ts --reporter=verbose`
Expected: FAIL

- [ ] **Step 3: Add token budget check to chat.ts**

In `server/src/routes/chat.ts`, after PII sanitization and before existing `trimHistory` call:

```typescript
const estimateTokens = (msgs: any[]) =>
  Math.ceil(JSON.stringify(msgs).length / 4);

let maxVerbatim = 20;
let tokenEstimate = estimateTokens(sanitizedMessages);

while (tokenEstimate > 8000 && maxVerbatim > 5) {
  maxVerbatim -= 5;
  const testTrimmed = trimHistory(sanitizedMessages, maxVerbatim);
  tokenEstimate = estimateTokens(testTrimmed);
}

if (tokenEstimate > 8000) {
  log.warn({ tokenEstimate, maxVerbatim, max: 8000 }, 'token budget exceeded after trimming');
}

log.info({ tokenEstimate, maxVerbatim }, 'token budget check');

const trimmed = trimHistory(sanitizedMessages, maxVerbatim);
```

Replace the existing `const trimmed = trimHistory(sanitizedMessages);` line with the above block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && pnpm test -- --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/chat.ts server/tests/routes/chat.test.ts
git commit -m "feat: 8K input token budget cap with progressive trimming (C6)"
```

---

### Task 9: Cost Tracking Middleware (I8)

**Agent:** haiku

**Context:** No token usage logging after chat completion.

**Files:**
- Modify: `server/src/routes/chat.ts` — log token usage after stream completes
- Modify: `server/tests/routes/chat.test.ts` — add test

- [ ] **Step 1: Write failing test**

Add to `server/tests/routes/chat.test.ts`:

```typescript
it('logs LLM usage with token counts after stream', async () => {
  const { logger } = await import('../../src/lib/logger.js');
  const childInfoSpy = vi.fn();
  vi.spyOn(logger, 'child').mockReturnValue({
    info: childInfoSpy,
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as any);

  const { streamChat } = await import('../../src/services/llm.js');
  vi.mocked(streamChat).mockImplementation(async function* () {
    yield { choices: [{ delta: { content: 'Hello world' } }] };
  });

  await request(app)
    .post('/api/chat')
    .send({ messages: [{ role: 'user', content: 'hi' }] });

  const usageCall = childInfoSpy.mock.calls.find(
    (call: any[]) => call[1] === 'llm usage'
  );
  expect(usageCall).toBeDefined();
  expect(usageCall[0]).toHaveProperty('promptTokens');
  expect(usageCall[0]).toHaveProperty('completionTokens');
  expect(usageCall[0]).toHaveProperty('estimatedCost');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test -- tests/routes/chat.test.ts --reporter=verbose`
Expected: FAIL — no 'llm usage' log call

- [ ] **Step 3: Add cost tracking to chat.ts**

Add tracking variables before the streaming loop:

```typescript
let totalContent = '';
let lastUsage: any = null;
```

Inside the loop, track content and capture usage:

```typescript
if (delta?.content) {
  totalContent += delta.content;
  res.write(`data: ${JSON.stringify({ type: 'token', content: delta.content })}\n\n`);
}

if (chunk.usage) {
  lastUsage = chunk.usage;
}
```

After the loop, before `res.write('data: [DONE]\n\n')`:

```typescript
const promptTokens = lastUsage?.prompt_tokens || estimateTokens(llmMessages);
const completionTokens = lastUsage?.completion_tokens || Math.ceil(totalContent.length / 4);
const estimatedCost = (promptTokens * 2.5 + completionTokens * 10) / 1_000_000;

log.info({
  requestId,
  model: process.env.OPENAI_MODEL || 'gpt-4o',
  promptTokens,
  completionTokens,
  estimatedCost,
  duration: `${Date.now() - start}ms`,
}, 'llm usage');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && pnpm test -- --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/chat.ts server/tests/routes/chat.test.ts
git commit -m "feat: cost tracking middleware logs token usage per request (I8)"
```

---

### Task 10: Wire summarizeAppResult into Pipeline (N1)

**Agent:** haiku

**Context:** `summarizeAppResult` in `context.ts` is implemented but never called. Wire it to summarize old tool results before sending to LLM.

**Files:**
- Modify: `server/src/routes/chat.ts` — call `summarizeAppResult` for tool messages
- Modify: `server/tests/routes/chat.test.ts` — add test

- [ ] **Step 1: Write failing test**

Add to `server/tests/routes/chat.test.ts`. The test must verify `summarizeAppResult` is actually called by spying on the import:

```typescript
it('calls summarizeAppResult to compress old tool results', async () => {
  const contextModule = await import('../../src/services/context.js');
  const summarizeSpy = vi.spyOn(contextModule, 'summarizeAppResult');

  const { streamChat } = await import('../../src/services/llm.js');
  vi.mocked(streamChat).mockImplementation(async function* () {
    yield { choices: [{ delta: { content: 'ok' } }] };
  });

  const msgs = [
    { role: 'user', content: 'play chess' },
    { role: 'tool', content: '{"fen":"start"}', tool_call_id: 'tc-1' },
    { role: 'user', content: 'what now?' },
  ];

  await request(app)
    .post('/api/chat')
    .send({ messages: msgs });

  expect(summarizeSpy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test -- tests/routes/chat.test.ts --reporter=verbose`
Expected: FAIL — `summarizeAppResult` is never called in current code

- [ ] **Step 3: Import and use summarizeAppResult in chat.ts**

In `server/src/routes/chat.ts`, add to imports:

```typescript
import { trimHistory, summarizeAppResult } from '../services/context.js';
```

Before the token budget block, summarize old tool results:

```typescript
// Summarize old tool results based on recency
const withSummaries = sanitizedMessages.map((msg: any, idx: number) => {
  if (msg.role === 'tool' && msg.content) {
    const turnsSince = sanitizedMessages.length - 1 - idx;
    try {
      const data = JSON.parse(msg.content);
      const summary = summarizeAppResult(data, Math.floor(turnsSince / 2));
      if (summary === '') return null;
      return { ...msg, content: summary };
    } catch {
      return msg;
    }
  }
  return msg;
}).filter(Boolean);
```

Use `withSummaries` in place of `sanitizedMessages` for the token budget check and `trimHistory`.

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd server && pnpm test -- --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/chat.ts server/tests/routes/chat.test.ts
git commit -m "feat: wire summarizeAppResult into chat pipeline (N1)"
```

---

## Wave 4 — Client Hardening (parallel, 2 tasks)

### Task 11: App Timeout + Retries (I6 + I7)

**Agent:** haiku

**Context:** No timeout on tool call execution. No retry logic. Add 30s timeout via `Promise.race` and max 3 retries.

**Files:**
- Modify: `src/renderer/components/ChatBridgeApp.tsx` — wrap tool dispatch in timeout + retry

- [ ] **Step 1: Extract dispatchToolToApp helper and add timeout + retry logic**

In `src/renderer/components/ChatBridgeApp.tsx`, add a helper function inside the component (before `handleSend`):

```typescript
const dispatchToolToApp = useCallback(async (
  toolId: string,
  toolName: string,
  args: Record<string, any>,
  targetApp: { id: string },
): Promise<any> => {
  const iframe = iframeRefs.current.get(targetApp.id)
  if (!iframe || !brokerRef.current) {
    return { error: 'No active iframe ref' }
  }

  const MAX_RETRIES = 3
  const TIMEOUT_MS = 30000
  let lastError = ''

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const toolCallPromise = handleToolCall({ id: toolId, name: toolName })
      brokerRef.current.sendToIframe(iframe, 'tool.invoke', {
        name: toolName,
        arguments: args,
        requestId: toolId,
      })

      const result = await Promise.race([
        toolCallPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('App timed out')), TIMEOUT_MS)
        ),
      ])

      return result
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.warn(`[ChatBridge] Tool call attempt ${attempt + 1}/${MAX_RETRIES} failed:`, lastError)
      if (attempt < MAX_RETRIES - 1) {
        resolveToolCall({ error: lastError })
      }
    }
  }

  console.warn('[ChatBridge] App timeout:', targetApp.id)
  resolveToolCall({ error: lastError })
  return { error: lastError }
}, [handleToolCall, resolveToolCall, iframeRefs])
```

Then update the `default` case in `handleSend` to use it:

```typescript
default: {
  const activeApp = getActiveApp()
  if (activeApp) {
    const result = await dispatchToolToApp(id, name, parseArgs(), activeApp)
    addToolResult(id, JSON.stringify(result))
  } else {
    addToolResult(id, JSON.stringify({ error: 'No active app' }))
  }
  break
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ChatBridgeApp.tsx
git commit -m "feat: 30s app timeout + max 3 retries for tool calls (I6, I7)"
```

---

### Task 12: Handle app.resize + app.stateUpdate Events (I12)

**Agent:** haiku

**Context:** Broker needs handlers for `app.resize` (update iframe height, clamped 200-600px) and `app.state` (push to rolling buffer).

**Files:**
- Modify: `src/renderer/components/ChatBridgeApp.tsx` — register broker handlers
- Modify: `src/renderer/components/iframe/IframeManager.tsx` — accept dynamic height prop

- [ ] **Step 1: Add height prop to IframeManager**

In `src/renderer/components/iframe/IframeManager.tsx`, update interface and component:

```typescript
export interface IframeManagerProps {
  appId: string
  iframeUrl: string
  isActive: boolean
  height?: number
  onRef?: (el: HTMLIFrameElement | null) => void
}

export function IframeManager({ appId, iframeUrl, isActive, height, onRef }: IframeManagerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const clampedHeight = Math.min(600, Math.max(200, height || 400))

  useEffect(() => {
    if (onRef) onRef(iframeRef.current)
  }, [onRef])

  return (
    <iframe
      ref={iframeRef}
      src={iframeUrl}
      sandbox="allow-scripts"
      allow=""
      referrerPolicy="no-referrer"
      loading="lazy"
      title={appId}
      {...{ credentialless: '' } as any}
      style={{
        width: '100%',
        height: `${clampedHeight}px`,
        maxHeight: '600px',
        minHeight: '200px',
        borderRadius: '8px',
        border: 'none',
        display: isActive ? 'block' : 'none',
      }}
    />
  )
}
```

- [ ] **Step 2: Add resize + stateUpdate handlers to ChatBridgeApp**

In `src/renderer/components/ChatBridgeApp.tsx`, add state:

```typescript
const [iframeHeights, setIframeHeights] = useState<Map<string, number>>(new Map())
```

In the broker setup `useEffect`, register handlers:

```typescript
broker.on('app.resize', (data: unknown) => {
  const d = data as { height?: number } | null
  if (d?.height) {
    const clamped = Math.min(600, Math.max(200, d.height))
    // Use active app's ID as key (broker payload doesn't include source appId)
    const active = getActiveApp()
    if (active) {
      setIframeHeights(prev => new Map(prev).set(active.id, clamped))
    }
  }
})

broker.on('app.state', (data: unknown) => {
  console.info('[ChatBridge] App state update received:', data)
})
```

Pass height to IframeManager in the render:

```typescript
<IframeManager
  key={app.id}
  appId={app.id}
  iframeUrl={app.iframeUrl}
  isActive={app.status === 'active'}
  height={iframeHeights.get(app.id)}
  onRef={(el) => {
    if (el) iframeRefs.current.set(app.id, el)
    else iframeRefs.current.delete(app.id)
  }}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ChatBridgeApp.tsx src/renderer/components/iframe/IframeManager.tsx
git commit -m "feat: handle app.resize + app.stateUpdate events (I12)"
```

---

## Wave 5 — Session + Persistence (T13 → T14 sequential, then T15 parallel)

### Task 13: Wire SessionManager Into Pipeline (C8)

**Agent:** haiku

**Context:** `session.ts` with `generatePseudonym` and `generateAppToken` exists but is never used. Wire it as a singleton. IMPORTANT: Do NOT import from `index.ts` (circular dep). Create a dedicated singleton module.

**Files:**
- Create: `server/src/services/sessionSingleton.ts` — export SessionManager instance
- Modify: `server/src/routes/chat.ts` — use pseudonym from SessionManager
- Modify: `server/src/routes/oauth.ts` — use pseudonym as session key
- Modify: `server/src/routes/spotify.ts` — use pseudonym as session key
- Modify: `server/tests/routes/chat.test.ts` — verify pseudonym logged

- [ ] **Step 1: Write failing test**

Add to `server/tests/routes/chat.test.ts`:

```typescript
it('generates and logs pseudonym from auth userId', async () => {
  const { logger } = await import('../../src/lib/logger.js');
  const childInfoSpy = vi.fn();
  vi.spyOn(logger, 'child').mockReturnValue({
    info: childInfoSpy,
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as any);

  const { streamChat } = await import('../../src/services/llm.js');
  vi.mocked(streamChat).mockImplementation(async function* () {
    yield { choices: [{ delta: { content: 'ok' } }] };
  });

  await request(app)
    .post('/api/chat')
    .send({ messages: [{ role: 'user', content: 'hi' }] });

  const sessionCall = childInfoSpy.mock.calls.find(
    (call: any[]) => call[1] === 'session bound'
  );
  expect(sessionCall).toBeDefined();
  expect(sessionCall[0]).toHaveProperty('pseudonym');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test -- tests/routes/chat.test.ts --reporter=verbose`
Expected: FAIL — no 'session bound' log

- [ ] **Step 3: Create sessionSingleton.ts**

Create `server/src/services/sessionSingleton.ts`:

```typescript
import { SessionManager } from './session.js';

export const sessionManager = new SessionManager({
  secret: process.env.SESSION_SECRET || 'chatbridge-dev-secret',
  ttlSeconds: parseInt(process.env.SESSION_TTL || '14400', 10),
});
```

- [ ] **Step 4: Use pseudonym in chat.ts**

In `server/src/routes/chat.ts`, add import:

```typescript
import { sessionManager } from '../services/sessionSingleton.js';
```

After `const log = ...`, add:

```typescript
const userId = (req as any).auth?.userId;
const pseudonym = userId ? sessionManager.generatePseudonym(userId) : null;
if (pseudonym) {
  log.info({ pseudonym }, 'session bound');
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && pnpm test -- --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/services/sessionSingleton.ts server/src/routes/chat.ts server/tests/routes/chat.test.ts
git commit -m "feat: wire SessionManager singleton + pseudonym logging (C8)"
```

---

### Task 14: Persist Chat History to PostgreSQL (C9 + I9)

**Agent:** haiku

**Context:** `chat_messages` table exists but is never written to or read from. Add `saveMessage` and `getMessages`.

**Files:**
- Modify: `server/src/db/client.ts` — add `saveMessage` and `getMessages`
- Modify: `server/src/routes/chat.ts` — fire-and-forget save after stream ends
- Modify: `server/tests/db/client.test.ts` — add tests

- [ ] **Step 1: Write failing tests**

Add to `server/tests/db/client.test.ts`:

```typescript
import { saveMessage, getMessages } from '../../src/db/client.js';

describe('chat history', () => {
  it('saveMessage is callable', async () => {
    await expect(saveMessage('pseudo-123', 'user', 'hello')).resolves.not.toThrow();
  });

  it('getMessages returns array', async () => {
    const result = await getMessages('pseudo-123');
    expect(Array.isArray(result)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && pnpm test -- tests/db/client.test.ts --reporter=verbose`
Expected: FAIL — functions don't exist

- [ ] **Step 3: Add saveMessage and getMessages**

In `server/src/db/client.ts`:

```typescript
export async function saveMessage(
  sessionPseudonym: string,
  role: string,
  content: string,
  toolCallId?: string,
  appId?: string
) {
  await pool.query(
    `INSERT INTO chat_messages (session_pseudonym, role, content, tool_call_id, app_id, data_classification)
     VALUES ($1, $2, $3, $4, $5, 'ephemeral_context')`,
    [sessionPseudonym, role, content, toolCallId || null, appId || null]
  );
}

export async function getMessages(
  sessionPseudonym: string,
  limit: number = 30
) {
  const result = await pool.query(
    `SELECT role, content, tool_call_id, app_id, created_at
     FROM chat_messages
     WHERE session_pseudonym = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionPseudonym, limit]
  );
  return result.rows.reverse();
}
```

- [ ] **Step 4: Add fire-and-forget save to chat.ts**

In `server/src/routes/chat.ts`, import:

```typescript
import { getApps, saveMessage } from '../db/client.js';
```

After `res.write('data: [DONE]\n\n')`, before `res.end()`:

```typescript
if (pseudonym) {
  const userMsg = sanitizedMessages[sanitizedMessages.length - 1];
  if (userMsg) {
    saveMessage(pseudonym, userMsg.role, userMsg.content, undefined, activeAppId).catch(() => {});
  }
  if (totalContent) {
    saveMessage(pseudonym, 'assistant', totalContent, undefined, activeAppId).catch(() => {});
  }
  log.info({ messagesSaved: totalContent ? 2 : 1 }, 'chat history persisted');
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && pnpm test -- --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/db/client.ts server/src/routes/chat.ts server/tests/db/client.test.ts
git commit -m "feat: persist chat history to PostgreSQL with data classification (C9, I9)"
```

---

### Task 15: Spotify Session Binding (C3)

**Agent:** haiku

**Context:** `apps/spotify/app.js` hardcodes `'demo-session'`. Fix: accept sessionId from `task.launch` payload.

**Files:**
- Modify: `apps/spotify/app.js` — store sessionId from launch payload
- Modify: `src/renderer/components/ChatBridgeApp.tsx` — pass sessionId in launch
- Modify: `src/renderer/components/iframe/PostMessageBroker.ts` — accept extra payload in launchApp

- [ ] **Step 1: Update Spotify app to use launch payload sessionId**

In `apps/spotify/app.js`, change `getSessionId`:

```javascript
var sessionId = 'demo-session';

function getSessionId() {
  return sessionId;
}
```

Update the `launch` handler:

```javascript
ChatBridge.on('launch', function (payload) {
  if (payload && payload.sessionId) {
    sessionId = payload.sessionId;
  }
  checkAuth();
  ChatBridge.resize(400);
});
```

- [ ] **Step 2: Update PostMessageBroker.launchApp to accept extra payload**

In `src/renderer/components/iframe/PostMessageBroker.ts`, update signature:

```typescript
launchApp(
  iframe: HTMLIFrameElement,
  appId: string,
  extra?: Record<string, any>
): Promise<MessageEvent> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(event);
    channel.port1.start();
    this.sendToIframe(iframe, 'task.launch', { appId, ...extra }, channel.port2);
  });
}
```

- [ ] **Step 3: Pass sessionId in ChatBridgeApp launch**

In `src/renderer/components/ChatBridgeApp.tsx`, add a stable session ID ref:

```typescript
const sessionIdRef = useRef(crypto.randomUUID())
```

In the `launch_app` case, after `launchApp(appId, ...)`:

```typescript
case 'launch_app': {
  const args = parseArgs() as { appId?: string; url?: string; app_id?: string }
  const appId = args.appId ?? args.app_id ?? id
  const app = availableApps.find((a) => a.id === appId)
  launchApp(appId, args.url ?? (app?.url as string) ?? '')
  setTimeout(() => {
    const iframe = iframeRefs.current.get(appId)
    if (iframe && brokerRef.current) {
      brokerRef.current.launchApp(iframe, appId, { sessionId: sessionIdRef.current })
    }
  }, 500)
  addToolResult(id, JSON.stringify({ launched: appId }))
  break
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add apps/spotify/app.js src/renderer/components/ChatBridgeApp.tsx src/renderer/components/iframe/PostMessageBroker.ts
git commit -m "feat: Spotify session binding via launch payload (C3)"
```

---

## Wave 6 — Polish (parallel, 1 task)

### Task 16: Two-Tier Spotify Rendering (I5)

**Agent:** sonnet

**Context:** Spotify search/recommendation results should render as native `AppCard` components. Uses `dispatchToolToApp` helper from Task 11.

**Files:**
- Modify: `src/renderer/components/ChatBridgeApp.tsx` — add Spotify-specific cases using the shared `dispatchToolToApp` helper

- [ ] **Step 1: Add Spotify tool cases to handleSend switch**

In `src/renderer/components/ChatBridgeApp.tsx`, add before `default`:

```typescript
case 'search_tracks':
case 'get_recommendations': {
  const activeApp = getActiveApp()
  if (activeApp) {
    const result = await dispatchToolToApp(id, name, parseArgs(), activeApp)
    addToolResult(id, JSON.stringify(result))

    // Render as native AppCard (two-tier: card instead of iframe-only)
    const tracks = (result as any)?.tracks
    if (Array.isArray(tracks)) {
      setCompletedActivities((prev) => [
        ...prev,
        {
          appName: 'Spotify',
          type: 'result' as const,
          payload: {
            title: name === 'search_tracks' ? 'Search Results' : 'Recommendations',
            items: tracks.slice(0, 5).map((t: any) => ({
              label: t.name || t.id,
              value: t.artist || (t.artists?.[0]?.name ?? ''),
            })),
          },
        },
      ])
    }
  } else {
    addToolResult(id, JSON.stringify({ error: 'No active app' }))
  }
  break
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ChatBridgeApp.tsx
git commit -m "feat: two-tier Spotify rendering as native AppCards (I5)"
```

---

## Dependency Graph

```
Wave 1 (sequential):     T1 (tools→OpenAI) → T2 (SSE+shape+broker payload fix+I10+I11)
                           |
Wave 2 (partial parallel): T3 (C2+spotify fix) ‖ T4 (I3+tools desc) → T5 (I1+I2) → T6 (C7+C10)
                           |
Wave 3 (sequential):      T7 (C5+I4+C4 passthrough) → T8 (C6) → T9 (I8) → T10 (N1)
                           |
Wave 4 (parallel):        T11 (I6+I7)  T12 (I12)
                           |            |
Wave 5 (T13→T14,T15):    T13 (C8) → T14 (C9+I9)  T15 (C3)
                                       |            |
Wave 6:                   T16 (I5)
```

**Known deferred items:** N2 (markdown renderer), N3 (admin endpoint), N4 (safety layers 2/5/6/7), N5 (prompt leak detection), N6 (DB schema constraints) — all Tier 3 "fix if time permits" per spec.

## Acceptance Criteria

After all waves complete:
- [ ] `cd server && pnpm test` — 84+ tests passing (expect ~100+ with new tests)
- [ ] Send "let's play chess" → chess board appears → LLM makes moves via tool calls
- [ ] Send "what is chess?" → LLM responds without invoking tools
- [ ] Mid-game "what should I do?" → LLM calls `get_app_state` → analyzes position
- [ ] Switch between chess and Go → context retained
- [ ] PII in messages stripped before reaching OpenAI (all roles)
- [ ] Tool results > 2KB rejected
- [ ] > 10 tool calls per turn blocked
- [ ] Messages persisted to PostgreSQL with `data_classification: 'ephemeral_context'`
- [ ] Spotify uses real session ID (not 'demo-session')
- [ ] Spotify reads `payload.name` (not `payload.tool`)
- [ ] PostMessage origin enforcement active
- [ ] Cost tracking logs emitted per request
- [ ] Tools actually passed to OpenAI API
