/**
 * Auth readiness for Activity screen loads.
 * Logout / unauthenticated transitions are normal — not load errors.
 */

export type ActivityAuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error'
  | string
  | null
  | undefined;

/**
 * True only when the screen should call authenticated Activity APIs.
 * Missing token or non-authenticated status → quiet skip (no error, no fetch).
 */
export function shouldLoadActivity(input: {
  status?: ActivityAuthStatus;
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
