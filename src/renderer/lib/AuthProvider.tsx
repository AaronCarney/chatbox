import { createContext, useEffect, useState, type ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { firebaseAuth } from './firebase';

interface AuthContextValue {
  user: User | null;
  isLoaded: boolean;
  getToken: () => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const unsub = firebaseAuth.onAuthStateChanged((u: User | null) => {
      setUser(u);
      setIsLoaded(true);
    });
    return unsub;
  }, []);

  const value: AuthContextValue = {
    user,
    isLoaded,
    getToken: async () => (user ? user.getIdToken() : null),
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    },
    signInWithGoogle: async () => {
      await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
    },
    signOut: async () => {
      await fbSignOut(firebaseAuth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
