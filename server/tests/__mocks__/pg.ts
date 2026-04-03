import { vi } from 'vitest';

export const mockQuery = vi.fn();

export default {
  Pool: vi.fn(() => ({
    query: mockQuery,
  })),
};
