import { Router, Request, Response } from 'express';
import { buildMessages, streamChat } from '../services/llm.js';
import { buildToolsForTurn } from '../services/tools.js';
import { validateToolResult, wrapWithDelimiters } from '../middleware/safety.js';
import { trimHistory, summarizeAppResult } from '../services/context.js';
import { stripPii } from '../middleware/pii.js';
import { getApps, saveMessage } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { langfuse } from '../lib/langfuse.js';
import { sessionManager } from '../services/sessionSingleton.js';

const chatRouter = Router();

chatRouter.post('/chat', async (req: Request, res: Response) => {
  const { messages = [], activeAppId = null, toolResult } = req.body;
  const requestId = Math.random().toString(36).slice(2, 10);
  const log = logger.child({ requestId, activeAppId, messageCount: messages.length });
  const start = Date.now();

  const userId = (req as any).auth?.userId;
  const pseudonym = userId ? sessionManager.generatePseudonym(userId) : null;
  if (pseudonym) {
    log.info({ pseudonym }, 'session bound');
  }

  log.info({ hasToolResult: !!toolResult }, 'chat request started');

  // Langfuse trace for full request observability
  const trace = langfuse?.trace({
    name: 'chat-request',
    userId: pseudonym || undefined,
    sessionId: requestId,
    metadata: { activeAppId, messageCount: messages.length, hasToolResult: !!toolResult },
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Load apps and build tools for this turn
    const apps = await getApps();
    const tools = buildToolsForTurn(apps, activeAppId);
    log.debug({ appCount: apps.length, toolCount: tools.length }, 'tools built');

    // Strip PII from ALL message roles (user, assistant, tool) and
    // wrap tool results from history in delimiters (they bypass the toolResult validation path)
    const sanitizedMessages = messages.map((msg: { role: string; content: string; tool_call_id?: string }) => {
      let content = msg.content;
      if (typeof content === 'string') {
        content = stripPii(content);
        // Tool messages from history: enforce size cap + wrap with delimiters
        if (msg.role === 'tool' && content.length > 2048) {
          content = content.slice(0, 2048);
          log.warn({ tool_call_id: msg.tool_call_id }, 'tool result in history truncated to 2KB');
        }
        if (msg.role === 'tool' && !content.startsWith('<tool-result-')) {
          content = wrapWithDelimiters(activeAppId || 'unknown', content);
        }
      }
      return { ...msg, content };
    });

    // Handle toolResult: validate and append as tool message
    if (toolResult) {
      // Find the tool schema for validation
      const activeApp = apps.find((a: { id: string }) => a.id === activeAppId);
      const toolDef = activeApp?.tools?.find(
        (t: { name: string }) => t.name === toolResult.name
      );

      // Reject unknown tools before validation
      if (!toolDef) {
        log.warn({ toolName: toolResult.name, appId: activeAppId }, 'unknown tool result rejected');
        res.write(`data: ${JSON.stringify({ type: 'error', message: `Unknown tool: ${toolResult.name}` })}\n\n`);
        res.end();
        return;
      }

      const schema = toolDef.input_schema ?? {};
      const validation = validateToolResult(toolResult.data, schema);
      if (!validation.valid) {
        log.warn({ toolName: toolResult.name, errors: validation.errors }, 'tool result validation failed');
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: 'Tool result failed validation' })}\n\n`
        );
        res.end();
        return;
      }

      log.debug({ toolName: toolResult.name }, 'tool result validated');
      const wrapped = wrapWithDelimiters(activeAppId, toolResult.data);
      sanitizedMessages.push({
        role: 'tool',
        content: wrapped,
        tool_call_id: toolResult.tool_call_id,
      });
    }

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

    // Token budget check: 8K input cap with progressive trimming
    const estimateTokens = (msgs: any[]) =>
      Math.ceil(JSON.stringify(msgs).length / 4);

    let maxVerbatim = 20;
    let tokenEstimate = estimateTokens(withSummaries);

    while (tokenEstimate > 8000 && maxVerbatim > 5) {
      maxVerbatim -= 5;
      const testTrimmed = trimHistory(withSummaries, maxVerbatim);
      tokenEstimate = estimateTokens(testTrimmed);
    }

    if (tokenEstimate > 8000) {
      log.warn({ tokenEstimate, maxVerbatim, max: 8000 }, 'token budget exceeded after trimming');
    }

    log.info({ tokenEstimate, maxVerbatim }, 'token budget check');

    // Trim history and build LLM messages
    const trimmed = trimHistory(withSummaries, maxVerbatim);
    const llmMessages = buildMessages(trimmed, tools, apps, activeAppId);

    // Stream from LLM
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const generation = trace?.generation({
      name: 'openai-chat',
      model,
      input: llmMessages,
      modelParameters: { max_tokens: 1024, tool_choice: 'auto' },
      metadata: { toolCount: tools.length, activeAppId },
    });

    const stream = streamChat(llmMessages, tools, 'auto');

    let totalContent = '';
    let lastUsage: any = null;
    // Accumulate tool call deltas by index (OpenAI streams arguments in fragments)
    const toolCallBuffers: Record<number, { id: string; name: string; arguments: string }> = {};

    for await (const chunk of stream) {
      const choice = chunk?.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta?.content) {
        totalContent += delta.content;
        res.write(`data: ${JSON.stringify({ type: 'token', content: delta.content })}\n\n`);
      }

      if (delta?.tool_calls?.length) {
        for (const tcDelta of delta.tool_calls) {
          const idx = tcDelta.index ?? 0;
          if (!toolCallBuffers[idx]) {
            toolCallBuffers[idx] = { id: '', name: '', arguments: '' };
          }
          if (tcDelta.id) toolCallBuffers[idx].id = tcDelta.id;
          if (tcDelta.function?.name) toolCallBuffers[idx].name += tcDelta.function.name;
          if (tcDelta.function?.arguments) toolCallBuffers[idx].arguments += tcDelta.function.arguments;
        }
      }

      if (chunk.usage) {
        lastUsage = chunk.usage;
      }
    }

    // Emit assembled tool calls after stream completes
    const assembledToolCalls = Object.values(toolCallBuffers);
    if (assembledToolCalls.length > 10) {
      log.error({ count: assembledToolCalls.length, max: 10 }, 'tool call limit exceeded');
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Tool call limit exceeded (max 10 per turn)' })}\n\n`);
    } else {
      for (const tc of assembledToolCalls) {
        log.info({ toolCallId: tc.id, toolName: tc.name }, 'tool call assembled');
        res.write(`data: ${JSON.stringify({ type: 'tool_call_start', toolCall: tc })}\n\n`);
      }
    }

    const promptTokens = lastUsage?.prompt_tokens || estimateTokens(llmMessages);
    const completionTokens = lastUsage?.completion_tokens || Math.ceil(totalContent.length / 4);
    const estimatedCost = (promptTokens * 2.5 + completionTokens * 10) / 1_000_000;
    const duration = Date.now() - start;

    // End Langfuse generation with full metrics
    generation?.end({
      output: totalContent || (assembledToolCalls.length > 0 ? assembledToolCalls : undefined),
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      metadata: { toolCalls: assembledToolCalls.map(tc => tc.name), estimatedCost, duration },
    });

    log.info({
      requestId,
      model,
      promptTokens,
      completionTokens,
      estimatedCost,
      duration: `${duration}ms`,
    }, 'llm usage');

    log.info({ duration: `${Date.now() - start}ms` }, 'chat stream complete');
    res.write('data: [DONE]\n\n');

    // Fire-and-forget: persist chat history to database
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

    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err, duration: `${Date.now() - start}ms` }, 'chat request failed');
    trace?.update({ metadata: { error: message, level: 'ERROR' } });
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    res.end();
  } finally {
    langfuse?.flushAsync().catch(() => {});
  }
});

export { chatRouter };
