import { ApiError, HTTP_JSON_TIMEOUT_MS, HTTP_PDF_TIMEOUT_MS, getCircles, requestJson } from '../api';
import { resetHttpGetCacheForTests } from '../httpGetCache';
import { areMoneyActionsAvailable } from '../activityAuthGate';
import {
  HTTP_RETRY_AFTER_MAX_SECONDS,
  classifyFetchFailure,
  fallbackNetworkMessage,
  parseRetryAfterHeader,
  sanitizeUserFacingMessage,
} from '../networkErrors';
import {
  TimedRequestAbortError,
  runWithTimeout,
} from '../httpTimeout';
import {
  isSessionExpiryExemptPath,
  notifyUnauthorizedSession,
  registerUnauthorizedSessionHandler,
  resetUnauthorizedSessionHandlerForTests,
  shouldHandleUnauthorizedSession,
} from '../sessionExpiry';

describe('runWithTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('times out and clears the timer', async () => {
    jest.useFakeTimers();
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    const pending = runWithTimeout(() => new Promise(() => undefined), {
      timeoutMs: 25,
    });
    const assertion = expect(pending).rejects.toEqual(
      new TimedRequestAbortError('timeout'),
    );
    await jest.advanceTimersByTimeAsync(25);
    await assertion;
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  test('caller abort is cancelled, not a timeout', async () => {
    const controller = new AbortController();
    const pending = runWithTimeout(() => new Promise(() => undefined), {
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toEqual(new TimedRequestAbortError('cancelled'));
  });

  test('already-aborted caller signal fails immediately', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runWithTimeout(async () => 'ok', { signal: controller.signal }),
    ).rejects.toEqual(new TimedRequestAbortError('cancelled'));
  });
});

describe('network failure classification', () => {
  test('distinguishes offline, timeout, cancel, and 5xx', () => {
    expect(classifyFetchFailure(new TimedRequestAbortError('timeout'))).toBe(
      'timeout',
    );
    expect(classifyFetchFailure(new TimedRequestAbortError('cancelled'))).toBe(
      'cancelled',
    );
    expect(classifyFetchFailure(new Error('Network request failed'))).toBe(
      'offline',
    );
    expect(new ApiError('nope', 503).category).toBe('http_5xx');
    expect(new ApiError('nope', 429).category).toBe('http_429');
    expect(new ApiError('nope', 401).category).toBe('http_401');
  });
});

describe('user-facing sanitization', () => {
  test('strips Flask, URLs, raw JSON/HTML, and secrets', () => {
    expect(
      sanitizeUserFacingMessage(
        'Set EXPO_PUBLIC_API_BASE_URL to the Flask server URL.',
        'offline',
      ),
    ).toBe(fallbackNetworkMessage('offline'));
    expect(
      sanitizeUserFacingMessage('<html>Internal Server Error</html>', 'http_5xx'),
    ).toBe(fallbackNetworkMessage('http_5xx'));
    expect(
      sanitizeUserFacingMessage('{"error":"boom","trace":"werkzeug"}', 'http_5xx'),
    ).toBe(fallbackNetworkMessage('http_5xx'));
    expect(
      sanitizeUserFacingMessage(`Bearer ${'a'.repeat(24)}`, 'unknown'),
    ).toBe(fallbackNetworkMessage('unknown'));
    expect(sanitizeUserFacingMessage('Invalid email or password.', 'http_4xx')).toBe(
      'Invalid email or password.',
    );
  });
});

describe('Retry-After parsing', () => {
  test('parses delta-seconds and HTTP-date, and bounds invalid/huge values', () => {
    expect(parseRetryAfterHeader('12')).toBe(12);
    expect(parseRetryAfterHeader('0')).toBeNull();
    expect(parseRetryAfterHeader('nope')).toBeNull();
    expect(parseRetryAfterHeader('999999')).toBe(HTTP_RETRY_AFTER_MAX_SECONDS);

    const now = Date.parse('Wed, 21 Oct 2015 07:28:00 GMT');
    expect(
      parseRetryAfterHeader('Wed, 21 Oct 2015 07:28:15 GMT', now),
    ).toBe(15);
    expect(
      parseRetryAfterHeader('Wed, 21 Oct 2015 07:27:00 GMT', now),
    ).toBeNull();
  });
});

describe('requestJson timeout and 429', () => {
  const originalFetch = global.fetch;
  const originalApiBase = process.env.EXPO_PUBLIC_API_BASE_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:5000';
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    resetUnauthorizedSessionHandlerForTests();
    resetHttpGetCacheForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiBase === undefined) {
      delete process.env.EXPO_PUBLIC_API_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBase;
    }
    jest.useRealTimers();
    resetUnauthorizedSessionHandlerForTests();
    resetHttpGetCacheForTests();
  });

  test('JSON requests time out without leaking Flask or env URLs', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
    let caught: unknown;
    const pending = getCircles('tok').catch((err: unknown) => {
      caught = err;
    });
    await jest.advanceTimersByTimeAsync(HTTP_JSON_TIMEOUT_MS);
    await pending;
    expect(caught).toMatchObject({
      name: 'ApiError',
      category: 'timeout',
    });
    expect(String((caught as ApiError).message)).not.toMatch(
      /Flask|EXPO_PUBLIC_API_BASE_URL|127\.0\.0\.1/,
    );
    expect(HTTP_PDF_TIMEOUT_MS).toBeGreaterThan(HTTP_JSON_TIMEOUT_MS);
  });

  test('offline fetch is classified separately from 5xx', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('Network request failed');
    }) as unknown as typeof fetch;
    await expect(getCircles('tok')).rejects.toMatchObject({ category: 'offline' });

    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 502,
      text: async () => '<html>Flask traceback</html>',
    })) as unknown as typeof fetch;
    const serverError = await getCircles('tok').then(
      () => null,
      (err: ApiError) => err,
    );
    expect(serverError?.category).toBe('http_5xx');
    expect(serverError?.message).not.toMatch(/Flask|html/i);
  });

  test('429 exposes bounded Retry-After and does not auto-retry', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 429,
      headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '999999' : null) },
      text: async () => JSON.stringify({ error: 'Too many requests' }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const error = await requestJson('/auth/mobile/login', {
      method: 'POST',
      body: '{}',
    }).then(
      () => null,
      (err: ApiError) => err,
    );
    expect(error?.category).toBe('http_429');
    expect(error?.retryAfterSeconds).toBe(HTTP_RETRY_AFTER_MAX_SECONDS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('401 session expiry interceptor', () => {
  const originalFetch = global.fetch;
  const originalApiBase = process.env.EXPO_PUBLIC_API_BASE_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:5000';
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    resetUnauthorizedSessionHandlerForTests();
    resetHttpGetCacheForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiBase === undefined) {
      delete process.env.EXPO_PUBLIC_API_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBase;
    }
    resetUnauthorizedSessionHandlerForTests();
    resetHttpGetCacheForTests();
  });

  test('exempts login, logout, and anonymous restore endpoints', () => {
    expect(isSessionExpiryExemptPath('/auth/mobile/login')).toBe(true);
    expect(isSessionExpiryExemptPath('/auth/logout')).toBe(true);
    expect(isSessionExpiryExemptPath('/auth/forgot-password/request')).toBe(true);
    expect(isSessionExpiryExemptPath('/auth/device/push-token')).toBe(true);
    expect(
      shouldHandleUnauthorizedSession({
        path: '/auth/mobile/login',
        hasToken: false,
        status: 401,
      }),
    ).toBe(false);
    expect(
      shouldHandleUnauthorizedSession({
        path: '/groups/c1',
        hasToken: true,
        status: 401,
      }),
    ).toBe(true);
  });

  test('single-flights logout for authed 401s and skips login POSTs', async () => {
    const calls: string[] = [];
    let release!: () => void;
    registerUnauthorizedSessionHandler(
      () =>
        new Promise<void>((resolve) => {
          calls.push('start');
          release = resolve;
        }),
    );
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'unauthorized' }),
    })) as unknown as typeof fetch;

    const first = getCircles('tok').catch(() => undefined);
    const second = getCircles('tok').catch(() => undefined);
    await first;
    await second;
    expect(calls).toEqual(['start']);
    release();
    await notifyUnauthorizedSession();
    expect(calls).toHaveLength(1);

    calls.length = 0;
    await requestJson('/auth/mobile/login', { method: 'POST', body: '{}' }).catch(
      () => undefined,
    );
    expect(calls).toHaveLength(0);
  });

  test('money actions become unavailable after session expiry', () => {
    expect(
      areMoneyActionsAvailable({ status: 'authenticated', token: 'tok' }),
    ).toBe(true);
    expect(
      areMoneyActionsAvailable({ status: 'unauthenticated', token: 'tok' }),
    ).toBe(false);
    expect(
      areMoneyActionsAvailable({ status: 'authenticated', token: '' }),
    ).toBe(false);
  });
});
