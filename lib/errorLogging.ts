/**
 * Centralized, PII-safe client error logging.
 *
 * Production-risk logging audit finding: several screens caught errors from
 * the API layer (which attach the full raw backend response body on
 * `ApiError.payload`) and passed them straight to `console.error(...)`.
 * Depending on the JS console formatter, that can print member/contribution/
 * wallet/payment details, emails, phone numbers, or session data.
 *
 * `logClientError` replaces those call sites. It only ever logs:
 *  - a short, static event label supplied by the caller,
 *  - the error's `message` string (never its raw payload/body/stack object),
 *  - an HTTP status code when the error came from the API layer, and
 *  - an optional, explicit `context` object of small values the caller
 *    passes on purpose (e.g. `{ circleId }`) — still redacted by key name as
 *    a safety net in case a sensitive key sneaks in.
 *
 * It never accepts or forwards an arbitrary object (member, recipient,
 * contribution, payment, Stripe object, backend response body, etc.).
 */
import { ApiError, SENSITIVE_LOG_KEY_PATTERN } from './api';

type LogContextValue = string | number | boolean | null | undefined;
export type LogContext = Record<string, LogContextValue>;

const REDACTED = '[redacted]';
const SENSITIVE_MESSAGE_PATTERN =
  /(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+|Bearer\s+[A-Za-z0-9._\-]+/gi;

export function sanitizeLogMessage(message: string): string {
  const trimmed = String(message || '').trim();
  if (!trimmed) {
    return 'Unknown error';
  }
  return trimmed.replace(SENSITIVE_MESSAGE_PATTERN, REDACTED);
}

function sanitizeContextValue(value: LogContextValue): LogContextValue {
  if (typeof value !== 'string') {
    return value;
  }
  return value.replace(SENSITIVE_MESSAGE_PATTERN, REDACTED);
}

function safeMessage(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeLogMessage(error.message || error.name || 'Unknown error');
  }
  if (typeof error === 'string') {
    return sanitizeLogMessage(error);
  }
  return 'Unknown error';
}

// Plain identifier fields (e.g. `circleId`, `memberId`, `recipientId`) are not
// sensitive on their own — they're opaque ids, not PII — even though their
// name contains a substring the broader sensitive-key pattern flags (e.g.
// "circle", "member"). Only redact by name for non-id fields.
const SAFE_ID_KEY_PATTERN = /Id$/;

function safeContext(context?: LogContext): LogContext | undefined {
  if (!context) {
    return undefined;
  }
  const entries = Object.entries(context).map(([key, value]) => [
    key,
    !SAFE_ID_KEY_PATTERN.test(key) && SENSITIVE_LOG_KEY_PATTERN.test(key)
      ? REDACTED
      : sanitizeContextValue(value),
  ]);
  return Object.fromEntries(entries) as LogContext;
}

/**
 * Log a caught error safely. `event` should be a short, static description
 * (no interpolated PII). `context` must only contain small identifiers the
 * caller explicitly chooses to include (e.g. a circle or recipient id) —
 * never a full object.
 */
export function logClientError(event: string, error: unknown, context?: LogContext): void {
  const status = error instanceof ApiError ? error.status : undefined;
  const detail: Record<string, unknown> = {
    message: safeMessage(error),
    ...(status !== undefined ? { status } : {}),
    ...(safeContext(context) ?? {}),
  };
  // eslint-disable-next-line no-console -- this is the sanctioned logging path.
  console.error(`[CircuSave] ${event}`, detail);
}

/** Same contract as logClientError but for non-error diagnostic warnings. */
export function logClientWarning(event: string, error: unknown, context?: LogContext): void {
  const status = error instanceof ApiError ? error.status : undefined;
  const detail: Record<string, unknown> = {
    message: safeMessage(error),
    ...(status !== undefined ? { status } : {}),
    ...(safeContext(context) ?? {}),
  };
  // eslint-disable-next-line no-console -- this is the sanctioned logging path.
  console.warn(`[CircuSave] ${event}`, detail);
}
