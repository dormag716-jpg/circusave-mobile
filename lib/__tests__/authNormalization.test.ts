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

  test('preserves cashtag from backend user', async () => {
    mockAuthSessionPayload({
      user: { ...baseUser, cashtag: '$adaCash' },
      session: baseSession,
    });

    const result = await getAuthSession('existing-token');
    expect(result.user.cashtag).toBe('$adaCash');
  });

  test('preserves venmoHandle from backend user', async () => {
    mockAuthSessionPayload({
      user: { ...baseUser, venmoHandle: '@ada-venmo' },
      session: baseSession,
    });

    const result = await getAuthSession('existing-token');
    expect(result.user.venmoHandle).toBe('@ada-venmo');
  });

  test('preserves paypalEmail from backend user', async () => {
    mockAuthSessionPayload({
      user: { ...baseUser, paypalEmail: 'ada@paypal.example' },
      session: baseSession,
    });

    const result = await getAuthSession('existing-token');
    expect(result.user.paypalEmail).toBe('ada@paypal.example');
  });

  test('null payment-preference values remain null', async () => {
    mockAuthSessionPayload({
      user: {
        ...baseUser,
        cashtag: null,
        venmoHandle: null,
        paypalEmail: null,
      },
      session: baseSession,
    });

    const result = await getAuthSession('existing-token');
    expect(result.user.cashtag).toBeNull();
    expect(result.user.venmoHandle).toBeNull();
    expect(result.user.paypalEmail).toBeNull();
  });

  test('omitted payment-preference values are not invented', async () => {
    mockAuthSessionPayload({
      user: { ...baseUser },
      session: baseSession,
    });

    const result = await getAuthSession('existing-token');
    expect(result.user).not.toHaveProperty('cashtag');
    expect(result.user).not.toHaveProperty('venmoHandle');
    expect(result.user).not.toHaveProperty('paypalEmail');
    expect(result.user.cashtag).toBeUndefined();
    expect(result.user.venmoHandle).toBeUndefined();
    expect(result.user.paypalEmail).toBeUndefined();
  });

  test('existing session token remains unchanged', async () => {
    const bearer = 'sess_token_keep_me';
    mockAuthSessionPayload({
      user: {
        ...baseUser,
        cashtag: '$keep',
        venmoHandle: '@keep',
        paypalEmail: 'keep@example.com',
      },
      session: {
        ...baseSession,
        token: bearer,
      },
    });

    const result = await getAuthSession(bearer);
    expect(result.session.token).toBe(bearer);
    expect(result.user.cashtag).toBe('$keep');
  });

  test('session token is not invented when backend omits it', async () => {
    mockAuthSessionPayload({
      user: { ...baseUser, cashtag: '$only-user' },
      session: baseSession,
    });

    const result = await getAuthSession('caller-supplied-token');
    // getAuthSession does not re-attach the request token; bootstrapAuthSession does.
    expect(result.session.token).toBeUndefined();
    expect(result.user.cashtag).toBe('$only-user');
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
        body: JSON.stringify({ email: 'ada@example.com' }),
      }),
    );
  });
});
