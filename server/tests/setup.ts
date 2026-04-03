import { vi } from 'vitest';

// Mock @clerk/express to pass through without requiring keys in tests
vi.mock('@clerk/express', () => ({
  clerkMiddleware: () => {
    // Return a middleware that passes through without doing anything
    return (req: any, res: any, next: any) => next();
  },
  requireAuth: () => {
    // Return a middleware that passes through without requiring auth
    return (req: any, res: any, next: any) => {
      // Set a mock auth object on the request
      req.auth = { userId: 'test-user-id' };
      next();
    };
  },
  getAuth: (req: any) => {
    return req.auth || { userId: null };
  },
}));
