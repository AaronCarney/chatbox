import { Router, Request, Response } from 'express';
import { buildMessages, streamChat } from '../services/llm.js';

const chatRouter = Router();

chatRouter.post('/chat', async (req: Request, res: Response) => {
  const { messages, tools = [] } = req.body;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const builtMessages = buildMessages(messages, tools);
    const stream = streamChat(builtMessages, tools);

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`);
    res.end();
  }
});

export { chatRouter };
