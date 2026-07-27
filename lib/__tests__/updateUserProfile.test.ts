import { ApiError, updateUserProfile } from '../api';

describe('updateUserProfile contract', () => {
  const originalFetch = global.fetch;
  const originalApiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const globalWithDev = globalThis as typeof globalThis & { __DEV__?: boolean };
  const originalDev = globalWithDev.__DEV__;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:5000';
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

  function mockJsonResponse(status: number, body: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    }) as unknown as typeof fetch;
  }

  test('sends PATCH to /auth/me', async () => {
    mockJsonResponse(200, {
      id: 'usr_1',
      name: 'Ada',
      email: 'ada@example.com',
      role: 'member',
      created_at: '2026-01-01T00:00:00Z',
    });

    await updateUserProfile('tok_abc', { cashtag: '$ada' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('http://127.0.0.1:5000/api/auth/me');
    expect(String(init.method).toUpperCase()).toBe('PATCH');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok_abc');
  });

  test('request body contains only fields passed', async () => {
    mockJsonResponse(200, {
      id: 'usr_1',
      name: 'Ada',
      email: 'ada@example.com',
      role: 'member',
      created_at: '2026-01-01T00:00:00Z',
      cashtag: '$only',
    });

    await updateUserProfile('tok_abc', { cashtag: '$only' });

    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ cashtag: '$only' });
  });

  test('flat public user response resolves successfully without a session field', async () => {
    const flatUser = {
      id: 'usr_1',
      name: 'Ada Organizer',
      email: 'ada@example.com',
      role: 'member',
      created_at: '2026-01-01T00:00:00Z',
      last_login_at: null,
      preferredMarket: 'default',
      cashtag: '$adaCash',
      venmoHandle: '@ada-venmo',
      paypalEmail: 'ada@paypal.example',
    };
    mockJsonResponse(200, flatUser);

    const result = await updateUserProfile('tok_abc', {
      cashtag: '$adaCash',
      venmoHandle: '@ada-venmo',
      paypalEmail: 'ada@paypal.example',
    });

    expect(result).toEqual(flatUser);
    expect(result).not.toHaveProperty('session');
    expect(result).not.toHaveProperty('user');
  });

  test('cashtag, venmoHandle, and paypalEmail remain available on returned AuthUser', async () => {
    mockJsonResponse(200, {
      id: 'usr_1',
      name: 'Ada',
      email: 'ada@example.com',
      role: 'member',
      created_at: '2026-01-01T00:00:00Z',
      cashtag: '$keep',
      venmoHandle: '@keep',
      paypalEmail: 'keep@example.com',
    });

    const user = await updateUserProfile('tok_abc', {
      cashtag: '$keep',
      venmoHandle: '@keep',
      paypalEmail: 'keep@example.com',
    });

    expect(user.cashtag).toBe('$keep');
    expect(user.venmoHandle).toBe('@keep');
    expect(user.paypalEmail).toBe('keep@example.com');
  });

  test('non-2xx response still throws', async () => {
    mockJsonResponse(403, { error: 'Forbidden' });

    await expect(
      updateUserProfile('tok_abc', { cashtag: '$nope' }),
    ).rejects.toBeInstanceOf(ApiError);

    await expect(
      updateUserProfile('tok_abc', { cashtag: '$nope' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
