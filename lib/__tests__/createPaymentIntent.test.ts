import { ApiError, createPaymentIntent } from '../api';

describe('createPaymentIntent (server-authoritative amount)', () => {
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

  function lastRequest(): { url: string; init: RequestInit; body: Record<string, unknown> } {
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    return {
      url,
      init,
      body: JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>,
    };
  }

  test('sends POST to /api/wallet/stripe/payment-intent with bearer token', async () => {
    mockJsonResponse(200, {
      clientSecret: 'cs_test',
      paymentIntentId: 'pi_test',
      amountCents: 5000,
    });

    await createPaymentIntent('tok_abc', 'circle-1', 2, 'membership-hand-1');

    const { url, init } = lastRequest();
    expect(url).toBe('http://127.0.0.1:5000/api/wallet/stripe/payment-intent');
    expect(String(init.method).toUpperCase()).toBe('POST');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok_abc');
  });

  test('body contains circleId, roundNumber, memberId, and handId', async () => {
    mockJsonResponse(200, {
      clientSecret: 'cs_test',
      paymentIntentId: 'pi_test',
    });

    await createPaymentIntent('tok_abc', 'circle-1', 3, 'hand-membership-9');

    const { body } = lastRequest();
    expect(body).toEqual({
      circleId: 'circle-1',
      roundNumber: 3,
      memberId: 'hand-membership-9',
      handId: 'hand-membership-9',
    });
  });

  test('memberId and handId are the same membership/hand ID', async () => {
    mockJsonResponse(200, {
      clientSecret: 'cs_test',
      paymentIntentId: 'pi_test',
    });

    const handId = 'membership_same_as_hand';
    await createPaymentIntent('tok_abc', 'circle-1', 1, handId);

    const { body } = lastRequest();
    expect(body.memberId).toBe(handId);
    expect(body.handId).toBe(handId);
    expect(body.memberId).toBe(body.handId);
  });

  test('body does not contain amount or amountCents', async () => {
    mockJsonResponse(200, {
      clientSecret: 'cs_test',
      paymentIntentId: 'pi_test',
      amountCents: 10000,
    });

    await createPaymentIntent('tok_abc', 'circle-1', 1, 'hand-1');

    const { body } = lastRequest();
    expect(body).not.toHaveProperty('amount');
    expect(body).not.toHaveProperty('amountCents');
    expect(Object.keys(body).sort()).toEqual(
      ['circleId', 'handId', 'memberId', 'roundNumber'].sort(),
    );
  });

  test('response containing server-returned amountCents resolves successfully', async () => {
    mockJsonResponse(200, {
      clientSecret: 'cs_secret_server',
      paymentIntentId: 'pi_server',
      memberId: 'hand-1',
      handId: 'hand-1',
      handNumber: 2,
      amountCents: 7500,
    });

    const result = await createPaymentIntent(
      'tok_abc',
      'circle-1',
      4,
      'hand-1',
    );

    expect(result.clientSecret).toBe('cs_secret_server');
    expect(result.paymentIntentId).toBe('pi_server');
    expect(result.amountCents).toBe(7500);
  });

  test('when optional hand ID is omitted, memberId and handId are omitted rather than invented', async () => {
    mockJsonResponse(200, {
      clientSecret: 'cs_test',
      paymentIntentId: 'pi_test',
    });

    await createPaymentIntent('tok_abc', 'circle-1', 1);

    const { body } = lastRequest();
    expect(body).toEqual({
      circleId: 'circle-1',
      roundNumber: 1,
    });
    expect(body).not.toHaveProperty('memberId');
    expect(body).not.toHaveProperty('handId');
    expect(body).not.toHaveProperty('amount');
  });

  test('non-2xx response still throws ApiError', async () => {
    mockJsonResponse(400, { error: 'Circle contribution amount is invalid.' });

    await expect(
      createPaymentIntent('tok_abc', 'circle-1', 1, 'hand-1'),
    ).rejects.toBeInstanceOf(ApiError);

    await expect(
      createPaymentIntent('tok_abc', 'circle-1', 1, 'hand-1'),
    ).rejects.toMatchObject({ status: 400 });
  });
});
