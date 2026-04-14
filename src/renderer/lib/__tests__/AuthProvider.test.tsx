// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../AuthProvider';
import { useAuth } from '../../hooks/useAuth';

vi.mock('../firebase', () => ({
  firebaseAuth: {
    onAuthStateChanged: vi.fn((cb: (user: unknown) => void) => {
      setTimeout(() => cb({ uid: 'u1', email: 'e@x.com', getIdToken: async () => 'tok' }), 0);
      return () => {};
    }),
  },
}));

function Probe() {
  const { userId, isSignedIn, isLoaded } = useAuth();
  return <div data-testid="probe">{isLoaded ? `${isSignedIn}:${userId}` : 'loading'}</div>;
}

describe('AuthProvider + useAuth', () => {
  it('exposes userId, isSignedIn, isLoaded matching Clerk hook shape', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId('probe').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('true:u1'));
  });
});
