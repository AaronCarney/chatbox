import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SYSTEM_PROMPT, buildMessages, streamChat } from '../../src/services/llm.js';

// Mock OpenAI module
const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate
      }
    }
  }))
}));

describe('LLM Service', () => {
  describe('SYSTEM_PROMPT', () => {
    it('contains UNTRUSTED reference', () => {
      expect(SYSTEM_PROMPT).toContain('UNTRUSTED');
    });

    it('contains Socratic method reference', () => {
      expect(SYSTEM_PROMPT).toContain('Socratic');
    });

    it('contains teaching/guiding reference', () => {
      expect(SYSTEM_PROMPT).toMatch(/teaching|guiding/i);
    });

    it('identifies as TutorMeAI', () => {
      expect(SYSTEM_PROMPT).toContain('TutorMeAI');
    });
  });

  describe('buildMessages', () => {
    it('prepends system prompt as first message', () => {
      const history = [
        { role: 'user' as const, content: 'What is 2+2?' },
        { role: 'assistant' as const, content: '4' }
      ];

      const messages = buildMessages(history, []);
      expect(messages[0]).toEqual({
        role: 'system',
        content: expect.stringContaining('TutorMeAI')
      });
    });

    it('includes all history after system prompt', () => {
      const history = [
        { role: 'user' as const, content: 'What is 2+2?' },
        { role: 'assistant' as const, content: '4' }
      ];

      const messages = buildMessages(history, []);
      expect(messages.length).toBe(3); // system + 2 history
      expect(messages[1]).toEqual(history[0]);
      expect(messages[2]).toEqual(history[1]);
    });

    it('appends tools list to system prompt when tools provided', () => {
      const history: any = [];
      const tools = ['calculator', 'search'];

      const messages = buildMessages(history, tools);
      const systemMessage = messages[0];

      expect(systemMessage.role).toBe('system');
      expect(systemMessage.content).toContain('calculator');
      expect(systemMessage.content).toContain('search');
    });

    it('does not include tools in system prompt when empty', () => {
      const history: any = [];

      const messages = buildMessages(history, []);
      const systemMessage = messages[0];

      expect(systemMessage.role).toBe('system');
      expect(systemMessage.content).toContain('TutorMeAI');
    });

    it('handles empty history', () => {
      const messages = buildMessages([], []);
      expect(messages.length).toBe(1); // just system
      expect(messages[0].role).toBe('system');
    });
  });

  describe('streamChat', () => {
    beforeEach(() => {
      mockCreate.mockClear();
      mockCreate.mockResolvedValue(
        (async function* () {
          yield { choices: [{ delta: { content: 'test' } }] };
        })()
      );
    });

    it('passes tools to OpenAI API when tools provided', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const tools = [{ type: 'function', function: { name: 'test_tool' } }];

      const gen = streamChat(messages, tools);
      const result = await gen.next();

      // Verify mock was called with tools in params
      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.tools).toEqual(tools);
    });

    it('accepts toolChoice as third parameter and passes to OpenAI API', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const tools = [{ type: 'function', function: { name: 'test_tool' } }];
      const toolChoice = 'test_tool';

      const gen = streamChat(messages, tools, toolChoice);
      const result = await gen.next();

      // Verify mock was called with tool_choice in params
      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.tool_choice).toEqual(toolChoice);
    });

    it('does not include tools or tool_choice when tools array is empty', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      const gen = streamChat(messages, []);
      const result = await gen.next();

      // Verify mock was called without tools
      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.tools).toBeUndefined();
      expect(callArgs.tool_choice).toBeUndefined();
    });
  });
});
