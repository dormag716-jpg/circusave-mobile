/**
 * Auth-boundary navigation. Logout must land on Login with no protected
 * screen underneath, and leaving a money screen must only re-read the ledger.
 */

export type LoginBackAction = 'exit_app';

export function loginHardwareBackAction(): LoginBackAction {
  return 'exit_app';
}

export type LoginResetRouter = {
  canDismiss: () => boolean;
  dismissAll: () => void;
  replace: (href: '/login') => void;
};

export function resetNavigationToLogin(router: LoginResetRouter): void {
  if (router.canDismiss()) {
    router.dismissAll();
  }
  router.replace('/login');
}

export function shouldDeferProtectedNavigation(input: {
  locked: boolean;
  initializing: boolean;
}): boolean {
  return input.locked || input.initializing;
}

const PUBLIC_EXACT = new Set([
  '/',
  '/login',
  '/create-account',
  '/join-circle',
  '/+not-found',
  '+not-found',
]);

const PUBLIC_PREFIXES = ['/legal', '/invite'];

export function isPublicUnauthenticatedRoute(pathname: string | null | undefined): boolean {
  const path = String(pathname || '/').split('?')[0] || '/';
  if (PUBLIC_EXACT.has(path)) {
    return true;
  }
  return PUBLIC_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function shouldCoverSignedOutRoute(pathname: string | null | undefined): boolean {
  return !isPublicUnauthenticatedRoute(pathname);
}

export type SignedOutRouteStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

/**
 * Signed-out users may stay on public screens. Every other route is sent
 * to Login. Authenticated users, including a locked session, are left alone.
 */
export function shouldResetSignedOutProtectedRoute(input: {
  status: SignedOutRouteStatus;
  pathname: string | null | undefined;
}): boolean {
  if (input.status !== 'unauthenticated' && input.status !== 'error') {
    return false;
  }
  return shouldCoverSignedOutRoute(input.pathname);
}

export function signedOutResetKey(input: {
  status: SignedOutRouteStatus;
  pathname: string | null | undefined;
}): string | null {
  if (!shouldResetSignedOutProtectedRoute(input)) {
    return null;
  }
  const path = String(input.pathname || '/').split('?')[0] || '/';
  return `${input.status}:${path}`;
}

/** One reset per signed-out protected path. Login itself never resets again. */
export function shouldIssueSignedOutReset(input: {
  status: SignedOutRouteStatus;
  pathname: string | null | undefined;
  lastResetKey: string | null;
}): { reset: boolean; nextKey: string | null } {
  const nextKey = signedOutResetKey(input);
  if (!nextKey || nextKey === input.lastResetKey) {
    return { reset: false, nextKey };
  }
  return { reset: true, nextKey };
}

export function focusReloadOptions(hasLastKnownState: boolean): {
  silent: boolean;
  revalidate: boolean;
} {
  const known = hasLastKnownState === true;
  return { silent: known, revalidate: known };
}

export type LedgerNavigationEvent = 'focus' | 'back' | 'lock' | 'unlock';

export function ledgerActionForNavigation(
  event: LedgerNavigationEvent,
): 'reload_authoritative' | 'none' {
  return event === 'focus' ? 'reload_authoritative' : 'none';
}

export function navigationMayMutateMoney(_event: LedgerNavigationEvent): boolean {
  return false;
}
