import {
  HTTP_GET_CACHE_TTL_MS,
  getHttpGetCachePolicy,
  invalidateCachedGets,
  isAuthoritativeFinancialGet,
  isCachedGetAuthoritative,
  isChatOrAssistantGet,
  readCachedGet,
  resetHttpGetCacheForTests,
  runDedupedGet,
  shouldUseHttpGetCache,
} from '../httpGetCache';
import {
  getCircleDetail,
  getCircleSchedule,
  getCircles,
  getEntitlements,
  getLedgerEntries,
  logout,
} from '../api';

describe('shared GET cache and in-flight dedupe', () => {
  beforeEach(() => {
    resetHttpGetCacheForTests();
  });

  it('persists list, summary, and circle detail but not schedule or statements', () => {
    expect(getHttpGetCachePolicy('/groups')).toEqual({
      dedupe: true,
      persist: true,
    });
    expect(getHttpGetCachePolicy('/dashboard/summary')).toEqual({
      dedupe: true,
      persist: true,
    });
    expect(getHttpGetCachePolicy('/activity')).toEqual({
      dedupe: true,
      persist: true,
    });
    expect(getHttpGetCachePolicy('/groups/circle-1')).toEqual({
      dedupe: true,
      persist: true,
    });
    expect(getHttpGetCachePolicy('/groups/circle-1/schedule')).toEqual({
      dedupe: true,
      persist: false,
    });
    expect(getHttpGetCachePolicy('/ledger/circle-1')).toEqual({
      dedupe: false,
      persist: false,
    });
    expect(getHttpGetCachePolicy('/groups/circle-1/member-statements')).toEqual({
      dedupe: false,
      persist: false,
    });
    expect(isCachedGetAuthoritative()).toBe(false);
  });

  it('does not persist chat, conversation, or assistant GETs', () => {
    expect(isChatOrAssistantGet('/groups/c1/conversations')).toBe(true);
    expect(isChatOrAssistantGet('/groups/c1/conversations/x/messages')).toBe(
      true,
    );
    expect(isChatOrAssistantGet('/groups/c1/chat')).toBe(true);
    expect(
      isChatOrAssistantGet('/assistant/circles/c1/conversations'),
    ).toBe(true);
    expect(getHttpGetCachePolicy('/groups/c1/conversations')).toEqual({
      dedupe: false,
      persist: false,
    });
    expect(
      getHttpGetCachePolicy('/assistant/circles/c1/conversations'),
    ).toEqual({
      dedupe: false,
      persist: false,
    });
  });

  it('treats wallet, entitlements, statements, and session as financial authority', () => {
    expect(isAuthoritativeFinancialGet('/auth/me/entitlements')).toBe(true);
    expect(isAuthoritativeFinancialGet('/wallet/stripe/accounts')).toBe(true);
    expect(isAuthoritativeFinancialGet('/ledger/c1')).toBe(true);
    expect(
      isAuthoritativeFinancialGet('/groups/c1/statement-documents'),
    ).toBe(true);
    expect(getHttpGetCachePolicy('/auth/me/entitlements')).toEqual({
      dedupe: false,
      persist: false,
    });
    expect(getHttpGetCachePolicy('/wallet/stripe/accounts')).toEqual({
      dedupe: false,
      persist: false,
    });
  });

  it('never uses the GET cache for mutations', () => {
    expect(shouldUseHttpGetCache('POST', '/groups')).toBe(false);
    expect(shouldUseHttpGetCache('PATCH', '/groups/c1')).toBe(false);
    expect(shouldUseHttpGetCache('PUT', '/groups/c1')).toBe(false);
    expect(shouldUseHttpGetCache('DELETE', '/groups/c1')).toBe(false);
    expect(shouldUseHttpGetCache('GET', '/groups')).toBe(true);
    expect(shouldUseHttpGetCache('GET', '/ledger/c1')).toBe(false);
  });

  it('shares one in-flight GET for identical path and token', async () => {
    let calls = 0;
    const fetcher = jest.fn(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { n: calls };
    });

    const [a, b] = await Promise.all([
      runDedupedGet({ path: '/groups', token: 'tok', fetcher }),
      runDedupedGet({ path: '/groups', token: 'tok', fetcher }),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(a).not.toBe(b);
  });

  it('serves persisted GETs inside the TTL without another fetch', async () => {
    const fetcher = jest.fn(async () => [{ id: 'c1' }]);
    await runDedupedGet({ path: '/groups', token: 'tok', fetcher });
    const second = await runDedupedGet({
      path: '/groups',
      token: 'tok',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(second).toEqual([{ id: 'c1' }]);
    expect(readCachedGet('/groups', 'tok')).toEqual([{ id: 'c1' }]);
  });

  it('does not persist schedule after the in-flight request completes', async () => {
    const fetcher = jest.fn(async () => ({ currentRound: 2 }));
    await runDedupedGet({
      path: '/groups/c1/schedule',
      token: 'tok',
      fetcher,
    });
    await runDedupedGet({
      path: '/groups/c1/schedule',
      token: 'tok',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(readCachedGet('/groups/c1/schedule', 'tok')).toBeUndefined();
  });

  it('does not share cache across tokens or circle IDs', async () => {
    const fetcher = jest.fn(async () => ({ id: 'x' }));
    await runDedupedGet({ path: '/groups/a', token: 'tok-a', fetcher });
    await runDedupedGet({ path: '/groups/b', token: 'tok-a', fetcher });
    await runDedupedGet({ path: '/groups/a', token: 'tok-b', fetcher });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('invalidates persisted GETs after a mutation epoch', async () => {
    const fetcher = jest.fn(async () => [{ id: 'c1' }]);
    await runDedupedGet({ path: '/groups', token: 'tok', fetcher });
    invalidateCachedGets();
    await runDedupedGet({ path: '/groups', token: 'tok', fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not store a late GET that finishes after invalidation', async () => {
    let resolveFetch: (value: { id: string }) => void = () => {};
    const fetcher = jest.fn(
      () =>
        new Promise<{ id: string }>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const pending = runDedupedGet({
      path: '/groups/c1',
      token: 'tok',
      fetcher,
    });
    invalidateCachedGets();
    resolveFetch({ id: 'stale' });
    await pending;

    expect(readCachedGet('/groups/c1', 'tok')).toBeUndefined();
    const refetch = jest.fn(async () => ({ id: 'fresh' }));
    await expect(
      runDedupedGet({ path: '/groups/c1', token: 'tok', fetcher: refetch }),
    ).resolves.toEqual({ id: 'fresh' });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('refetches persisted GETs after the TTL', async () => {
    const fetcher = jest.fn(async () => ({ ok: true }));
    await runDedupedGet({
      path: '/dashboard/summary',
      token: 'tok',
      fetcher,
      now: 1_000,
    });
    expect(
      readCachedGet(
        '/dashboard/summary',
        'tok',
        1_000 + HTTP_GET_CACHE_TTL_MS + 1,
      ),
    ).toBeUndefined();

    await runDedupedGet({
      path: '/dashboard/summary',
      token: 'tok',
      fetcher,
      now: 1_000 + HTTP_GET_CACHE_TTL_MS + 1,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not retain a failed GET as a successful cache entry', async () => {
    const fetcher = jest.fn(async () => {
      throw new Error('network down');
    });

    await expect(
      runDedupedGet({ path: '/groups', token: 'tok', fetcher }),
    ).rejects.toThrow('network down');
    expect(readCachedGet('/groups', 'tok')).toBeUndefined();

    const [first, second] = await Promise.allSettled([
      runDedupedGet({ path: '/groups', token: 'tok', fetcher }),
      runDedupedGet({ path: '/groups', token: 'tok', fetcher }),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(first.status).toBe('rejected');
    expect(second.status).toBe('rejected');
    expect(readCachedGet('/groups', 'tok')).toBeUndefined();

    const recovered = jest.fn(async () => [{ id: 'c1' }]);
    await expect(
      runDedupedGet({ path: '/groups', token: 'tok', fetcher: recovered }),
    ).resolves.toEqual([{ id: 'c1' }]);
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it('lets authoritative financial reads bypass or revalidate cache', async () => {
    const groupsFetcher = jest.fn(async () => [{ id: 'stale' }]);
    await runDedupedGet({
      path: '/groups',
      token: 'tok',
      fetcher: groupsFetcher,
    });

    const revalidateFetcher = jest.fn(async () => [{ id: 'fresh' }]);
    await expect(
      runDedupedGet({
        path: '/groups',
        token: 'tok',
        fetcher: revalidateFetcher,
        revalidate: true,
      }),
    ).resolves.toEqual([{ id: 'fresh' }]);
    expect(revalidateFetcher).toHaveBeenCalledTimes(1);

    const bypassFetcher = jest.fn(async () => [{ id: 'live' }]);
    await expect(
      runDedupedGet({
        path: '/groups',
        token: 'tok',
        fetcher: bypassFetcher,
        bypass: true,
      }),
    ).resolves.toEqual([{ id: 'live' }]);
    expect(bypassFetcher).toHaveBeenCalledTimes(1);

    const scheduleFetcher = jest.fn(async () => ({ currentRound: 4 }));
    await runDedupedGet({
      path: '/groups/c1/schedule',
      token: 'tok',
      fetcher: scheduleFetcher,
    });
    await runDedupedGet({
      path: '/groups/c1/schedule',
      token: 'tok',
      fetcher: scheduleFetcher,
      revalidate: true,
    });
    await runDedupedGet({
      path: '/groups/c1/schedule',
      token: 'tok',
      fetcher: scheduleFetcher,
      bypass: true,
    });
    expect(scheduleFetcher).toHaveBeenCalledTimes(3);
    expect(readCachedGet('/groups/c1/schedule', 'tok')).toBeUndefined();
    expect(isCachedGetAuthoritative()).toBe(false);
  });
});

describe('requestJson GET cache wiring', () => {
  const originalFetch = global.fetch;
  const originalApiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const globalWithDev = globalThis as typeof globalThis & { __DEV__?: boolean };
  const originalDev = globalWithDev.__DEV__;

  function mockJson(body: unknown) {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    };
  }

  beforeEach(() => {
    resetHttpGetCacheForTests();
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

  it('dedupes identical in-flight getCircles calls through requestJson', async () => {
    let resolveFetch: (value: ReturnType<typeof mockJson>) => void = () => {};
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

    const pending = Promise.all([
      getCircles('tok'),
      getCircles('tok'),
    ]);
    resolveFetch(mockJson([{ id: 'c1', name: 'Alpha', status: 'active' }]));
    const [a, b] = await pending;

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('invalidates /groups after a mutation and skips cache for financial GETs', async () => {
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes('/auth/logout')) {
        return Promise.resolve(mockJson({ ok: true }));
      }
      if (String(url).includes('/auth/me/entitlements')) {
        return Promise.resolve(
          mockJson({
            plan: 'free',
            subscriptionStatus: 'inactive',
            capabilities: {},
          }),
        );
      }
      if (String(url).includes('/schedule')) {
        return Promise.resolve(mockJson({ currentRound: 2, contributions: [] }));
      }
      if (String(url).includes('/ledger/')) {
        return Promise.resolve(mockJson({ entries: [], nextCursor: null }));
      }
      if (String(url).includes('/groups/c1')) {
        return Promise.resolve(mockJson({ id: 'c1', name: 'Alpha' }));
      }
      return Promise.resolve(mockJson([{ id: 'c1' }]));
    }) as unknown as typeof fetch;

    await getCircles('tok');
    await getCircles('tok');
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).endsWith('/groups'),
      ),
    ).toHaveLength(1);

    await logout('tok');
    await getCircles('tok');
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).endsWith('/groups'),
      ),
    ).toHaveLength(2);

    await getCircleSchedule('tok', 'c1');
    await getCircleSchedule('tok', 'c1');
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).includes('/schedule'),
      ),
    ).toHaveLength(2);

    await getEntitlements('tok');
    await getEntitlements('tok');
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).includes('/entitlements'),
      ),
    ).toHaveLength(2);

    await getLedgerEntries('tok', 'c1');
    await getLedgerEntries('tok', 'c1');
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).includes('/ledger/'),
      ),
    ).toHaveLength(2);

    await getCircleDetail('tok', 'c1');
    await getCircleDetail('tok', 'c1');
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).endsWith('/groups/c1'),
      ),
    ).toHaveLength(1);
  });
});
