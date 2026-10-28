import { readFileSync } from 'fs';
import path from 'path';

import {
  clearFederatedCredential,
  createAuthNonce,
  federatedRequestBody,
  randomHex,
  holdFederatedCredential,
  interpretFederatedPayload,
  readFederatedCredential,
  splitDisplayName,
} from '../auth/federatedSignIn';
import { sha256Hex } from '../shared/sha256';

const root = path.join(__dirname, '..', '..');

describe('federated sign-in', () => {
  afterEach(() => {
    clearFederatedCredential();
  });

  it('creates a nonce from expo-crypto when Web Crypto is missing', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    try {
      const nonce = createAuthNonce();
      expect(nonce.raw).toMatch(/^[0-9a-f]{64}$/);
      expect(nonce.hash).toBe(sha256Hex(nonce.raw));
      expect(nonce.hash).not.toBe(nonce.raw);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'crypto', descriptor);
      }
    }
  });

  it('rejects a random provider that does not return the requested bytes', () => {
    expect(() =>
      randomHex(32, () => {
        throw new Error('native crypto missing');
      }),
    ).toThrow('Secure random source is unavailable.');
    expect(() => randomHex(32, () => new Uint8Array(4))).toThrow(
      'Secure random source is unavailable.',
    );
  });

  it('sends the nonce hash to Google and the raw nonce to CircuSave', () => {
    const nonce = createAuthNonce();
    const body = federatedRequestBody({
      proof: {
        provider: 'google',
        idToken: 'signed-token',
        authNonce: nonce.raw,
      },
    });
    expect(body.authNonce).toBe(nonce.raw);
    expect(body.authNonce).not.toBe(nonce.hash);
    const googleSource = readFileSync(path.join(root, 'lib', 'auth', 'googleIdentitySignIn.ts'), 'utf8');
    const federatedSource = readFileSync(path.join(root, 'lib', 'auth', 'federatedSignIn.ts'), 'utf8');
    expect(googleSource).toContain('nonce: nonce.hash');
    expect(googleSource).toContain('authNonce: nonce.raw');
    expect(federatedSource).not.toContain('console.log');
    expect(googleSource).not.toContain('console.log');
    expect(federatedSource).not.toContain('Math.random');
  });

  it('matches the SHA-256 hex the backend uses for the sign-in nonce', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const nonce = createAuthNonce();
    expect(nonce.raw).toHaveLength(64);
    expect(nonce.hash).toBe(sha256Hex(nonce.raw));
    expect(nonce.hash).not.toBe(nonce.raw);
  });

  it('keeps a provider credential in memory only until sign-in finishes', () => {
    holdFederatedCredential({
      provider: 'google',
      idToken: 'signed-token',
      authNonce: 'raw-nonce',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    });
    expect(readFederatedCredential()).toMatchObject({
      provider: 'google',
      email: 'ada@example.com',
    });
    clearFederatedCredential();
    expect(readFederatedCredential()).toBeNull();
  });

  it('asks for the CircuSave password before linking and does not invent a session', () => {
    expect(
      interpretFederatedPayload({
        status: 'link_required',
        provider: 'google',
        email: 'Ada@Example.com',
      }),
    ).toEqual({
      status: 'link_required',
      provider: 'google',
      email: 'ada@example.com',
    });
    expect(
      interpretFederatedPayload({
        status: 'registration_required',
        provider: 'apple',
        email: 'ada@privaterelay.appleid.com',
        name: 'Ada Lovelace',
      }).status,
    ).toBe('registration_required');
    expect(() =>
      interpretFederatedPayload({ status: 'authenticated', user: {}, session: {} }),
    ).toThrow('Authentication response was invalid.');
  });

  it('sends the provider token and nonce without a client-chosen email', () => {
    const body = federatedRequestBody({
      proof: {
        provider: 'google',
        idToken: 'signed-token',
        authNonce: 'raw-nonce',
        name: 'Ada Lovelace',
      },
      password: 'password1',
    });
    expect(body).toEqual({
      idToken: 'signed-token',
      authNonce: 'raw-nonce',
      password: 'password1',
      name: 'Ada Lovelace',
    });
    expect(body).not.toHaveProperty('email');
  });

  it('splits a provider display name for the account form', () => {
    expect(splitDisplayName('Ada Lovelace')).toEqual({
      first: 'Ada',
      last: 'Lovelace',
    });
    expect(splitDisplayName('Ada')).toEqual({ first: 'Ada', last: '' });
  });

  it('uses the same authenticated session as password login', () => {
    const login = readFileSync(path.join(root, 'app', 'login.tsx'), 'utf8');
    const createAccount = readFileSync(
      path.join(root, 'app', 'create-account.tsx'),
      'utf8',
    );
    const google = readFileSync(
      path.join(root, 'lib', 'auth', 'googleIdentitySignIn.ts'),
      'utf8',
    );
    expect(login).toContain('signInWithFederatedProvider');
    expect(login).toContain('setAuthenticatedSession');
    expect(login).toContain('FederatedAuthButtons');
    expect(createAccount).toContain('signInWithFederatedProvider');
    expect(createAccount).toContain('setAuthenticatedSession');
    expect(google).toContain('GoogleOneTapSignIn.configure');
    expect(google).toContain('nonce: nonce.hash');
    expect(google).not.toContain('serverAuthCode');
    expect(login).not.toContain('skipDeviceLock');
    expect(createAccount).not.toContain('skipDeviceLock');
  });
});
