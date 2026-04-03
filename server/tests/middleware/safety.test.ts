import { describe, it, expect } from 'vitest';
import { validateToolResult, wrapWithDelimiters } from '../../src/middleware/safety';

describe('Safety Pipeline', () => {
  describe('validateToolResult', () => {
    it('accepts valid data matching schema', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['status'],
        additionalProperties: false,
      };

      const validData = { status: 'success', message: 'test' };
      const result = validateToolResult(validData, schema);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('rejects data with extra properties when additionalProperties is false', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string' },
        },
        required: ['status'],
        additionalProperties: false,
      };

      const invalidData = { status: 'success', extra: 'field' };
      const result = validateToolResult(invalidData, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('rejects payloads larger than 2048 bytes', () => {
      const schema = {
        type: 'object',
        properties: {
          data: { type: 'string' },
        },
        additionalProperties: false,
      };

      const largeData = { data: 'x'.repeat(3000) };
      const result = validateToolResult(largeData, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toMatch(/exceeds 2048 bytes/);
    });
  });

  describe('wrapWithDelimiters', () => {
    it('wraps data in salted tags containing UNTRUSTED', () => {
      const appId = 'test-app';
      const data = { status: 'success' };

      const wrapped = wrapWithDelimiters(appId, data);

      expect(wrapped).toContain('UNTRUSTED');
      expect(wrapped).toContain(`tool="${appId}"`);
      expect(wrapped).toContain('<tool-result-');
      expect(wrapped).toContain('</tool-result-');
      expect(wrapped).toContain(JSON.stringify(data));
    });

    it('generates a different salt on each call', () => {
      const appId = 'test-app';
      const data = { status: 'success' };

      const wrapped1 = wrapWithDelimiters(appId, data);
      const wrapped2 = wrapWithDelimiters(appId, data);

      expect(wrapped1).not.toEqual(wrapped2);

      // Extract the salt from the opening and closing tags
      const saltMatch1 = wrapped1.match(/<tool-result-([a-f0-9]+)/);
      const saltMatch2 = wrapped2.match(/<tool-result-([a-f0-9]+)/);

      expect(saltMatch1).toBeDefined();
      expect(saltMatch2).toBeDefined();
      expect(saltMatch1![1]).not.toEqual(saltMatch2![1]);
    });
  });
});
