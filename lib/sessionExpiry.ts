/**
 * Mid-session 401 handling. AuthSessionProvider registers the real sign-out
 * path so API code never imports React navigation.
 *
 * Cold-start restore keeps a still-valid cached session on network failure
 * because only HTTP 401 with a bearer token triggers this interceptor.
 */

const EXEMPT_PATH_PREFIXES = [
  '/auth/mobile/login',
  '/auth/mobile/register',
  '/auth/forgot-password',
  '/auth/logout',
  '/auth/device/push-token',
];

export function isSessionExpiryExemptPath(path: string): boolean {
  const normalized = String(path || '').split('?')[0] || '';
  return EXEMPT_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function shouldHandleUnauthorizedSession(input: {
  path: string;
  hasToken: boolean;
  status: number;
}): boolean {
  return (
    input.status === 401 &&
    input.hasToken &&
    !isSessionExpiryExemptPath(input.path)
  );
}

type UnauthorizedSessionHandler = () => Promise<void> | void;

let handler: UnauthorizedSessionHandler | null = null;
let inFlight: Promise<void> | null = null;

export function registerUnauthorizedSessionHandler(
  next: UnauthorizedSessionHandler | null,
): () => void {
  handler = next;
  return () => {
    if (handler === next) {
      handler = null;
    }
  };
}

export function notifyUnauthorizedSession(): Promise<void> {
  if (inFlight) {
    return inFlight;
  }
  const run = handler;
  if (!run) {
    return Promise.resolve();
  }
  inFlight = Promise.resolve()
    .then(run)
    .then(() => undefined)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function resetUnauthorizedSessionHandlerForTests(): void {
  handler = null;
  inFlight = null;
}
