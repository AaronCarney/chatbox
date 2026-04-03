import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index.js';

vi.mock('../../src/services/llm.js', () => {
  return {
    buildMessages: vi.fn((history, tools) => {
      // Return history with system prompt prepended
      return [
        { role: 'system', content: 'Mock system prompt' },
        ...history
      ];
    }),
    streamChat: vi.fn(async function* () {
      // Async generator yielding test chunks
      yield { id: 'chunk-1', object: 'chat.completion.chunk', choices: [{ delta: { content: 'Hello' } }] };
      yield { id: 'chunk-2', object: 'chat.completion.chunk', choices: [{ delta: { content: ' world' } }] };
    })
  };
});

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with text/event-stream content type', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('returns response body with data: lines', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.text).toContain('data:');
  });

  it('sets SSE headers', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['connection']).toBe('keep-alive');
  });

  it('calls buildMessages and streamChat', async () => {
    const { buildMessages, streamChat } = await import('../../src/services/llm.js');

    await request(app)
      .post('/api/chat')
      .send({
        messages: [{ role: 'user', content: 'hi' }],
        tools: ['calculator']
      });

    expect(buildMessages).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hi' }],
      ['calculator']
    );
    expect(streamChat).toHaveBeenCalled();
  });

  it('includes [DONE] marker at end', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.text).toContain('[DONE]');
  });

  it('handles missing tools gracefully', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.status).toBe(200);
  });
});
