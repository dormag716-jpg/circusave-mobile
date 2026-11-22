import { notifyUnauthorizedSession, shouldHandleUnauthorizedSession } from '../auth/sessionExpiry';
import { invalidateCachedGets, runDedupedGet, shouldInvalidateCachedGetsOnMutation, shouldUseHttpGetCache } from '../platform/httpGetCache';
import { HTTP_JSON_TIMEOUT_MS, runWithTimeout } from '../platform/httpTimeout';
import { ApiError, classifyFetchFailure, classifyHttpStatus, fallbackNetworkMessage, parseRetryAfterHeader, readBackendErrorText, sanitizeUserFacingMessage } from '../platform/networkErrors';

export function getApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '');

  if (!configured) {
    throw new ApiError(
      fallbackNetworkMessage('unknown'),
      0,
      undefined,
      { category: 'unknown' },
    );
  }

  return configured.endsWith('/api') ? configured : `${configured}/api`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readString(value: unknown) {
  return String(value ?? '').trim();
}

/**
 * Copy optional nullable string fields from a backend user payload without
 * inventing empty strings. Absent keys stay undefined; explicit null stays null.
 */
function readOptionalNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

export function errorMessage(
  payload: unknown,
  status: number,
  retryAfterSeconds?: number | null,
) {
  const category = classifyHttpStatus(status);
  if (category === 'http_429') {
    return fallbackNetworkMessage(category, retryAfterSeconds);
  }
  return sanitizeUserFacingMessage(
    readBackendErrorText(payload),
    category,
    retryAfterSeconds,
  );
}

export function readRetryAfter(response: Response): number | null {
  const headers = response.headers;
  if (!headers || typeof headers.get !== 'function') {
    return null;
  }
  return parseRetryAfterHeader(
    headers.get('Retry-After') ?? headers.get('retry-after'),
  );
}

export function throwIfUnauthorized(path: string, hasToken: boolean, status: number) {
  if (shouldHandleUnauthorizedSession({ path, hasToken, status })) {
    void notifyUnauthorizedSession();
  }
}

const DEV_API_LOG_REDACTED = '[redacted]';

// Shared with lib/platform/errorLogging.ts so any place that logs API-shaped data
// redacts the same set of PII / financial / auth-ish key names.
export const SENSITIVE_LOG_KEY_PATTERN =
  /token|auth|session|password|secret|email|phone|name|user|member|recipient|payment|contribution|wallet|stripe|bank|card|account|circle/i;

const SENSITIVE_LOG_VALUE_PATTERN =
  /(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+|Bearer\s+[A-Za-z0-9._\-]+/i;

function redactSensitiveLogValue(value: string): string {
  if (!value) {
    return value;
  }
  if (SENSITIVE_LOG_VALUE_PATTERN.test(value)) {
    return DEV_API_LOG_REDACTED;
  }
  return value;
}

function redactDevApiLogValue(value: unknown, isRoot: boolean): unknown {
  if (typeof value === 'string') {
    return isRoot ? DEV_API_LOG_REDACTED : redactSensitiveLogValue(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactDevApiLogValue(entry, false));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        SENSITIVE_LOG_KEY_PATTERN.test(key)
          ? DEV_API_LOG_REDACTED
          : redactDevApiLogValue(entryValue, false),
      ]),
    );
  }
  return value;
}

/** Never emit raw response text. Objects are key-redacted; string bodies are dropped. */
export function redactDevApiLogBody(value: unknown): unknown {
  return redactDevApiLogValue(value, true);
}

function logDevApiResponse(method: string, url: string, status: number, body: unknown) {
  if (!__DEV__) {
    return;
  }
  console.log('[CircuSave API]', {
    method,
    url,
    status,
    body: url.includes('/billing/google-play/')
      ? DEV_API_LOG_REDACTED
      : redactDevApiLogBody(body),
  });
}

export type ApiGetOptions = {
  /** Skip persist hit; fetch fresh; write persist if policy allows. */
  revalidate?: boolean;
};

type JsonRequestOptions = RequestInit & {
  token?: string;
  revalidate?: boolean;
  timeoutMs?: number;
};

async function requestJsonUncached<T>(
  path: string,
  options: JsonRequestOptions = {},
): Promise<T> {
  const {
    token,
    headers: providedHeaders,
    revalidate: _revalidate,
    timeoutMs,
    signal,
    ...requestOptions
  } = options;
  const headers = new Headers(providedHeaders);
  headers.set('Accept', 'application/json');
  headers.set('X-CircuSave-Client', 'mobile');
  headers.set('Origin', 'circusave-mobile');

  if (requestOptions.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const method = (requestOptions.method ?? 'GET').toUpperCase();
  const url = `${getApiBaseUrl()}${path}`;
  let response: Response;
  try {
    response = await runWithTimeout(
      (timedSignal) =>
        fetch(url, {
          ...requestOptions,
          signal: timedSignal,
          headers,
        }),
      {
        timeoutMs: timeoutMs ?? HTTP_JSON_TIMEOUT_MS,
        signal,
      },
    );
  } catch (error) {
    const category = classifyFetchFailure(error);
    throw new ApiError(fallbackNetworkMessage(category), 0, undefined, {
      category,
    });
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = text;
  }

  logDevApiResponse(method, url, response.status, payload ?? text);

  if (!response.ok) {
    const retryAfterSeconds = readRetryAfter(response);
    throwIfUnauthorized(path, Boolean(token), response.status);
    throw new ApiError(
      errorMessage(payload, response.status, retryAfterSeconds),
      response.status,
      payload,
      {
        retryAfterSeconds,
      },
    );
  }

  return payload as T;
}

export async function requestJson<T>(
  path: string,
  options: JsonRequestOptions = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  if (shouldUseHttpGetCache(method, path)) {
    return runDedupedGet({
      path,
      token: options.token,
      fetcher: () => requestJsonUncached<T>(path, options),
      revalidate: options.revalidate === true,
    });
  }
  const payload = await requestJsonUncached<T>(path, options);
  if (shouldInvalidateCachedGetsOnMutation(method, path)) {
    invalidateCachedGets();
  }
  return payload;
}
