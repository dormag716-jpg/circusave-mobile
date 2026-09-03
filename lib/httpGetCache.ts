export const HTTP_GET_CACHE_TTL_MS = 20_000;

export type HttpGetCachePolicy = {
  dedupe: boolean;
  persist: boolean;
};

type CacheEntry = {
  storedAt: number;
  epoch: number;
  value: unknown;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
let epoch = 0;

function normalizePath(path: string): string {
  return String(path || '').split('?')[0];
}

export function httpGetCacheKey(
  path: string,
  token: string | undefined,
): string {
  return `GET:${String(path || '')}:${String(token || '')}`;
}

/**
 * Contribution status, payout release, wallet, statements/PDFs, schedule used
 * for pay/review, and entitlement gates must not be served as authority.
 */
export function isAuthoritativeFinancialGet(path: string): boolean {
  const normalized = normalizePath(path);
  if (
    normalized === '/auth/me/entitlements' ||
    normalized === '/auth/me' ||
    normalized === '/auth/session'
  ) {
    return true;
  }
  if (normalized.startsWith('/wallet/')) {
    return true;
  }
  if (normalized.startsWith('/ledger/')) {
    return true;
  }
  if (/^\/rounds\/[^/]+\/wallet$/.test(normalized)) {
    return true;
  }
  if (/^\/groups\/[^/]+\/schedule$/.test(normalized)) {
    return true;
  }
  if (
    /\/member-statements(?:\/|$)/.test(normalized) ||
    /\/statement-documents(?:\/|$)/.test(normalized)
  ) {
    return true;
  }
  return false;
}

/** Chat and Susu AI polling stay on the network. Do not persist or dedupe. */
export function isChatOrAssistantGet(path: string): boolean {
  const normalized = normalizePath(path);
  if (normalized.startsWith('/assistant/')) {
    return true;
  }
  if (/^\/groups\/[^/]+\/chat$/.test(normalized)) {
    return true;
  }
  if (/^\/groups\/[^/]+\/conversations(?:\/|$)/.test(normalized)) {
    return true;
  }
  return false;
}

/** Device push registration does not change list/summary/detail presentation. */
export function isDevicePushTokenPath(path: string): boolean {
  return normalizePath(path) === '/auth/device/push-token';
}

/**
 * Chat send/read, Susu AI, and push-token POSTs must not flush Dashboard
 * / Circles / Activity persist keys. Financial and circle mutations still do.
 */
export function shouldInvalidateCachedGetsOnMutation(
  method: string,
  path: string,
): boolean {
  if (String(method || 'GET').toUpperCase() === 'GET') {
    return false;
  }
  if (isChatOrAssistantGet(path) || isDevicePushTokenPath(path)) {
    return false;
  }
  return true;
}

/**
 * Persist only list/summary/detail GETs that stampede across Dashboard,
 * Circles, Create, Completed, Activity, and workspace chrome.
 * Schedule may share an in-flight promise but is never stored.
 */
export function getHttpGetCachePolicy(path: string): HttpGetCachePolicy {
  const normalized = normalizePath(path);

  if (isChatOrAssistantGet(normalized)) {
    return { dedupe: false, persist: false };
  }

  if (isAuthoritativeFinancialGet(normalized)) {
    if (/^\/groups\/[^/]+\/schedule$/.test(normalized)) {
      return { dedupe: true, persist: false };
    }
    return { dedupe: false, persist: false };
  }

  if (
    normalized === '/groups' ||
    normalized === '/dashboard/summary' ||
    normalized === '/activity'
  ) {
    return { dedupe: true, persist: true };
  }
  if (/^\/groups\/[^/]+$/.test(normalized)) {
    return { dedupe: true, persist: true };
  }
  return { dedupe: false, persist: false };
}

/** Mutations are never cached. Only GET + policy.dedupe use this layer. */
export function shouldUseHttpGetCache(method: string, path: string): boolean {
  if (String(method || 'GET').toUpperCase() !== 'GET') {
    return false;
  }
  return getHttpGetCachePolicy(path).dedupe;
}

export function isCachedGetAuthoritative(): false {
  return false;
}

export function isHttpGetCacheExpired(
  storedAt: number,
  now: number = Date.now(),
  ttlMs: number = HTTP_GET_CACHE_TTL_MS,
): boolean {
  return !Number.isFinite(storedAt) || now - storedAt > ttlMs;
}

function cloneJson<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Successful mutations bump this so late GETs cannot persist or be joined. */
export function invalidateCachedGets(): void {
  epoch += 1;
  cache.clear();
  inflight.clear();
}

export function resetHttpGetCacheForTests(): void {
  epoch = 0;
  cache.clear();
  inflight.clear();
}

export function readCachedGet<T>(
  path: string,
  token: string | undefined,
  now: number = Date.now(),
): T | undefined {
  const policy = getHttpGetCachePolicy(path);
  if (!policy.persist) {
    return undefined;
  }
  const entry = cache.get(httpGetCacheKey(path, token));
  if (!entry || isHttpGetCacheExpired(entry.storedAt, now)) {
    if (entry) {
      cache.delete(httpGetCacheKey(path, token));
    }
    return undefined;
  }
  return cloneJson(entry.value) as T;
}

export async function runDedupedGet<T>(input: {
  path: string;
  token?: string;
  fetcher: () => Promise<T>;
  now?: number;
  /** Skip persist hit; fetch fresh; write persist if policy allows. */
  revalidate?: boolean;
  /** Skip persist and in-flight sharing. Always hit the network. */
  bypass?: boolean;
}): Promise<T> {
  const policy = getHttpGetCachePolicy(input.path);
  const now = input.now ?? Date.now();
  const key = httpGetCacheKey(input.path, input.token);

  if (input.bypass) {
    return cloneJson(await input.fetcher());
  }

  if (policy.persist && !input.revalidate) {
    const hit = readCachedGet<T>(input.path, input.token, now);
    if (hit !== undefined) {
      return hit;
    }
  }

  const existing = inflight.get(key);
  if (existing) {
    return cloneJson(await existing) as T;
  }

  const startedEpoch = epoch;
  const pending = input.fetcher().then((value) => {
    if (policy.persist && startedEpoch === epoch) {
      cache.set(key, {
        storedAt: now,
        epoch: startedEpoch,
        value: cloneJson(value),
      });
    }
    return value;
  });
  inflight.set(key, pending);

  try {
    return cloneJson(await pending) as T;
  } finally {
    if (inflight.get(key) === pending) {
      inflight.delete(key);
    }
  }
}
