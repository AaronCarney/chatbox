import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, buildMessages } from '../../src/services/llm.js';

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
});
