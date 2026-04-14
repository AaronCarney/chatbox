import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('getFirebaseAdmin', () => {
  const ORIG = process.env.FIREBASE_SERVICE_ACCOUNT_B64;

  beforeEach(() => {
    vi.resetModules();
  });

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
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCbQflxueiI1kGW\nZDAksbxXD4ozxQ36bbZU0/V9ukgIULCulyQ0WEF3mGOWGmSOWI5wkwHNhl4MesQK\nTKht5N2L1jwXfCpT22nksG8U7HuYx8Qmv7Q0sf4GwY6qT6Ul50GX1JA9dX6/gTzA\nVBHwBWkrm1hdAO3obu0d+pBstR+owA1UaTmUvp9r3oCz3EajqYEE41cGM2cue6PU\n2/sk4RP/1NlXoVgoPPZM1GB8cJppUqwGt/W+HgNBtQ/MQXxvwSI7z94E0YmVmXcQ\nQBlSkEhcwu7SfCJSTF0NH7EvJlTPvSYYhGMPPAe+pWNMdTfGvkC+fcTa5c/R8Ba4\nCgKjZbY/AgMBAAECggEAN7hjTkoC5w1CJ7fYQWsaZYJ5vp+zpxN18xbJDbDrxjQz\nXM14nGKqSEJER2w8d4vXvxY7eOgG2+K5ddrSPfJ8AoJGOcWBqWvfIsihbTh8GTZk\nsuVtRtY0jXcs/Pmtkx9efp+2jqAa957pzzq831AJ0TEk8ufw+lDJP8+bwq/0Z0rK\nmDOXS+UpljfEquwVYVM+kP/qTJ1RWc/dfCoyWtaFdrukUoMcFtct2nrLcL23xaYo\nWSGERyaM2QKtSg1kicQ8UNV1DrMD93Qbmo8cOrDpZLVQ5sDE+LCZ5a/4PA/0Cqe1\nW2HRhKktmTCkE9+ZJRK/TYr3JB2xBWeWtni7jUxrcQKBgQDRWrmAa7i1WRO5Jiym\ndo+dFRQkfMo17YvLv2OP4XkjzkqefNM82kA8VENoGjHN/SL2uRV0WO6fzCKjNTVw\n+ulhLvXFGlA9AwPqCFNSqG0tVUB4gas5gGWqDlFuuqNUm5TpoOfoilRY+pStXfQK\nbzl5eRlhg6PESIyvKsKJGBVUTwKBgQC92acFfaGbQeDevXFdft9H0rjEdbnHYH+d\nWlJFGmrxxj495ozAeMOrdfBap/efJWb47bmx78ZGbj8m5YDV+b2J7qgK3Oj2j6fR\nvDOlFXP6qJ020olfAW/RAVJGIjQ1ofmptGnaKH3BbZrKB27Jxwne7K8B8YJ0r+fw\nbhBqzSLTEQKBgQCgpuEgxgkIyKFU/BFZcDPGk+1QDp7RgUc8g9KwD5L5Qg2Kzzj+\nQnD2mqbbVPaRHsZc1Cy9ip0a7PhLi8JFv5WlqPaaWRXnq8+uINNn461cE0aU8tRl\nHL1nIPOmZ/x8KaO9IGe1z6joWuoKm8Vw2Gcfaylp5i2eqxmiNcrwjxWXCwKBgFIV\nuVF2cFlgsomb/1gdcwzq31iSTjEWWBcA5nFaasL+pAq/lDvj+zY3WCTaWwZEdbFL\nl+6HbYMmR8fZk0rxIDJzLdUEjvWMR1M3vFy0WeEW5mK9xQd+54nGuHv6bfiCgCAQ\nEXRx7W2kpjiT3iMAHBR24XRFp9Ir/GzIKfEDoPsBAoGBAKJndU+wDnBSpo9rzY0d\n3s1spIRokKRYTJZuRW+GERbFIGuuv63z1nISbwdqf+yps08fYvgqj6KuuQv8hy0K\nEo5MNq3ssaP7WOxwBCn/3IQIwcuXudmC+LYbLU+3lu4ITMmdXJMx4+C+X7hP/B5H\nEZrzUkdiPIfQAijbj0oPHotu\n-----END PRIVATE KEY-----\n',
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
