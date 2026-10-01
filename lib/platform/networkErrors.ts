import {
  isAbortLikeError,
  isTimedRequestAbortError,
} from './httpTimeout';

export type NetworkErrorCategory =
  | 'offline'
  | 'cancelled'
  | 'timeout'
  | 'http_5xx'
  | 'http_429'
  | 'http_401'
  | 'http_4xx'
  | 'unknown';

export class ApiError extends Error {
  status: number;
  payload: unknown;
  category: NetworkErrorCategory;
  retryAfterSeconds: number | null;

  constructor(
    message: string,
    status: number,
    payload?: unknown,
    options?: {
      category?: NetworkErrorCategory;
      retryAfterSeconds?: number | null;
    },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.retryAfterSeconds =
      options?.retryAfterSeconds == null ? null : options.retryAfterSeconds;
    this.category =
      options?.category ??
      (status > 0 ? classifyHttpStatus(status) : 'unknown');
  }
}

export const HTTP_RETRY_AFTER_MAX_SECONDS = 3_600;
export const HTTP_RETRY_AFTER_MIN_SECONDS = 1;

const USER_SAFE_MESSAGE_MAX_LENGTH = 160;
const FRAMEWORK_TEXT_PATTERN =
  /\b(flask|werkzeug|jinja|traceback|gunicorn|sqlalchemy|psycopg|whitenoise)\b/i;
const HTML_PATTERN = /<\/?[a-z!][\s\S]*>/i;
const JSON_BODY_PATTERN = /^\s*[\[{]/;
const URL_OR_ENV_PATTERN =
  /https?:\/\/|EXPO_PUBLIC_|localhost|127\.0\.0\.1|0\.0\.0\.0|\/api\//i;
const SECRET_PATTERN =
  /(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+|Bearer\s+[A-Za-z0-9._\-]+/i;
const STACK_PATTERN = /\n\s+at\s+|File\s+".+\.py"/i;

const FALLBACK_MESSAGES: Record<NetworkErrorCategory, string> = {
  offline: "You're offline. Check your connection and try again.",
  cancelled: 'The request was cancelled.',
  timeout: 'The request took too long. Please try again.',
  http_5xx: 'Something went wrong. Please try again.',
  http_429: 'Too many attempts. Please wait and try again.',
  http_401: 'Your session expired. Please sign in again.',
  http_4xx: 'The request could not be completed. Please try again.',
  unknown: 'The request could not be completed. Please try again.',
};

export function fallbackNetworkMessage(
  category: NetworkErrorCategory,
  retryAfterSeconds?: number | null,
): string {
  if (category === 'http_429' && retryAfterSeconds && retryAfterSeconds > 0) {
    return `Too many attempts. Try again in ${retryAfterSeconds} seconds.`;
  }
  return FALLBACK_MESSAGES[category];
}

export function classifyHttpStatus(status: number): NetworkErrorCategory {
  if (status === 401) return 'http_401';
  if (status === 429) return 'http_429';
  if (status >= 500) return 'http_5xx';
  if (status >= 400) return 'http_4xx';
  return 'unknown';
}

export function classifyFetchFailure(error: unknown): NetworkErrorCategory {
  if (isTimedRequestAbortError(error)) {
    return error.outcome === 'timeout' ? 'timeout' : 'cancelled';
  }
  if (isAbortLikeError(error)) {
    return 'cancelled';
  }
  const message = error instanceof Error ? error.message : String(error || '');
  if (
    /network request failed|failed to fetch|load failed|internet connection|offline|networkerror/i.test(
      message,
    )
  ) {
    return 'offline';
  }
  return 'offline';
}

export function parseRetryAfterHeader(
  raw: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  const value = String(raw || '').trim();
  if (!value) {
    return null;
  }
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return null;
    }
    return clampRetryAfter(Math.floor(seconds));
  }
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) {
    return null;
  }
  const seconds = Math.ceil((dateMs - nowMs) / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return clampRetryAfter(seconds);
}

function clampRetryAfter(seconds: number): number {
  return Math.min(
    HTTP_RETRY_AFTER_MAX_SECONDS,
    Math.max(HTTP_RETRY_AFTER_MIN_SECONDS, seconds),
  );
}

export function isUnsafeUserFacingMessage(raw: string): boolean {
  const value = String(raw || '').trim();
  if (!value) return true;
  if (value.length > USER_SAFE_MESSAGE_MAX_LENGTH) return true;
  if (FRAMEWORK_TEXT_PATTERN.test(value)) return true;
  if (HTML_PATTERN.test(value)) return true;
  if (JSON_BODY_PATTERN.test(value)) return true;
  if (URL_OR_ENV_PATTERN.test(value)) return true;
  if (SECRET_PATTERN.test(value)) return true;
  if (STACK_PATTERN.test(value)) return true;
  return false;
}

export function sanitizeUserFacingMessage(
  raw: string | null | undefined,
  category: NetworkErrorCategory,
  retryAfterSeconds?: number | null,
): string {
  const value = String(raw || '').trim();
  if (!value || isUnsafeUserFacingMessage(value)) {
    return fallbackNetworkMessage(category, retryAfterSeconds);
  }
  return value;
}

export function readBackendErrorText(payload: unknown): string {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const message = String(record.error ?? record.message ?? '').trim();
    if (message) {
      return message;
    }
  }
  return '';
}

export type NetworkErrorCopy = {
  titleKey: string;
  bodyKey: string;
  params?: { count: number };
};

export function describeNetworkError(error: unknown): NetworkErrorCopy {
  const apiError = error instanceof ApiError ? error : null;
  const category =
    apiError?.category ??
    (error instanceof Error ? classifyFetchFailure(error) : 'unknown');
  const retryAfter = apiError?.retryAfterSeconds ?? null;

  if (category === 'offline') {
    return {
      titleKey: 'common:network.offlineTitle',
      bodyKey: 'common:network.offline',
    };
  }
  if (category === 'timeout') {
    return {
      titleKey: 'common:network.timeoutTitle',
      bodyKey: 'common:network.timeout',
    };
  }
  if (category === 'http_5xx') {
    return {
      titleKey: 'common:network.serverTitle',
      bodyKey: 'common:network.server',
    };
  }
  if (category === 'http_429') {
    if (retryAfter && retryAfter > 0) {
      return {
        titleKey: 'common:network.rateLimitedTitle',
        bodyKey: 'common:network.rateLimitedWait',
        params: { count: retryAfter },
      };
    }
    return {
      titleKey: 'common:network.rateLimitedTitle',
      bodyKey: 'common:network.rateLimited',
    };
  }
  return {
    titleKey: 'auth:common.genericErrorTitle',
    bodyKey: 'auth:common.genericErrorMessage',
  };
}

export function localizedNetworkErrorBody(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const copy = describeNetworkError(error);
  return t(copy.bodyKey, copy.params);
}
