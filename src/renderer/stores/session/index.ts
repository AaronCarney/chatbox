/**
 * Session Module Public API
 *
 * Provides session CRUD, messages, threads, forks, and export operations.
 * Generation and naming removed (security hardening — no direct LLM calls).
 */

// CRUD operations
export {
  clear,
  clearConversationList,
  copyAndSwitchSession,
  createEmpty,
  reorderSessions,
  switchCurrentSession,
  switchToIndex,
  switchToNext,
} from './crud'
// Export operations
export { exportSessionChat } from './export'
// Fork operations
export { createNewFork, deleteFork, expandFork, findMessageLocation, switchFork } from './forks'
// Message operations
export { insertMessage, insertMessageAfter, modifyMessage, removeMessage } from './messages'
// Thread operations
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
} from './threads'
// Types and state
export * from './types'
