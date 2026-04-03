import { Router, Request, Response } from 'express';
import { buildMessages, streamChat } from '../services/llm.js';
import { buildToolsForTurn } from '../services/tools.js';
import { validateToolResult, wrapWithDelimiters } from '../middleware/safety.js';
import { trimHistory } from '../services/context.js';
import { stripPii } from '../middleware/pii.js';
import { getApps } from '../db/client.js';

const chatRouter = Router();

chatRouter.post('/chat', async (req: Request, res: Response) => {
  const { messages = [], activeAppId = null, toolResult } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Load apps and build tools for this turn
    const apps = await getApps();
    const tools = buildToolsForTurn(apps, activeAppId);

    // Strip PII from all user message content
    const sanitizedMessages = messages.map((msg: { role: string; content: string }) => {
      if (msg.role === 'user') {
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
      const schema = toolDef?.input_schema ?? {};

      const validation = validateToolResult(toolResult.data, schema);
      if (!validation.valid) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: 'Tool result failed validation' })}\n\n`
        );
        res.end();
        return;
      }

      const wrapped = wrapWithDelimiters(activeAppId, toolResult.data);
      sanitizedMessages.push({
        role: 'tool',
        content: wrapped,
        tool_call_id: toolResult.tool_call_id,
      });
    }

    // Trim history and build LLM messages
    const trimmed = trimHistory(sanitizedMessages);
    const llmMessages = buildMessages(trimmed, tools);

    // Stream from LLM
    const stream = streamChat(llmMessages, tools);

    for await (const chunk of stream) {
      const choice = chunk?.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta?.content) {
        res.write(`data: ${JSON.stringify({ type: 'token', content: delta.content })}\n\n`);
      }

      if (delta?.tool_calls?.length) {
        const tc = delta.tool_calls[0];
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
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    res.end();
  }
});

export { chatRouter };
