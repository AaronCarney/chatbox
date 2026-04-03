# Task 6: Remove unused Chatbox components and modals

## Status
COMPLETE

## What Was Done

Stubbed broken imports in 6 component files that reference packages/stores being deleted by T4 and T5. Conservative approach: no files deleted since all affected components are still imported by kept code (session route, Sidebar, settings routes).

### Files Modified
- `src/renderer/components/InputBox/InputBox.tsx` — stubbed `context-management` (getContextMessageIds, isAutoCompactionEnabled, isCompactionInProgress, useContextTokens) and `model-registry` (getModelContextWindowSync, getProviderModelContextWindowSync, useModelRegistryVersion) with safe no-op defaults
- `src/renderer/components/chat/CompactionStatus.tsx` — stubbed `runCompactionWithUIState` from context-management
- `src/renderer/components/common/CompressionModal.tsx` — stubbed `runCompactionWithUIState` from context-management/compaction
- `src/renderer/components/mcp/MCPMenu.tsx` — stubbed `useAutoValidate` from premiumActions (returns false)
- `src/renderer/components/settings/mcp/BuiltinServersSection.tsx` — stubbed `useAutoValidate` from premiumActions (returns false)
- `src/renderer/components/message-parts/ToolCallPartUI.tsx` — redirected `SearchResultItem` type import from `@/packages/web-search` to `@shared/types` (where it originates)

### Why No Deletions
All candidate components (InputBox, MessageList, SessionList, ModelSelector, etc.) are still actively imported by kept code:
- InputBox, MessageList, ThreadHistoryDrawer -> session/$sessionId.tsx route
- SessionList, TaskSessionList -> Sidebar.tsx
- ModelSelector -> InputBox -> session route
- ModelEdit modal -> settings/provider route
- CompactionStatus, CompressionModal -> InputBox -> session route

## Verification
- TypeScript check: 207 renderer errors (206 pre-existing + 1 line-shift, 0 new real errors)
- Tests: 7 failures, all pre-existing (migration, settingsStore.persist, providers contract, token-estimation)
- No new test failures introduced
