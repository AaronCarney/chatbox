import { Router, Request, Response } from 'express';
import { buildMessages, streamChat } from '../services/llm.js';
import { buildToolsForTurn } from '../services/tools.js';
import { validateToolResult, wrapWithDelimiters } from '../middleware/safety.js';
import { trimHistory } from '../services/context.js';
import { stripPii } from '../middleware/pii.js';
import { getApps } from '../db/client.js';
import { logger } from '../lib/logger.js';

const chatRouter = Router();

chatRouter.post('/chat', async (req: Request, res: Response) => {
  const { messages = [], activeAppId = null, toolResult } = req.body;
  const requestId = Math.random().toString(36).slice(2, 10);
  const log = logger.child({ requestId, activeAppId, messageCount: messages.length });
  const start = Date.now();

  log.info({ hasToolResult: !!toolResult }, 'chat request started');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Load apps and build tools for this turn
    const apps = await getApps();
    const tools = buildToolsForTurn(apps, activeAppId);
    log.debug({ appCount: apps.length, toolCount: tools.length }, 'tools built');

    // Strip PII from all message roles with string content
    const sanitizedMessages = messages.map((msg: { role: string; content: string }) => {
      if (typeof msg.content === 'string') {
        return { ...msg, content: stripPii(msg.content) };
      }
      return msg;
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

    // Token budget check: 8K input cap with progressive trimming
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

    // Trim history and build LLM messages
    const trimmed = trimHistory(sanitizedMessages, maxVerbatim);
    const llmMessages = buildMessages(trimmed, tools, apps, activeAppId);

    // Stream from LLM
    const stream = streamChat(llmMessages, tools, 'auto');

    let toolCallCount = 0;
    let totalContent = '';
    let lastUsage: any = null;
    for await (const chunk of stream) {
      const choice = chunk?.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta?.content) {
        totalContent += delta.content;
        res.write(`data: ${JSON.stringify({ type: 'token', content: delta.content })}\n\n`);
      }

      if (delta?.tool_calls?.length) {
        toolCallCount++;
        if (toolCallCount > 10) {
          log.error({ toolCallCount, max: 10, requestId }, 'tool call limit exceeded');
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Tool call limit exceeded (max 10 per turn)' })}\n\n`);
          break;
        }
        const tc = delta.tool_calls[0];
        log.info({ toolCallId: tc.id, toolName: tc.function?.name }, 'tool call detected');
        res.write(
          `data: ${JSON.stringify({
            type: 'tool_call_start',
            toolCall: {
              id: tc.id,
              name: tc.function?.name,
              arguments: tc.function?.arguments,
            },
          })}\n\n`
        );
      }

      if (chunk.usage) {
        lastUsage = chunk.usage;
      }
    }

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

    log.info({ duration: `${Date.now() - start}ms` }, 'chat stream complete');
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err, duration: `${Date.now() - start}ms` }, 'chat request failed');
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    res.end();
  }
});

export { chatRouter };
