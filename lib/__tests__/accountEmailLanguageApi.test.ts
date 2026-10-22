import i18n from 'i18next';

import { register, requestPasswordReset, resendRegistrationCode } from '../api';

const LEGAL = {
  acceptedLegal: true,
  termsVersion: 't',
  privacyVersion: 'p',
  fundsDisclosureVersion: 'f',
  electronicConsentVersion: 'e',
} as Parameters<typeof register>[0]['legalAcceptance'];

describe('account emails follow the language chosen in the app', () => {
  const originalFetch = global.fetch;
  const originalApiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const globalWithDev = globalThis as typeof globalThis & { __DEV__?: boolean };
  let bodies: Record<string, unknown>[];

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:5000';
    globalWithDev.__DEV__ = false;
    bodies = [];
    global.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response(
        JSON.stringify({
          status: 'verification_required',
          signupId: 'sup_1',
          expiresAt: '2026-10-21T12:10:00Z',
          resendAfterSeconds: 30,
          signupExpiresAt: '2026-10-21T12:30:00Z',
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    if (!i18n.isInitialized) {
      await i18n.init({ lng: 'en', resources: { en: { x: {} } } });
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiBase === undefined) {
      delete process.env.EXPO_PUBLIC_API_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBase;
    }
    delete globalWithDev.__DEV__;
  });

  const input = { name: 'A B', email: 'a@b.co', password: 'Password-12345', legalAcceptance: LEGAL };

  for (const language of ['en', 'es', 'ht'] as const) {
    it(`sends "${language}" with sign-up, resend and password recovery`, async () => {
      await i18n.changeLanguage(language);
      await register(input);
      await resendRegistrationCode({ signupId: 'sup_1', email: 'a@b.co' });
      await requestPasswordReset({ email: 'a@b.co' });
      expect(bodies).toHaveLength(3);
      for (const body of bodies) {
        expect(body.language).toBe(language);
      }
    });
  }

  it('sends English when the app language is something the Backend does not support', async () => {
    await i18n.changeLanguage('fr');
    await requestPasswordReset({ email: 'a@b.co' });
    expect(bodies[0].language).toBe('en');
  });

  it('reads the sign-up deadline from the start answer only', async () => {
    const started = await register(input);
    expect(started).toMatchObject({ status: 'verification_required', signupExpiresAt: '2026-10-21T12:30:00Z' });
  });

  it('never sends the verification code or a token to the start or resend requests', async () => {
    await register(input);
    await resendRegistrationCode({ signupId: 'sup_1', email: 'a@b.co' });
    for (const body of bodies) {
      expect(Object.keys(body)).not.toContain('code');
      expect(Object.keys(body)).not.toContain('token');
    }
  });
});
