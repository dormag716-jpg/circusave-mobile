import { readFileSync } from 'fs';
import path from 'path';

import {
  focusReloadOptions,
  isPublicUnauthenticatedRoute,
  ledgerActionForNavigation,
  loginHardwareBackAction,
  navigationMayMutateMoney,
  resetNavigationToLogin,
  shouldCoverSignedOutRoute,
  shouldDeferProtectedNavigation,
  shouldIssueSignedOutReset,
  shouldResetSignedOutProtectedRoute,
} from '../authBoundary';

describe('auth boundary', () => {
  it('exits from Login instead of revealing a protected screen', () => {
    expect(loginHardwareBackAction()).toBe('exit_app');
    const login = readFileSync(path.join(__dirname, '..', '..', 'app', 'login.tsx'), 'utf8');
    const layout = readFileSync(path.join(__dirname, '..', '..', 'app', '_layout.tsx'), 'utf8');
    expect(login).toContain('BackHandler.exitApp()');
    expect(login).toContain('loginHardwareBackAction');
    expect(layout).toContain('gestureEnabled: false');
  });

  it('resets protected history to Login on logout', () => {
    const calls: string[] = [];
    resetNavigationToLogin({
      canDismiss: () => true,
      dismissAll: () => {
        calls.push('dismissAll');
      },
      replace: (href) => {
        calls.push(href);
      },
    });
    expect(calls).toEqual(['dismissAll', '/login']);

    const onlyReplace: string[] = [];
    resetNavigationToLogin({
      canDismiss: () => false,
      dismissAll: () => {
        onlyReplace.push('dismissAll');
      },
      replace: (href) => {
        onlyReplace.push(href);
      },
    });
    expect(onlyReplace).toEqual(['/login']);
  });

  it('keeps a signed-out protected route covered until Login is showing', () => {
    expect(isPublicUnauthenticatedRoute('/login')).toBe(true);
    expect(isPublicUnauthenticatedRoute('/create-account')).toBe(true);
    expect(isPublicUnauthenticatedRoute('/legal/privacy')).toBe(true);
    expect(isPublicUnauthenticatedRoute('/invite/circle-1')).toBe(true);
    expect(shouldCoverSignedOutRoute('/(tabs)/dashboard')).toBe(true);
    expect(shouldCoverSignedOutRoute('/circle/workspace')).toBe(true);
    expect(shouldCoverSignedOutRoute('/payment/contribution')).toBe(true);
    expect(shouldCoverSignedOutRoute('/login')).toBe(false);
  });

  it('does not follow notifications or deep-link targets through the lock', () => {
    expect(shouldDeferProtectedNavigation({ locked: true, initializing: false })).toBe(true);
    expect(shouldDeferProtectedNavigation({ locked: false, initializing: true })).toBe(true);
    expect(shouldDeferProtectedNavigation({ locked: false, initializing: false })).toBe(false);

    const layout = readFileSync(path.join(__dirname, '..', '..', 'app', '_layout.tsx'), 'utf8');
    expect(layout).toContain('shouldDeferProtectedNavigation');
    expect(layout).toContain('resetNavigationToLogin');
    expect(layout).toContain('UnauthenticatedRouteGuard');
    expect(layout).toContain('shouldIssueSignedOutReset');
    expect(layout).toContain('usePathname');
  });

  it('reloads authoritative data on focus and never mutates it for back or lock', () => {
    expect(ledgerActionForNavigation('focus')).toBe('reload_authoritative');
    expect(ledgerActionForNavigation('back')).toBe('none');
    expect(ledgerActionForNavigation('lock')).toBe('none');
    expect(ledgerActionForNavigation('unlock')).toBe('none');
    expect(navigationMayMutateMoney('focus')).toBe(false);
    expect(navigationMayMutateMoney('back')).toBe(false);
    expect(navigationMayMutateMoney('lock')).toBe(false);
    expect(navigationMayMutateMoney('unlock')).toBe(false);
    expect(focusReloadOptions(false)).toEqual({ silent: false, revalidate: false });
    expect(focusReloadOptions(true)).toEqual({ silent: true, revalidate: true });
  });

  it('sends an unauthenticated cold start to Login', () => {
    const index = readFileSync(path.join(__dirname, '..', '..', 'app', 'index.tsx'), 'utf8');
    expect(index).toContain('href="/login"');
    expect(index).not.toContain('landing.headline');
  });

  it('focus-refreshes the workspace, dashboard, circles, and activity ledgers', () => {
    const workspace = readFileSync(
      path.join(__dirname, '..', '..', 'app', 'circle', 'workspace.tsx'),
      'utf8',
    );
    const dashboard = readFileSync(
      path.join(__dirname, '..', '..', 'app', '(tabs)', 'dashboard.tsx'),
      'utf8',
    );
    const circles = readFileSync(
      path.join(__dirname, '..', '..', 'app', '(tabs)', 'circles.tsx'),
      'utf8',
    );
    const activity = readFileSync(
      path.join(__dirname, '..', '..', 'app', '(tabs)', 'activity.tsx'),
      'utf8',
    );
    const contribution = readFileSync(
      path.join(__dirname, '..', '..', 'app', 'payment', 'contribution.tsx'),
      'utf8',
    );
    expect(workspace).toContain('useFocusEffect');
    expect(workspace).toContain('revalidate: true');
    expect(workspace).toContain('ledgerActionForNavigation');
    expect(dashboard).toContain('focusReloadOptions');
    expect(circles).toContain('focusReloadOptions');
    expect(activity).toContain('focusReloadOptions');
    expect(contribution).toContain('router.replace(circleWorkspaceHref');
    expect(contribution).not.toMatch(/undoContribution|reverseTransaction|deleteContribution/);
  });

  it('resets a signed-out protected deep link to Login once', () => {
    expect(
      shouldResetSignedOutProtectedRoute({
        status: 'unauthenticated',
        pathname: '/circle/workspace',
      }),
    ).toBe(true);
    expect(
      shouldResetSignedOutProtectedRoute({
        status: 'error',
        pathname: '/(tabs)/dashboard',
      }),
    ).toBe(true);
    expect(
      shouldResetSignedOutProtectedRoute({
        status: 'loading',
        pathname: '/circle/workspace',
      }),
    ).toBe(false);
    expect(
      shouldResetSignedOutProtectedRoute({
        status: 'authenticated',
        pathname: '/payment/contribution',
      }),
    ).toBe(false);

    const first = shouldIssueSignedOutReset({
      status: 'unauthenticated',
      pathname: '/circle/workspace?tab=round',
      lastResetKey: null,
    });
    expect(first).toEqual({
      reset: true,
      nextKey: 'unauthenticated:/circle/workspace',
    });
    const calls: string[] = [];
    if (first.reset) {
      resetNavigationToLogin({
        canDismiss: () => true,
        dismissAll: () => {
          calls.push('dismissAll');
        },
        replace: (href) => {
          calls.push(href);
        },
      });
    }
    expect(calls).toEqual(['dismissAll', '/login']);

    expect(
      shouldIssueSignedOutReset({
        status: 'unauthenticated',
        pathname: '/circle/workspace',
        lastResetKey: first.nextKey,
      }).reset,
    ).toBe(false);
  });

  it('leaves signed-out public invite, legal, and create-account routes alone', () => {
    for (const pathname of [
      '/',
      '/login',
      '/create-account',
      '/join-circle',
      '/invite',
      '/invite/circle-1',
      '/legal',
      '/legal/privacy',
      '/+not-found',
      '+not-found',
    ]) {
      expect(shouldResetSignedOutProtectedRoute({
        status: 'unauthenticated',
        pathname,
      })).toBe(false);
      expect(
        shouldIssueSignedOutReset({
          status: 'unauthenticated',
          pathname,
          lastResetKey: null,
        }),
      ).toEqual({ reset: false, nextKey: null });
    }
  });

  it('clears protected history on logout and does not loop on Login', () => {
    const logout = shouldIssueSignedOutReset({
      status: 'unauthenticated',
      pathname: '/(tabs)/settings',
      lastResetKey: null,
    });
    expect(logout.reset).toBe(true);
    const calls: string[] = [];
    resetNavigationToLogin({
      canDismiss: () => true,
      dismissAll: () => {
        calls.push('dismissAll');
      },
      replace: (href) => {
        calls.push(href);
      },
    });
    expect(calls).toEqual(['dismissAll', '/login']);

    expect(loginHardwareBackAction()).toBe('exit_app');
    expect(
      shouldIssueSignedOutReset({
        status: 'unauthenticated',
        pathname: '/login',
        lastResetKey: logout.nextKey,
      }),
    ).toEqual({ reset: false, nextKey: null });
    expect(
      shouldIssueSignedOutReset({
        status: 'error',
        pathname: '/login',
        lastResetKey: null,
      }).reset,
    ).toBe(false);
  });

  it('logout call sites reset navigation instead of only replacing the top route', () => {
    const settings = readFileSync(
      path.join(__dirname, '..', '..', 'app', '(tabs)', 'settings.tsx'),
      'utf8',
    );
    const security = readFileSync(path.join(__dirname, '..', '..', 'app', 'security.tsx'), 'utf8');
    expect(settings).toContain('resetNavigationToLogin(router)');
    expect(security).toContain('resetNavigationToLogin(router)');
    expect(security).not.toContain('<Switch');
    expect(security).not.toContain('setLockEnabled');
  });
});
