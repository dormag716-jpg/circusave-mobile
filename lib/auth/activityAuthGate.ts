/**
 * Auth readiness for authenticated screens (Activity, dashboard, circles, etc.).
 * Logout / unauthenticated transitions are normal — not load errors.
 */

export type AuthLoadStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error'
  | string
  | null
  | undefined;

/** @deprecated Prefer AuthLoadStatus */
export type ActivityAuthStatus = AuthLoadStatus;

/**
 * True only when a screen should call authenticated APIs.
 * Missing token or non-authenticated status → quiet skip (no error, no fetch).
 */
export function shouldLoadAuthenticatedScreen(input: {
  status?: AuthLoadStatus;
  token?: string | null;
}): boolean {
  const token = String(input.token ?? '').trim();
  if (!token) {
    return false;
  }
  const status = input.status;
  // If status is known and not authenticated, never load (logout / bootstrap).
  if (status != null && status !== '' && status !== 'authenticated') {
    return false;
  }
  return true;
}

/** Alias used by Activity screen (backward compatible). */
export function shouldLoadActivity(input: {
  status?: AuthLoadStatus;
  token?: string | null;
}): boolean {
  return shouldLoadAuthenticatedScreen(input);
}

/** Pay/confirm/payout CTAs stay off without an authenticated session token. */
export function areMoneyActionsAvailable(input: {
  status?: AuthLoadStatus;
  token?: string | null;
}): boolean {
  return shouldLoadAuthenticatedScreen(input);
}
