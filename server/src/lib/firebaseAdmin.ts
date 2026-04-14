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
