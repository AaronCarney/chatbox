// Re-export CRUD operations from session/crud.ts
export {
  _copySession,
  clear,
  clearConversationList,
  copyAndSwitchSession,
  createEmpty,
  reorderSessions,
  switchCurrentSession,
  switchToIndex,
  switchToNext,
} from './session/crud'
// Re-export export operations from session/export.ts
export { exportSessionChat } from './session/export'
// Re-export fork operations from session/forks.ts
export { createNewFork, deleteFork, expandFork, switchFork } from './session/forks'
// Re-export message operations from session/messages.ts
export {
  insertMessage,
  insertMessageAfter,
  modifyMessage,
  removeMessage,
} from './session/messages'
// Re-export thread operations from session/threads.ts
export {
  compressAndCreateThread,
  editThread,
  moveCurrentThreadToConversations,
  moveThreadToConversations,
  refreshContextAndCreateNewThread,
  removeCurrentThread,
  removeThread,
  startNewThread,
  switchThread,
} from './session/threads'

// No-op stubs: LLM generation functions removed during security hardening
// These were in session/generation.ts and session/naming.ts (direct LLM calls)
export const generateMore = (..._args: unknown[]) => {}
export const regenerateInNewFork = (..._args: unknown[]) => {}
export const generateMoreInNewFork = (..._args: unknown[]) => {}
export const submitNewUserMessage = (..._args: unknown[]) => {}
export const scheduleGenerateNameAndThreadName = (..._args: unknown[]) => {}
export const scheduleGenerateThreadName = (..._args: unknown[]) => {}
export const getMessageThreadContext = async (..._args: unknown[]) => []
