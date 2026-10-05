/**
 * Auth-boundary navigation. Logout must land on Login with no protected
 * screen underneath, and leaving a money screen must only re-read the ledger.
 *
 * Sign-out resets the stack that owns Login. Popping to the first screen is
 * unhandled when that stack is already at index 0, which is the Expo Router
 * root slot during a normal sign-out. The reset is stored as-is, so it
 * includes preloadedRoutes. Native stack reduces that list on the next render.
 */

export type LoginBackAction = 'exit_app';

export function loginHardwareBackAction(): LoginBackAction {
  return 'exit_app';
}

export type LoginResetAction = {
  type: 'RESET';
  target?: string;
  payload: {
    stale?: false;
    type?: 'stack';
    key?: string;
    index: 0;
    routeNames?: string[];
    preloadedRoutes?: [];
    routes: [{ name: 'login' }];
  };
};

export function loginResetAction(): LoginResetAction {
  return {
    type: 'RESET',
    payload: {
      index: 0,
      routes: [{ name: 'login' }],
    },
  };
}

type LoginStackState = {
  key?: string;
  type?: string;
  index?: number;
  routeNames?: string[];
  routes?: { name: string; state?: LoginStackState }[];
};

function findLoginStack(state: LoginStackState | undefined): LoginStackState | null {
  if (!state?.routes) {
    return null;
  }
  if (state.type === 'stack' && state.key && state.routeNames?.includes('login')) {
    return state;
  }
  for (const route of state.routes) {
    const found = findLoginStack(route.state);
    if (found) {
      return found;
    }
  }
  return null;
}

export function loginStackResetAction(state: LoginStackState | undefined): LoginResetAction {
  const stack = findLoginStack(state);
  if (!stack?.key || !stack.routeNames) {
    return loginResetAction();
  }
  return {
    type: 'RESET',
    target: stack.key,
    payload: {
      stale: false,
      type: 'stack',
      key: stack.key,
      index: 0,
      routeNames: [...stack.routeNames],
      preloadedRoutes: [],
      routes: [{ name: 'login' }],
    },
  };
}

export type LoginResetHandle = {
  isReady: () => boolean;
  getRootState: () => LoginStackState;
  dispatch: (action: LoginResetAction) => void;
};

function liveLoginResetHandle(): LoginResetHandle | null {
  const expoRouter = require('expo-router') as {
    useNavigationContainerRef?: () => { current: LoginResetHandle | null };
  };
  const readRef = expoRouter.useNavigationContainerRef;
  if (typeof readRef !== 'function') {
    return null;
  }
  return readRef().current;
}

export function resetNavigationToLogin(navigation?: LoginResetHandle | null): void {
  const target = navigation === undefined ? liveLoginResetHandle() : navigation;
  if (!target?.isReady()) {
    return;
  }
  target.dispatch(loginStackResetAction(target.getRootState()));
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
