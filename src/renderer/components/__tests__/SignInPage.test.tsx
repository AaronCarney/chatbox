// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignInPage } from '../SignInPage';

const signIn = vi.fn();
const signInWithGoogle = vi.fn();

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ signIn, signInWithGoogle, isLoaded: true, isSignedIn: false }),
}));

describe('SignInPage', () => {
  it('calls signIn on email/password form submit', async () => {
    render(<SignInPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(signIn).toHaveBeenCalledWith('a@b.c', 'pw');
  });
  it('calls signInWithGoogle on google button click', async () => {
    render(<SignInPage />);
    fireEvent.click(screen.getByRole('button', { name: /google/i }));
    expect(signInWithGoogle).toHaveBeenCalled();
  });
});
