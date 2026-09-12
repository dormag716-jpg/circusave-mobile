import {
  ApiError,
  getGooglePlayBillingStatus,
  restoreGooglePlayPurchase,
  verifyGooglePlayPurchase,
} from '../api';

describe('Google Play billing API contracts', () => {
  const rawPurchaseToken = 'raw-purchase-token-that-must-not-leak';
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

  function respond(payload: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
    }) as unknown as typeof fetch;
  }

  function verificationResponse(extra: Record<string, unknown> = {}) {
    return {
      provider: 'google_play',
      restored: false,
      status: 'active',
      productId: 'organizer-pro',
      basePlanId: 'monthly',
      offerId: null,
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      acknowledgementState: 'acknowledged',
      entitlements: {
        plan: 'premium',
        subscriptionStatus: 'active',
        source: 'google_play',
        capabilities: {},
      },
      ...extra,
    };
  }

  test('fetches the authenticated disabled status contract', async () => {
    respond({ provider: 'google_play', enabled: false });

    await expect(getGooglePlayBillingStatus('session-token')).resolves.toEqual({
      provider: 'google_play',
      enabled: false,
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'http://127.0.0.1:5000/api/billing/google-play/status',
    );
    expect(String(init.method ?? 'GET').toUpperCase()).toBe('GET');
    expect((init.headers as Headers).get('Authorization')).toBe(
      ['Bearer', 'session-token'].join(' '),
    );
  });

  test('preserves the enabled mobile bootstrap contract', async () => {
    const enabled = {
      provider: 'google_play' as const,
      enabled: true as const,
      packageName: 'com.circusave.mobile',
      obfuscatedAccountId: 'opaque-account-binding',
      monthly: {
        productId: 'organizer-pro',
        basePlanId: 'monthly',
        offerId: 'trial-7-day',
      },
      annual: {
        productId: 'organizer-pro',
        basePlanId: 'annual',
        offerId: null,
      },
      trialEligible: true,
    };
    respond(enabled);

    await expect(
      getGooglePlayBillingStatus('session-token'),
    ).resolves.toEqual(enabled);
  });

  test('accepts nullable offer IDs in the enabled contract', async () => {
    respond({
      provider: 'google_play',
      enabled: true,
      packageName: 'com.circusave.mobile',
      obfuscatedAccountId: 'opaque-account-binding',
      monthly: {
        productId: 'organizer-pro',
        basePlanId: 'monthly',
        offerId: null,
      },
      annual: {
        productId: 'organizer-pro',
        basePlanId: 'annual',
        offerId: null,
      },
      trialEligible: false,
    });

    const status = await getGooglePlayBillingStatus('session-token');
    expect(status.enabled).toBe(true);
    if (status.enabled) {
      expect(status.monthly.offerId).toBeNull();
      expect(status.annual.offerId).toBeNull();
      expect(status.trialEligible).toBe(false);
    }
  });

  test.each([
    null,
    {},
    { provider: 'google_play', enabled: 'false' },
    {
      provider: 'google_play',
      enabled: true,
      packageName: '',
      obfuscatedAccountId: 'binding',
      monthly: {},
      annual: {},
      trialEligible: true,
    },
  ])('rejects malformed status responses', async (payload) => {
    respond(payload);

    await expect(
      getGooglePlayBillingStatus('session-token'),
    ).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Google Play billing request failed.',
      payload: undefined,
    });
  });

  test.each([
    ['verify', verifyGooglePlayPurchase],
    ['restore', restoreGooglePlayPurchase],
  ] as const)(
    'posts only the purchase token to %s',
    async (operation, request) => {
      respond(verificationResponse({ restored: operation === 'restore' }));

      await request('session-token', rawPurchaseToken);

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(url).toBe(
        `http://127.0.0.1:5000/api/billing/google-play/${operation}`,
      );
      expect(String(init.method).toUpperCase()).toBe('POST');
      expect((init.headers as Headers).get('Authorization')).toBe(
        ['Bearer', 'session-token'].join(' '),
      );
      expect(JSON.parse(String(init.body))).toEqual({
        purchaseToken: rawPurchaseToken,
      });
    },
  );

  test('removes raw purchase tokens from returned metadata', async () => {
    respond(
      verificationResponse({
        purchaseToken: rawPurchaseToken,
        internalPurchaseTokenHash: 'must-not-return',
      }),
    );

    const result = await verifyGooglePlayPurchase(
      'session-token',
      rawPurchaseToken,
    );

    expect(JSON.stringify(result)).not.toContain(rawPurchaseToken);
    expect(result).not.toHaveProperty('purchaseToken');
    expect(result).not.toHaveProperty('internalPurchaseTokenHash');
    expect(result.entitlements.source).toBe('google_play');
  });

  test('does not cache or persist purchase-token verification requests', async () => {
    respond(verificationResponse());

    await verifyGooglePlayPurchase('session-token', rawPurchaseToken);
    await verifyGooglePlayPurchase('session-token', rawPurchaseToken);

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('sanitizes provider failures and Google Play development logs', async () => {
    globalWithDev.__DEV__ = true;
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({
          error: rawPurchaseToken,
          purchaseToken: rawPurchaseToken,
        }),
    }) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await verifyGooglePlayPurchase('session-token', rawPurchaseToken);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(String(caught)).not.toContain(rawPurchaseToken);
    expect((caught as ApiError).payload).toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).not.toContain(rawPurchaseToken);
    log.mockRestore();
  });
});
