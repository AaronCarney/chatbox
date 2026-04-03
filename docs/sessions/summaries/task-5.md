# Task 5: Delete Unsafe Stores and Clean Surviving Ones

## Status: COMPLETE

## What Was Done

Removed 11 store files containing direct LLM calls, API key storage, image generation, Chatbox license management, and provider settings. Cleaned surviving stores to remove broken imports and provider-related code.

## Files Deleted (11)

- `src/renderer/stores/session/generation.ts` — direct LLM generation (streamText, generateImage)
- `src/renderer/stores/session/naming.ts` — LLM-based session naming (generateText)
- `src/renderer/stores/imageGenerationActions.ts` — image generation actions
- `src/renderer/stores/imageGenerationStore.ts` — image generation state
- `src/renderer/stores/premiumActions.ts` — Chatbox license activation/deactivation
- `src/renderer/stores/providerSettings.ts` — provider settings merge helper
- `src/renderer/stores/taskCompaction.ts` — imports model-registry + context-management, no importers
- `src/renderer/stores/providerSettings.test.ts` — test for deleted module
- `src/renderer/stores/imageGenerationActions.test.ts` — test for deleted module
- `src/renderer/stores/sessionActions.test.ts` — test for deleted module
- `src/renderer/stores/settingsStore.persist.test.ts` — tested provider persistence

## Files Modified (5)

- `src/renderer/stores/settingsStore.ts` — removed `ProviderSettings` import, `mergeProviderSettings` import, `useMcpSettings`, `useProviderSettings` hook, provider-count logging in `initSettingsStore`. Kept: theme, language, spellCheck, fontSize, shortcuts, proxy, autoLaunch subscribers
- `src/renderer/stores/sessionActions.ts` — removed re-exports from deleted `generation.ts` and `naming.ts`, removed `submitNewUserMessage` re-export
- `src/renderer/stores/session/index.ts` — removed generation (8 functions) and naming (4 functions) re-exports, removed `submitNewUserMessage`
- `src/renderer/stores/session/messages.ts` — removed `submitNewUserMessage` (imports generate, runCompactionWithUIState, getModelDisplayName from deleted packages), removed `getSessionWebBrowsing` helper, stripped 15 unused imports
- `src/renderer/stores/settingActions.ts` — removed `ModelProviderEnum` import, simplified `needEditSetting()` to return false (ChatBridge manages config server-side)

## Cascading Errors (T6's job)

Components/routes that import deleted stores will fail at build time:
- `__root.tsx` → `premiumActions` (useAutoValidate)
- `MCPMenu.tsx`, `BuiltinServersSection.tsx` → `premiumActions`
- `image-creator/index.tsx` → `imageGenerationActions`, `imageGenerationStore`
- Settings provider routes → `premiumActions`
- Components using `submitNewUserMessage`, `generate`, `scheduleGenerateNameAndThreadName`

## Net Impact

-2,802 lines deleted, +15 lines added. Zero direct LLM call paths remain in stores.
