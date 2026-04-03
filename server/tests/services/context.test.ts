import { describe, it, expect } from 'vitest';
import { trimHistory, summarizeAppResult } from '../../src/services/context.js';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

describe('Context Manager', () => {
  describe('trimHistory', () => {
    it('returns messages as-is when under maxVerbatim limit', () => {
      const messages: Message[] = [
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: 'The answer is 4.' }
      ];
      const result = trimHistory(messages, 20);
      expect(result).toEqual(messages);
    });

    it('returns messages as-is when exactly at maxVerbatim limit', () => {
      const messages: Message[] = Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as const,
        content: `Message ${i}`
      }));
      const result = trimHistory(messages, 20);
      expect(result).toEqual(messages);
    });

    it('keeps last N messages verbatim and prepends summary when over limit', () => {
      const messages: Message[] = Array.from({ length: 30 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as const,
        content: `Message ${i}`
      }));
      const result = trimHistory(messages, 20);

      // Should have 21 items: 1 summary + 20 verbatim
      expect(result.length).toBe(21);

      // First message should be a system message with context summary
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('[Context summary:');
      expect(result[0].content).toContain('prior discussion covered:');

      // Remaining messages should be the last 20 verbatim
      const verbatim = result.slice(1);
      expect(verbatim).toEqual(messages.slice(-20));
    });

    it('extracts key content from older messages for summary', () => {
      const messages: Message[] = [
        { role: 'user', content: 'How does photosynthesis work?' },
        { role: 'assistant', content: 'Photosynthesis converts light into chemical energy.' },
        { role: 'user', content: 'What about the Calvin cycle?' },
        ...Array.from({ length: 25 }, (_, i) => ({
          role: (i % 2 === 0 ? 'user' : 'assistant') as const,
          content: `Filler message ${i}`
        }))
      ];
      const result = trimHistory(messages, 20);

      // Summary should mention first messages (first 50 chars of older messages)
      const summary = result[0].content;
      expect(summary).toContain('How does photosynthesis work');
      expect(summary).toContain('Photosynthesis converts light');
      expect(summary).toContain('What about the Calvin cycle');
    });

    it('limits summary to at most 3 older messages', () => {
      const messages: Message[] = Array.from({ length: 40 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as const,
        content: `Message ${i}`
      }));
      const result = trimHistory(messages, 20);

      const summary = result[0].content;
      // Count occurrences of "Message" in summary (should be max 3)
      const matches = summary.match(/Message \d+/g) || [];
      expect(matches.length).toBeLessThanOrEqual(3);
    });
  });

  describe('summarizeAppResult', () => {
    const testData = {
      status: 'success',
      userId: 'user123',
      appName: 'MyApp',
      result: 'Operation completed',
      timestamp: '2026-04-02T10:00:00Z'
    };

    it('returns full JSON for turnsSince 0-2, truncated to 1500 chars', () => {
      const json = JSON.stringify(testData);
      const result0 = summarizeAppResult(testData, 0);
      const result1 = summarizeAppResult(testData, 1);
      const result2 = summarizeAppResult(testData, 2);

      expect(result0).toBe(json.slice(0, 1500));
      expect(result1).toBe(json.slice(0, 1500));
      expect(result2).toBe(json.slice(0, 1500));
    });

    it('returns full JSON even with large payloads, truncated to 1500 chars for turns 0-2', () => {
      const largeData = {
        ...testData,
        items: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: 'A very long description that contains lots of text' + '!'.repeat(50)
        }))
      };
      const result = summarizeAppResult(largeData, 1);
      expect(result.length).toBeLessThanOrEqual(1500);
      expect(result).toBe(JSON.stringify(largeData).slice(0, 1500));
    });

    it('returns short key-value summary for turnsSince 3-5', () => {
      const result3 = summarizeAppResult(testData, 3);
      const result4 = summarizeAppResult(testData, 4);
      const result5 = summarizeAppResult(testData, 5);

      // All should be the same format for 3-5
      expect(result3).toBe(result4);
      expect(result4).toBe(result5);

      // Should be a short summary with key values
      expect(result3).toContain('[App result summary:');
      expect(result3).toContain('status:');
      expect(result3).toContain('success');
    });

    it('extracts first 5 keys for 3-5 range summary', () => {
      const data = {
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
        key4: 'value4',
        key5: 'value5',
        key6: 'value6',
        key7: 'value7'
      };
      const result = summarizeAppResult(data, 3);

      // Should contain first 5 keys
      expect(result).toContain('key1');
      expect(result).toContain('key2');
      expect(result).toContain('key3');
      expect(result).toContain('key4');
      expect(result).toContain('key5');

      // Should not contain key6 or key7
      expect(result).not.toContain('key6');
      expect(result).not.toContain('key7');
    });

    it('returns empty string for turnsSince >= 6', () => {
      const result6 = summarizeAppResult(testData, 6);
      const result7 = summarizeAppResult(testData, 7);
      const result100 = summarizeAppResult(testData, 100);

      expect(result6).toBe('');
      expect(result7).toBe('');
      expect(result100).toBe('');
    });

    it('handles empty objects', () => {
      const result = summarizeAppResult({}, 3);
      expect(result).toBe('[App result summary: ]');
    });

    it('handles objects with non-string values correctly', () => {
      const data = {
        count: 42,
        active: true,
        items: [1, 2, 3],
        nested: { key: 'value' }
      };
      const result = summarizeAppResult(data, 4);
      expect(result).toContain('count');
      expect(result).toContain('active');
    });
  });
});
