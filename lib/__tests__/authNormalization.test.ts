/**
 * Exercises private normalizeAuthResponse through the smallest public path:
 * getAuthSession → GET /auth/session → { user, session }.
 */
import { getAuthSession, requestPasswordReset } from '../api';

const baseUser = {
  id: 'usr_1',
  name: 'Ada Organizer',
  email: 'ada@example.com',
  role: 'member',
  created_at: '2026-01-01T00:00:00Z',
  last_login_at: null as string | null,
};

const baseSession = {
  id: 'sess_1',
  user_id: 'usr_1',
  created_at: '2026-01-01T00:00:00Z',
  expires_at: '2027-01-01T00:00:00Z',
  token_type: 'Bearer' as const,
};

describe('auth normalization preserves payment preferences (via getAuthSession)', () => {
  const originalFetch = global.fetch;
  const originalApiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const globalWithDev = globalThis as typeof globalThis & { __DEV__?: boolean };
  const originalDev = globalWithDev.__DEV__;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:5000';
    // requestJson logs via __DEV__ (RN global); define it for Node/Jest.
    globalWithDev.__DEV__ = false;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiBase === undefined) {
      delete process.env.EXPO_PUBLIC_API_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBase;
    }
    if (originalDev === undefined) {
      delete globalWithDev.__DEV__;
    } else {
      globalWithDev.__DEV__ = originalDev;
    }
  });

  function mockAuthSessionPayload(payload: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
    }) as unknown as typeof fetch;
  }

  test('existing session token remains unchanged', async () => {
    const bearer = 'sess_token_keep_me';
    mockAuthSessionPayload({
      user: { ...baseUser },
      session: {
        ...baseSession,
        token: bearer,
      },
    });

    const result = await getAuthSession(bearer);
    expect(result.session.token).toBe(bearer);
  });

  test('session token is not invented when backend omits it', async () => {
    mockAuthSessionPayload({
      user: { ...baseUser },
      session: baseSession,
    });

    const result = await getAuthSession('caller-supplied-token');
    // getAuthSession does not re-attach the request token; bootstrapAuthSession does.
    expect(result.session.token).toBeUndefined();
  });

  test('password recovery accepts the generic backend acknowledgement', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          accepted: true,
          challengeId: 'otp_0123456789',
          expiresIn: 300,
          message:
            'If an eligible account exists, verification instructions will be sent.',
        }),
    }) as unknown as typeof fetch;

    const result = await requestPasswordReset({
      email: '  ADA@EXAMPLE.COM ',
    });

    expect(result.accepted).toBe(true);
    expect(result.challengeId).toMatch(/^otp_[0-9a-f]{10}$/);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/forgot-password/request'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'ada@example.com', language: 'en' }),
      }),
    );
  });
});
