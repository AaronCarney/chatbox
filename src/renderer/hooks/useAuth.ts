import { useContext } from 'react';
import { AuthContext } from '../lib/AuthProvider';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return {
    userId: ctx.user?.uid ?? null,
    isSignedIn: ctx.user !== null,
    isLoaded: ctx.isLoaded,
    getToken: ctx.getToken,
    signIn: ctx.signIn,
    signInWithGoogle: ctx.signInWithGoogle,
    signOut: ctx.signOut,
  };
}
