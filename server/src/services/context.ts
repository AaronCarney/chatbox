interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

/**
 * Trim message history for context management.
 * If messages exceed maxVerbatim, keeps the last maxVerbatim messages verbatim
 * and prepends a summary of older messages.
 *
 * @param messages - Array of message objects
 * @param maxVerbatim - Maximum number of messages to keep verbatim (default: 20)
 * @returns Array of messages with optional summary prepended
 */
export function trimHistory(messages: Message[], maxVerbatim = 20): Message[] {
  // Return as-is if under or at limit
  if (messages.length <= maxVerbatim) {
    return messages;
  }

  // Find a safe cut point: must land on a 'user' message.
  // Never cut between assistant(tool_calls) and its tool result(s) — OpenAI 400s.
  let cutIdx = messages.length - maxVerbatim;
  if (cutIdx < 0) cutIdx = 0;
  while (cutIdx < messages.length) {
    const role = messages[cutIdx]?.role;
    if (role === 'user') break;
    cutIdx++;
  }
  if (cutIdx >= messages.length) cutIdx = Math.max(0, messages.length - maxVerbatim);

  const olderMessages = messages.slice(0, cutIdx);
  const lastMessages = messages.slice(cutIdx);

  // Extract key content from older user/assistant messages only (skip tool/system)
  const summaryItems = olderMessages
    .filter(msg => msg.role === 'user' || msg.role === 'assistant')
    .slice(0, 3)
    .map(msg => (msg.content || '').slice(0, 50));

  // Create summary system message
  const summaryContent = `[Context summary: prior discussion covered: ${summaryItems.join(', ')}]`;
  const summaryMessage: Message = {
    role: 'system',
    content: summaryContent
  };

  return [summaryMessage, ...lastMessages];
}

/**
 * Summarize app result based on recency.
 *
 * @param data - Result data object
 * @param turnsSince - Number of turns since app result was generated
 * @returns Summary string (full JSON for turns 0-2, short summary for 3-5, empty for 6+)
 */
export function summarizeAppResult(
  data: Record<string, unknown>,
  turnsSince: number
): string {
  // 6+ turns: empty string
  if (turnsSince >= 6) {
    return '';
  }

  // Turns 0-2: full JSON, truncated to 1500 chars
  if (turnsSince <= 2) {
    return JSON.stringify(data).slice(0, 1500);
  }

  // Turns 3-5: short key-value summary (first 5 keys)
  const keys = Object.keys(data).slice(0, 5);
  const keyValuePairs = keys.map(key => {
    const value = data[key];
    return `${key}: ${value}`;
  });

  return `[App result summary: ${keyValuePairs.join(', ')}]`;
}
