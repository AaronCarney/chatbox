import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index.js';

vi.mock('../../src/services/llm.js', () => ({
  buildMessages: vi.fn((history: unknown[]) => [
    { role: 'system', content: 'Mock system prompt' },
    ...history,
  ]),
  streamChat: vi.fn(async function* () {
    yield { choices: [{ delta: { content: 'Hello' } }] };
    yield { choices: [{ delta: { content: ' world' } }] };
  }),
}));

vi.mock('../../src/db/client.js', () => ({
  getApps: vi.fn(async () => [
    {
      id: 'app-1',
      tools: [
        {
          name: 'submit_grade',
          description: 'Submit a grade',
          input_schema: {
            type: 'object',
            properties: { grade: { type: 'number' } },
            required: ['grade'],
          },
        },
      ],
    },
  ]),
}));

vi.mock('../../src/services/tools.js', () => ({
  buildToolsForTurn: vi.fn(() => [
    { type: 'function', function: { name: 'launch_app', parameters: {}, strict: true } },
  ]),
}));

vi.mock('../../src/middleware/pii.js', () => ({
  stripPii: vi.fn((text: string) => text),
}));

vi.mock('../../src/middleware/safety.js', () => ({
  validateToolResult: vi.fn(() => ({ valid: true })),
  wrapWithDelimiters: vi.fn(
    (appId: string, data: unknown) => `<wrapped appId="${appId}">${JSON.stringify(data)}</wrapped>`
  ),
}));

vi.mock('../../src/services/context.js', () => ({
  trimHistory: vi.fn((msgs: unknown[]) => msgs),
  summarizeAppResult: vi.fn((data: unknown) => JSON.stringify(data)),
}));

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with text/event-stream content type', async () => {
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'Hello' } }] };
    });

    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('sets SSE headers', async () => {
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'hi' } }] };
    });

    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['connection']).toBe('keep-alive');
  });

  it('emits token events for content chunks', async () => {
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'Hello' } }] };
      yield { choices: [{ delta: { content: ' world' } }] };
    });

    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.text).toContain('data: {"type":"token","content":"Hello"}');
    expect(res.text).toContain('data: {"type":"token","content":" world"}');
  });

  it('ends with [DONE] marker', async () => {
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'hi' } }] };
    });

    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.text).toContain('data: [DONE]');
  });

  it('strips PII from user messages before sending to LLM', async () => {
    const { stripPii } = await import('../../src/middleware/pii.js');
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'ok' } }] };
    });

    await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'My email is test@example.com' }] });

    expect(stripPii).toHaveBeenCalledWith('My email is test@example.com');
  });

  it('strips PII from all message roles, not just user', async () => {
    const { stripPii } = await import('../../src/middleware/pii.js');
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'ok' } }] };
    });

    await request(app)
      .post('/api/chat')
      .send({
        messages: [
          { role: 'user', content: 'My email is test@example.com' },
          { role: 'assistant', content: 'You said test@example.com' },
        ],
      });

    expect(vi.mocked(stripPii).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(stripPii).toHaveBeenCalledWith('You said test@example.com');
  });

  it('calls getApps and buildToolsForTurn', async () => {
    const { getApps } = await import('../../src/db/client.js');
    const { buildToolsForTurn } = await import('../../src/services/tools.js');
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'ok' } }] };
    });

    await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }], activeAppId: 'app-1' });

    expect(getApps).toHaveBeenCalled();
    expect(buildToolsForTurn).toHaveBeenCalled();
  });

  it('calls trimHistory before sending to LLM', async () => {
    const { trimHistory } = await import('../../src/services/context.js');
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'ok' } }] };
    });

    await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(trimHistory).toHaveBeenCalled();
  });

  it('emits tool_call_start event when chunk has tool_calls', async () => {
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield {
        choices: [
          {
            delta: {
              tool_calls: [{ id: 'tc-1', function: { name: 'launch_app', arguments: '{}' } }],
            },
          },
        ],
      };
    });

    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    const lines = res.text
      .split('\n')
      .filter((l: string) => l.startsWith('data: ') && l.trim() !== 'data: [DONE]');
    const events = lines.map((l: string) => JSON.parse(l.slice('data: '.length)));

    const toolCallEvent = events.find((e: { type: string }) => e.type === 'tool_call_start');
    expect(toolCallEvent).toBeDefined();
    expect(toolCallEvent.toolCall.id).toBe('tc-1');
    expect(toolCallEvent.toolCall.name).toBe('launch_app');
  });

  it('validates toolResult and appends as tool message when valid', async () => {
    const { validateToolResult, wrapWithDelimiters } = await import('../../src/middleware/safety.js');
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'OK' } }] };
    });
    vi.mocked(validateToolResult).mockReturnValue({ valid: true });
    vi.mocked(wrapWithDelimiters).mockReturnValue('<wrapped>data</wrapped>');

    const res = await request(app)
      .post('/api/chat')
      .send({
        messages: [{ role: 'user', content: 'run tool' }],
        activeAppId: 'app-1',
        toolResult: {
          tool_call_id: 'tc-42',
          name: 'submit_grade',
          data: { grade: 95 },
        },
      });

    expect(validateToolResult).toHaveBeenCalled();
    expect(wrapWithDelimiters).toHaveBeenCalledWith('app-1', { grade: 95 });
    expect(res.status).toBe(200);
  });

  it('emits error and ends when toolResult fails validation', async () => {
    const { validateToolResult } = await import('../../src/middleware/safety.js');
    vi.mocked(validateToolResult).mockReturnValue({
      valid: false,
      errors: ['root must be object'],
    });

    const res = await request(app)
      .post('/api/chat')
      .send({
        messages: [{ role: 'user', content: 'run tool' }],
        activeAppId: 'app-1',
        toolResult: {
          tool_call_id: 'tc-99',
          name: 'submit_grade',
          data: 'bad payload',
        },
      });

    expect(res.text).toContain('"type":"error"');
    expect(res.text).toContain('Tool result failed validation');
  });

  it('emits error event on streamChat failure', async () => {
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      throw new Error('LLM unavailable');
    });

    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.text).toContain('"type":"error"');
    expect(res.text).toContain('LLM unavailable');
  });

  it('emits error when tool call count exceeds 10', async () => {
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      for (let i = 0; i < 11; i++) {
        yield {
          choices: [{
            delta: {
              tool_calls: [{ id: `tc-${i}`, function: { name: 'launch_app', arguments: '{}' } }],
            },
          }],
        };
      }
    });
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.text).toContain('Tool call limit exceeded');
  });

  it('rejects tool result when tool name not found in app schema', async () => {
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'OK' } }] };
    });
    const res = await request(app)
      .post('/api/chat')
      .send({
        messages: [{ role: 'user', content: 'run tool' }],
        activeAppId: 'app-1',
        toolResult: { tool_call_id: 'tc-99', name: 'nonexistent_tool', data: { foo: 'bar' } },
      });
    expect(res.text).toContain('Unknown tool');
  });

  it('trims messages when token estimate exceeds 8000', async () => {
    const { trimHistory } = await import('../../src/services/context.js');
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'ok' } }] };
    });
    // Create messages totaling >32000 chars (~8000 tokens)
    const longMessages = Array.from({ length: 40 }, (_, i) => ({
      role: 'user',
      content: 'x'.repeat(1000),
    }));
    await request(app)
      .post('/api/chat')
      .send({ messages: longMessages });
    const calls = vi.mocked(trimHistory).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[1]).toBeLessThan(20);
  });

  it('logs LLM usage with token counts after stream', async () => {
    const { logger } = await import('../../src/lib/logger.js');
    const childInfoSpy = vi.fn();
    vi.spyOn(logger, 'child').mockReturnValue({
      info: childInfoSpy,
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any);

    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'Hello world' } }] };
    });

    await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    const usageCall = childInfoSpy.mock.calls.find(
      (call: any[]) => call[1] === 'llm usage'
    );
    expect(usageCall).toBeDefined();
    expect(usageCall[0]).toHaveProperty('promptTokens');
    expect(usageCall[0]).toHaveProperty('completionTokens');
    expect(usageCall[0]).toHaveProperty('estimatedCost');
  });

  it('calls summarizeAppResult to compress old tool results', async () => {
    const { summarizeAppResult } = await import('../../src/services/context.js');
    const { streamChat } = await import('../../src/services/llm.js');
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'ok' } }] };
    });

    const msgs = [
      { role: 'user', content: 'play chess' },
      { role: 'tool', content: '{"fen":"start"}', tool_call_id: 'tc-1' },
      { role: 'user', content: 'what now?' },
    ];

    await request(app)
      .post('/api/chat')
      .send({ messages: msgs });

    expect(summarizeAppResult).toHaveBeenCalled();
  });
});
