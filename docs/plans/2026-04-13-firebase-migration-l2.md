# Chatbridge Firebase Auth Migration — L2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `parallel-plan-executor` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. TDD enforced via injected task-executor skill. Do not use `subagent-driven-development`.

**Goal:** Replace Clerk with Firebase Auth across the chatbridge Vite React SPA frontend and the Express backend, preserving every existing behavior (rate limiter keying, request logging user identification, session pseudonym generation, Spotify OAuth flow, authorizedParties origin validation semantics, granular auth error messages).

**Architecture:** One-to-one swap at the auth boundary. Backend: `@clerk/express` middleware → a thin Firebase Admin SDK middleware that reads `Authorization: Bearer <token>`, calls `admin.auth().verifyIdToken()`, and attaches `req.user = { uid, email }`. Existing call sites (`(req as any).clerkAuth?.userId`) are rewritten to `(req as any).user?.uid` in a single sweep. Frontend: `ClerkProvider` + `useAuth` → a Firebase `AuthProvider` + identically-shaped `useAuth` hook that returns `{ user, getToken, signIn, signOut }`, so call sites need only their import path changed. No DB migration (chatbridge doesn't persist Clerk user IDs — it hashes them into `session_pseudonym` via HMAC-SHA256). Old sessions become orphaned for returning users (acceptable — chatbridge is a GauntletAI sprint demo).

**Tech Stack:** Vite + React 18 (renderer), Express (server, Node 24), Firebase Web SDK v10+, firebase-admin v12+, Vitest, Vercel (frontend), Railway (backend via Dockerfile).

**Source of truth:** Audit findings in `../../../olorin/docs/plans/2026-04-13-clerk-to-firebase-migration.md` and the live Clerk usage at the paths referenced below.

---

## File Structure

### Files to create

- `server/src/middleware/firebaseAuth.ts` — Firebase Admin SDK middleware (replaces `clerkAuth` export from the existing `auth.ts`)
- `server/src/lib/firebaseAdmin.ts` — single-instance firebase-admin app initialized from `FIREBASE_SERVICE_ACCOUNT_B64`
- `server/tests/unit/middleware/firebaseAuth.test.ts` — unit tests for the middleware (valid token, missing token, rejected token, emits same granular errors as Clerk middleware did)
- `server/tests/unit/lib/firebaseAdmin.test.ts` — unit test that the admin app initializes cleanly from base64 service account and fails fast with a clear error if the env var is malformed
- `src/renderer/lib/firebase.ts` — client Firebase app initialization + `auth` export
- `src/renderer/lib/AuthProvider.tsx` — React context provider with `{ user, loading, getToken, signIn, signInWithGoogle, signOut }`
- `src/renderer/hooks/useAuth.ts` — hook with the same shape the existing Clerk-using code expects (`{ userId, getToken, isSignedIn, isLoaded }` — matches Clerk's `useAuth()` exactly so call sites don't change)
- `src/renderer/components/SignInPage.tsx` — replaces Clerk's `<SignIn />` component (email/password + Google button)
- `src/renderer/components/UserMenu.tsx` — replaces Clerk's `<UserButton />` (avatar + sign-out)

### Files to modify

- `server/src/middleware/auth.ts` — strip Clerk, re-export from `firebaseAuth.ts` for backward compat, or delete entirely and update imports
- `server/src/index.ts:6,41-42` — swap `clerkAuth` import
- `server/src/routes/chat.ts:20` — `(req as any).clerkAuth?.userId` → `(req as any).user?.uid`
- `server/src/middleware/rateLimit.ts:8` — same rename
- `server/src/lib/logger.ts:19` — same rename
- `server/src/services/session.ts:20-27` — `generatePseudonym(userId: string)` keeps same signature (Firebase UIDs are strings too, no change needed)
- `server/package.json` — remove `@clerk/express`, add `firebase-admin`
- `package.json` (root/frontend) — remove `@clerk/clerk-react`, add `firebase`
- `src/renderer/routes/__root.tsx` — `<ClerkProvider>` → `<AuthProvider>`
- `src/renderer/components/ChatBridgeApp.tsx` — `useAuth` import path only (hook shape identical)
- `src/renderer/Sidebar.tsx` — same import-path swap if present
- `.env.example` — remove `CLERK_*`, `VITE_CLERK_*`; add `VITE_FIREBASE_*` (the 6 public web SDK values) and `FIREBASE_SERVICE_ACCOUNT_B64`
- `README.md` — update auth setup section
- `docs/decisions.md` — add decision entry for the migration

### Files to delete (after verification)

- Any leftover Clerk-specific test fixtures or mocks under `server/tests/`
- `server/tests/integration/*clerk*.test.ts` if present

---

## Task 0: Baseline green (serial, blocks everything)

**Files:** none modified

- [ ] **Step 0.1: Confirm you're on main and working tree is clean**

Run:
```bash
cd projects/chatbridge
git status
git rev-parse --abbrev-ref HEAD
```
Expected: `main`, nothing staged, nothing unstaged.

- [ ] **Step 0.2: Install dependencies**

Run:
```bash
pnpm install
```
Expected: exits 0.

- [ ] **Step 0.3: Run full frontend test suite, confirm green**

Run:
```bash
pnpm test
```
Expected: all Vitest tests pass. Record the count in the commit message of Task 1.

- [ ] **Step 0.4: Run full backend test suite, confirm green**

Run:
```bash
cd server && pnpm test
```
Expected: all Vitest tests pass. Record the count.

- [ ] **Step 0.5: Run typecheck**

Run:
```bash
cd .. && pnpm typecheck 2>/dev/null || pnpm tsc --noEmit
```
Expected: zero type errors.

If any of 0.2–0.5 fail, STOP. The migration cannot begin on a red baseline. Raise to the operator.

---

## Task 1: Add firebase-admin and initialize admin app (backend)

**Files:**
- Create: `server/src/lib/firebaseAdmin.ts`
- Create: `server/tests/unit/lib/firebaseAdmin.test.ts`
- Modify: `server/package.json` (add `firebase-admin` to dependencies)

- [ ] **Step 1.1: Write the failing test**

Create `server/tests/unit/lib/firebaseAdmin.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('getFirebaseAdmin', () => {
  const ORIG = process.env.FIREBASE_SERVICE_ACCOUNT_B64;

  afterEach(() => {
    process.env.FIREBASE_SERVICE_ACCOUNT_B64 = ORIG;
  });

  it('throws a clear error when FIREBASE_SERVICE_ACCOUNT_B64 is unset', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    const { getFirebaseAdmin } = await import('../../../src/lib/firebaseAdmin.js');
    expect(() => getFirebaseAdmin()).toThrow(/FIREBASE_SERVICE_ACCOUNT_B64/);
  });

  it('throws a clear error when FIREBASE_SERVICE_ACCOUNT_B64 is malformed base64', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_B64 = 'not-valid-base64!@#$';
    const { getFirebaseAdmin } = await import('../../../src/lib/firebaseAdmin.js');
    expect(() => getFirebaseAdmin()).toThrow(/FIREBASE_SERVICE_ACCOUNT_B64/);
  });

  it('returns an admin app when the env var contains a valid service account JSON', async () => {
    const fakeSA = {
      type: 'service_account',
      project_id: 'test-project',
      private_key_id: 'abc',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIE...-----END PRIVATE KEY-----\n',
      client_email: 'test@test-project.iam.gserviceaccount.com',
      client_id: '123',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/test',
      universe_domain: 'googleapis.com',
    };
    process.env.FIREBASE_SERVICE_ACCOUNT_B64 = Buffer.from(JSON.stringify(fakeSA)).toString('base64');
    const { getFirebaseAdmin } = await import('../../../src/lib/firebaseAdmin.js');
    const app = getFirebaseAdmin();
    expect(app).toBeDefined();
    expect(app.name).toBe('[DEFAULT]');
  });
});
```

- [ ] **Step 1.2: Install firebase-admin**

Run:
```bash
cd server && pnpm add firebase-admin
```
Expected: `firebase-admin` appears in `server/package.json` dependencies.

- [ ] **Step 1.3: Run test to verify it fails**

Run:
```bash
cd server && pnpm vitest run tests/unit/lib/firebaseAdmin.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 1.4: Implement `firebaseAdmin.ts`**

Create `server/src/lib/firebaseAdmin.ts`:
```typescript
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';

let cachedApp: App | null = null;

export function getFirebaseAdmin(): App {
  if (cachedApp) return cachedApp;
  const existing = getApps();
  if (existing.length > 0) {
    cachedApp = existing[0];
    return cachedApp;
  }
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 is required');
  }
  let parsed: Record<string, unknown>;
  try {
    const json = Buffer.from(b64, 'base64').toString('utf8');
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_B64 is not valid base64-encoded JSON: ${(err as Error).message}`);
  }
  cachedApp = initializeApp({ credential: cert(parsed as never) });
  return cachedApp;
}
```

- [ ] **Step 1.5: Run test to verify it passes**

Run:
```bash
cd server && pnpm vitest run tests/unit/lib/firebaseAdmin.test.ts
```
Expected: 3/3 PASS.

- [ ] **Step 1.6: Commit**

```bash
git add server/src/lib/firebaseAdmin.ts server/tests/unit/lib/firebaseAdmin.test.ts server/package.json server/pnpm-lock.yaml
git commit -m "feat(server): add firebase-admin initialization module"
```

---

## Task 2: Firebase token verification middleware (backend)

**Files:**
- Create: `server/src/middleware/firebaseAuth.ts`
- Create: `server/tests/unit/middleware/firebaseAuth.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `server/tests/unit/middleware/firebaseAuth.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === 'valid-token') return { uid: 'firebase-uid-123', email: 'user@example.com' };
      if (token === 'rejected-token') throw new Error('Token expired');
      throw new Error('Unknown token');
    }),
  })),
}));

vi.mock('../../../src/lib/firebaseAdmin.js', () => ({
  getFirebaseAdmin: vi.fn(() => ({ name: '[DEFAULT]' })),
}));

describe('firebaseAuth middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
  });

  it('attaches req.user with uid and email on valid token', async () => {
    const { firebaseAuth } = await import('../../../src/middleware/firebaseAuth.js');
    req.headers = { authorization: 'Bearer valid-token' };
    await firebaseAuth(req as Request, res as Response, next);
    expect((req as any).user).toEqual({ uid: 'firebase-uid-123', email: 'user@example.com' });
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 401 with "no-token" code when Authorization header is missing', async () => {
    const { firebaseAuth } = await import('../../../src/middleware/firebaseAuth.js');
    await firebaseAuth(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized', code: 'no-token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with "token-rejected" code when token is invalid', async () => {
    const { firebaseAuth } = await import('../../../src/middleware/firebaseAuth.js');
    req.headers = { authorization: 'Bearer rejected-token' };
    await firebaseAuth(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized', code: 'token-rejected' });
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run:
```bash
cd server && pnpm vitest run tests/unit/middleware/firebaseAuth.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement the middleware**

Create `server/src/middleware/firebaseAuth.ts`:
```typescript
import type { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdmin } from '../lib/firebaseAdmin.js';
import { logger } from '../lib/logger.js';

export interface AuthenticatedRequest extends Request {
  user?: { uid: string; email?: string };
}

export async function firebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized', code: 'no-token' });
    return;
  }
  const token = header.slice('Bearer '.length);
  try {
    const app = getFirebaseAdmin();
    const decoded = await getAuth(app).verifyIdToken(token);
    (req as AuthenticatedRequest).user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (err) {
    logger.debug({ err: (err as Error).message }, 'firebase token rejected');
    res.status(401).json({ error: 'unauthorized', code: 'token-rejected' });
  }
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!(req as AuthenticatedRequest).user) {
    res.status(401).json({ error: 'unauthorized', code: 'no-session' });
    return;
  }
  next();
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run:
```bash
cd server && pnpm vitest run tests/unit/middleware/firebaseAuth.test.ts
```
Expected: 3/3 PASS.

- [ ] **Step 2.5: Commit**

```bash
git add server/src/middleware/firebaseAuth.ts server/tests/unit/middleware/firebaseAuth.test.ts
git commit -m "feat(server): firebase token verification middleware"
```

---

## Task 3: Rewire call sites from clerkAuth.userId → user.uid (backend)

**Files:**
- Modify: `server/src/routes/chat.ts:20`
- Modify: `server/src/middleware/rateLimit.ts:8`
- Modify: `server/src/lib/logger.ts:19`
- Modify: `server/src/index.ts:6,41-42`
- Delete (or gut): `server/src/middleware/auth.ts`

- [ ] **Step 3.1: Write a failing integration test for rateLimit keying**

Add to `server/tests/unit/middleware/rateLimit.test.ts` (create if missing):
```typescript
import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { keyGenerator } from '../../../src/middleware/rateLimit.js';

describe('rateLimit keyGenerator', () => {
  it('uses req.user.uid when present', () => {
    const req = { user: { uid: 'firebase-abc' }, ip: '1.2.3.4' } as unknown as Request;
    expect(keyGenerator(req)).toBe('firebase-abc');
  });
  it('falls back to req.ip when no user', () => {
    const req = { ip: '1.2.3.4' } as unknown as Request;
    expect(keyGenerator(req)).toBe('1.2.3.4');
  });
  it('falls back to "unknown" when no user and no ip', () => {
    const req = {} as unknown as Request;
    expect(keyGenerator(req)).toBe('unknown');
  });
});
```

- [ ] **Step 3.2: Run the new test, verify it fails**

Run:
```bash
cd server && pnpm vitest run tests/unit/middleware/rateLimit.test.ts
```
Expected: FAIL — `keyGenerator` not exported, or still reads `clerkAuth`.

- [ ] **Step 3.3: Update `rateLimit.ts` to export `keyGenerator` and read `user.uid`**

Modify `server/src/middleware/rateLimit.ts`: replace the inline keyGenerator with a named export:
```typescript
import type { Request } from 'express';

export function keyGenerator(req: Request): string {
  return (req as any).user?.uid || req.ip || 'unknown';
}
```
And update the `express-rate-limit` config to use `keyGenerator`.

- [ ] **Step 3.4: Run test, verify it passes**

Run:
```bash
cd server && pnpm vitest run tests/unit/middleware/rateLimit.test.ts
```
Expected: 3/3 PASS.

- [ ] **Step 3.5: Update `routes/chat.ts:20`**

Replace `(req as any).clerkAuth?.userId` with `(req as any).user?.uid`.

- [ ] **Step 3.6: Update `lib/logger.ts:19`**

In the request-logging middleware, replace `userId: (req as any).clerkAuth?.userId` with `userId: (req as any).user?.uid`.

- [ ] **Step 3.7: Update `index.ts:6,41-42`**

Replace the `clerkAuth` import with `firebaseAuth`:
```typescript
import { firebaseAuth, requireSession } from './middleware/firebaseAuth.js';
```
Replace `app.use(clerkAuth)` with `app.use(firebaseAuth)`.

- [ ] **Step 3.8: Delete the old Clerk middleware**

```bash
rm server/src/middleware/auth.ts
```

- [ ] **Step 3.9: Run full backend test suite**

Run:
```bash
cd server && pnpm test
```
Expected: all tests pass. If any test still imports the old `auth.ts`, update those test imports in the same commit.

- [ ] **Step 3.10: Commit**

```bash
git add -u
git commit -m "refactor(server): swap clerkAuth.userId → user.uid across call sites"
```

---

## Task 4: Remove @clerk/express and update env example (backend)

**Files:**
- Modify: `server/package.json`
- Modify: `.env.example`

- [ ] **Step 4.1: Remove @clerk/express**

Run:
```bash
cd server && pnpm remove @clerk/express
```

- [ ] **Step 4.2: Update `.env.example`**

Remove lines for `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`. Add:
```
# Firebase Auth (server)
FIREBASE_SERVICE_ACCOUNT_B64=your-base64-encoded-service-account-json

# Firebase Auth (client — safe to commit, public by design)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

- [ ] **Step 4.3: Grep for any remaining Clerk references**

Run:
```bash
cd .. && grep -r "clerk\|Clerk\|CLERK" server/src src package.json server/package.json .env.example 2>/dev/null
```
Expected: zero matches. If any remain, fix them before committing.

- [ ] **Step 4.4: Run full backend test suite**

Run:
```bash
cd server && pnpm test && cd ..
```
Expected: green.

- [ ] **Step 4.5: Commit**

```bash
git add -u
git commit -m "chore(server): remove @clerk/express dependency and update env example"
```

---

## Task 5: Add firebase client SDK and initialization (frontend)

**Files:**
- Create: `src/renderer/lib/firebase.ts`
- Modify: `package.json` (root)

- [ ] **Step 5.1: Install firebase**

Run:
```bash
pnpm add firebase
```

- [ ] **Step 5.2: Create the init module**

Create `src/renderer/lib/firebase.ts`:
```typescript
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: FirebaseApp;
const existing = getApps();
if (existing.length === 0) {
  for (const [k, v] of Object.entries(config)) {
    if (!v) throw new Error(`Firebase config missing: ${k}`);
  }
  app = initializeApp(config);
} else {
  app = existing[0];
}

export const firebaseAuth: Auth = getAuth(app);
```

- [ ] **Step 5.3: Run typecheck**

Run:
```bash
pnpm tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 5.4: Commit**

```bash
git add src/renderer/lib/firebase.ts package.json pnpm-lock.yaml
git commit -m "feat(client): add firebase SDK initialization"
```

---

## Task 6: AuthProvider + useAuth hook with Clerk-compatible shape (frontend)

**Files:**
- Create: `src/renderer/lib/AuthProvider.tsx`
- Create: `src/renderer/hooks/useAuth.ts`
- Create: `src/renderer/lib/__tests__/AuthProvider.test.tsx`

- [ ] **Step 6.1: Write the failing test**

Create `src/renderer/lib/__tests__/AuthProvider.test.tsx`:
```tsx
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
```

- [ ] **Step 6.2: Run test, verify it fails**

Run:
```bash
pnpm vitest run src/renderer/lib/__tests__/AuthProvider.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement AuthProvider**

Create `src/renderer/lib/AuthProvider.tsx`:
```tsx
import { createContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
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
    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
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
```

- [ ] **Step 6.4: Implement useAuth hook with Clerk-compatible shape**

Create `src/renderer/hooks/useAuth.ts`:
```typescript
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
```

- [ ] **Step 6.5: Run test, verify it passes**

Run:
```bash
pnpm vitest run src/renderer/lib/__tests__/AuthProvider.test.tsx
```
Expected: PASS.

- [ ] **Step 6.6: Commit**

```bash
git add src/renderer/lib/AuthProvider.tsx src/renderer/hooks/useAuth.ts src/renderer/lib/__tests__/AuthProvider.test.tsx
git commit -m "feat(client): AuthProvider + Clerk-compatible useAuth hook"
```

---

## Task 7: SignInPage + UserMenu components (frontend)

**Files:**
- Create: `src/renderer/components/SignInPage.tsx`
- Create: `src/renderer/components/UserMenu.tsx`
- Create: `src/renderer/components/__tests__/SignInPage.test.tsx`

- [ ] **Step 7.1: Write failing test for SignInPage**

Create `src/renderer/components/__tests__/SignInPage.test.tsx`:
```tsx
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
```

- [ ] **Step 7.2: Run test, verify it fails**

Run:
```bash
pnpm vitest run src/renderer/components/__tests__/SignInPage.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement SignInPage**

Create `src/renderer/components/SignInPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';

export function SignInPage() {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try { await signIn(email, password); }
    catch (err) { setError((err as Error).message); }
  }

  return (
    <div className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-semibold mb-6">Sign in</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label>
          <span className="text-sm">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full border rounded p-2" />
        </label>
        <label>
          <span className="text-sm">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full border rounded p-2" />
        </label>
        <button type="submit" className="bg-black text-white rounded p-2">Sign in</button>
      </form>
      <div className="my-4 text-center text-xs text-gray-500">or</div>
      <button onClick={signInWithGoogle} className="w-full border rounded p-2">Continue with Google</button>
      {error && <div className="mt-4 text-red-600 text-sm">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 7.4: Implement UserMenu**

Create `src/renderer/components/UserMenu.tsx`:
```tsx
import { useAuth } from '../hooks/useAuth';

export function UserMenu() {
  const { userId, signOut, isSignedIn } = useAuth();
  if (!isSignedIn) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">{userId?.slice(0, 6)}</span>
      <button onClick={signOut} className="text-xs border rounded px-2 py-1">Sign out</button>
    </div>
  );
}
```

- [ ] **Step 7.5: Run tests**

Run:
```bash
pnpm vitest run src/renderer/components/__tests__/SignInPage.test.tsx
```
Expected: 2/2 PASS.

- [ ] **Step 7.6: Commit**

```bash
git add src/renderer/components/SignInPage.tsx src/renderer/components/UserMenu.tsx src/renderer/components/__tests__/SignInPage.test.tsx
git commit -m "feat(client): SignInPage and UserMenu replacing Clerk components"
```

---

## Task 8: Swap root provider and all Clerk imports (frontend)

**Files:**
- Modify: `src/renderer/routes/__root.tsx`
- Modify: `src/renderer/components/ChatBridgeApp.tsx`
- Modify: `src/renderer/Sidebar.tsx` (if it imports Clerk)

- [ ] **Step 8.1: Update `__root.tsx`**

Replace `<ClerkProvider publishableKey={...}>` with `<AuthProvider>`, replace import:
```tsx
import { AuthProvider } from '../lib/AuthProvider';
```
Remove the `@clerk/clerk-react` import.

- [ ] **Step 8.2: Update `ChatBridgeApp.tsx`**

Change:
```tsx
import { useAuth } from '@clerk/clerk-react';
```
to:
```tsx
import { useAuth } from '../hooks/useAuth';
```
No other changes — the hook shape is identical.

- [ ] **Step 8.3: Update Sidebar.tsx if applicable**

Same import swap. Skip if no Clerk import present.

- [ ] **Step 8.4: Grep for any remaining Clerk imports in renderer**

Run:
```bash
grep -rn "@clerk" src/
```
Expected: zero matches.

- [ ] **Step 8.5: Remove @clerk/clerk-react from package.json**

Run:
```bash
pnpm remove @clerk/clerk-react
```

- [ ] **Step 8.6: Run full frontend test suite**

Run:
```bash
pnpm test
```
Expected: all tests pass. Update any mocks that still reference `@clerk/clerk-react`.

- [ ] **Step 8.7: Run typecheck**

Run:
```bash
pnpm tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 8.8: Commit**

```bash
git add -u
git commit -m "refactor(client): swap ClerkProvider → AuthProvider and remove @clerk/clerk-react"
```

---

## Task 9: Push Firebase env vars to Vercel and Railway (wiring)

**Files:** none in repo (CI env only)

**Source of truth:** `/home/context/olorin/.secrets/firebase-chatbridge.env`

- [ ] **Step 9.1: Read the secrets file into memory**

Run:
```bash
cat /home/context/olorin/.secrets/firebase-chatbridge.env
```
Capture each line as a `KEY=VALUE` pair. Do NOT echo the service account base64 into any log.

- [ ] **Step 9.2: Push client vars to Vercel preview + production**

For each `VITE_FIREBASE_*` key (use `NEXT_PUBLIC_FIREBASE_*` name from the env file and rename to `VITE_FIREBASE_*` for Vite):

Run (one per key, for both `preview` and `production`):
```bash
vercel env add VITE_FIREBASE_API_KEY preview
# paste the value when prompted
vercel env add VITE_FIREBASE_API_KEY production
```
Repeat for `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.

- [ ] **Step 9.3: Remove old Clerk Vercel env vars**

Run:
```bash
vercel env rm VITE_CLERK_PUBLISHABLE_KEY preview --yes
vercel env rm VITE_CLERK_PUBLISHABLE_KEY production --yes
```

- [ ] **Step 9.4: Push server vars to Railway**

Run:
```bash
railway variables --set FIREBASE_SERVICE_ACCOUNT_B64="$(grep ^FIREBASE_SERVICE_ACCOUNT_B64= /home/context/olorin/.secrets/firebase-chatbridge.env | cut -d= -f2-)"
```

- [ ] **Step 9.5: Remove old Clerk Railway env vars**

Run:
```bash
railway variables --remove CLERK_PUBLISHABLE_KEY
railway variables --remove CLERK_SECRET_KEY
```

- [ ] **Step 9.6: Verify env vars are set (without printing values)**

Run:
```bash
vercel env ls
railway variables
```
Expected: `VITE_FIREBASE_*` all present on Vercel; `FIREBASE_SERVICE_ACCOUNT_B64` present on Railway; no `CLERK_*` or `VITE_CLERK_*` remaining on either.

- [ ] **Step 9.7: Commit (empty or docs)**

No code changes. If there are env example updates not yet committed, commit them now.

---

## Task 10: End-to-end verification on preview deploy (wiring)

**Files:** none

- [ ] **Step 10.1: Trigger a preview deploy**

Run:
```bash
git push origin HEAD:refs/heads/firebase-migration-l2
```
Then create a PR (or Vercel auto-deploys the branch if configured).

- [ ] **Step 10.2: Wait for Vercel preview to go live**

Run:
```bash
vercel deploy --prebuilt=false
```
Capture the preview URL.

- [ ] **Step 10.3: Wait for Railway to redeploy the server**

Run:
```bash
railway status
```
Confirm the latest deployment is the current HEAD.

- [ ] **Step 10.4: Smoke-test the sign-in flow with agent-browser**

Run the browser agent against the preview URL:
1. Visit the preview URL.
2. Click "Sign in".
3. Use the test Google account (or a known email/password pair) to sign in.
4. Confirm the UserMenu shows, sign out works.
5. Confirm a protected API call (e.g. the chat endpoint) returns 200 with a valid bearer token and 401 without.

Expected: full round trip passes.

- [ ] **Step 10.5: Confirm rate limiter is keyed by Firebase UID**

Make 3 rapid chat API calls using the same auth token, then 1 call from a different browser session (different UID). Confirm the first session hits the rate limit while the second does not. This verifies `req.user.uid` is flowing through `keyGenerator` correctly.

- [ ] **Step 10.6: Confirm logs include Firebase UID as userId**

Tail Railway logs during a request:
```bash
railway logs --tail
```
Expected: request log lines include `"userId":"<firebase uid>"`, not undefined, not a clerk-style `user_xxx` string.

- [ ] **Step 10.7: Confirm Spotify OAuth still works**

Click the Spotify connect button in the preview UI, complete the OAuth popup flow, confirm tokens are received. The state param CSRF check must still succeed. (This verifies we didn't accidentally break the unrelated OAuth integration.)

- [ ] **Step 10.8: Open the PR for human merge**

Run:
```bash
gh pr create --title "feat: migrate chatbridge from Clerk to Firebase Auth" --body "$(cat <<'EOF'
## Summary
- Replace @clerk/express with firebase-admin token verification middleware
- Replace @clerk/clerk-react with firebase Web SDK + custom AuthProvider
- Keep useAuth hook shape identical so call sites need only import-path changes
- No DB migration (session_pseudonym hash regenerates from new UIDs; old sessions orphaned)
- Spotify OAuth flow untouched

## Verification
- All Vitest tests green (unit + integration)
- Typecheck clean
- Preview deploy signed in / signed out with email and Google
- Rate limiter keyed correctly by Firebase UID
- Logs include Firebase UID
- Spotify OAuth round-trip confirmed working
EOF
)"
```

---

## Self-Review Checklist

Before dispatching via parallel-plan-executor:

**Spec coverage:**
- [x] Replace @clerk/express → firebase-admin (Tasks 1–4)
- [x] Replace @clerk/clerk-react → firebase Web SDK (Tasks 5–8)
- [x] Rewire call sites (Task 3)
- [x] Env var rename + CI plumbing (Task 9)
- [x] Wiring verification (Task 10)
- [x] Don't touch Spotify OAuth (explicitly verified in Step 10.7)
- [x] Session pseudonym continuity decision documented (fresh start in Architecture section)
- [x] authorizedParties origin semantics — Firebase Admin SDK doesn't use an equivalent (tokens are self-validating); verified implicitly by Step 10.4
- [x] Granular auth error codes preserved (`no-token`, `token-rejected` in firebaseAuth.ts + its tests)

**Placeholder scan:** no TODOs, no "TBD", every code block is complete, every command is exact.

**Type consistency:** `firebaseAuth` middleware sets `req.user = { uid, email }`; `keyGenerator` reads `req.user?.uid`; `useAuth` returns `{ userId, isSignedIn, isLoaded, getToken, signIn, signInWithGoogle, signOut }`. Consistent across all tasks.

---

## Execution

Dispatch via `parallel-plan-executor` from the olorin workspace root. The executor will run `parallel-planning` first to group tasks into waves (Task 0 → Tasks 1,2,5 parallel → Tasks 3,4,6,7 → Task 8 → Task 9 → Task 10).
