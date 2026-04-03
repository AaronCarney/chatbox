# Task 33: Wire Frontend Integration

## Status: COMPLETE

## What Was Done

Created `src/renderer/components/ChatBridgeApp.tsx` — the main convergence component wiring all frontend pieces:

- **Mount:** `fetchApps()` → `availableApps` state; `PostMessageBroker([])` instance stored in ref; listens for `tool.result` → `resolveToolCall`; listens for `task.completed` → appends to `completedActivities`.
- **Hooks wired:** `useChat`, `useIframeApps`, `useToolExecution`, `useAuth` (Clerk).
- **handleSend:** calls `sendMessage`, dispatches on tool call name — `launch_app` calls `launchApp`, `get_available_apps` returns JSON, app tools route via `broker.sendToIframe` with `tool.invoke` and await `handleToolCall` promise.
- **Render:** scrollable message list (user right/blue, assistant left/gray), streaming bubble, `ToolCallIndicator` during tool execution, `AppCard` per completed activity, `IframeManager` per active app, bottom input bar.
- **Auth:** `useAuth().getToken()` called on each send (token available for future `getAuthHeaders` wiring in api.ts).

Updated `src/renderer/routes/index.tsx` — stripped down to a minimal TanStack route that mounts `<ChatBridgeApp />` as the `'/'` route component.

## Key Decisions

- `resolveToolCall` in broker `tool.result` handler: receives broker data payload directly.
- `handleSend` is `useCallback`-memoized with full dependency array per best practices.
- `&&` conditionals replaced with ternary (`? : null`) per `rendering-conditional-render` rule.
- Old `Index` component and all its imports removed — not needed; ChatBridgeApp is the full replacement.

## Files Changed

- `src/renderer/components/ChatBridgeApp.tsx` (new, 175 lines)
- `src/renderer/routes/index.tsx` (replaced, 5 lines)

## Commit

`feat: ChatBridgeApp wiring all systems` — `546a328`
