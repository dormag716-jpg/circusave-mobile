import { readFileSync } from 'fs';
import path from 'path';

import { shouldCoverSignedOutRoute } from '../auth/authBoundary';
import { runLockScreenRecovery } from '../auth/lockScreenRecovery';
import {
  acknowledgePasswordResetCodeEntry,
  readFreshPasswordResetCodeEntry,
  stagePasswordResetCodeEntry,
} from '../auth/passwordResetEntry';
import {
  INITIAL_DEVICE_LOCK,
  deviceLockCoversProtectedContent,
  reduceDeviceLock,
  type DeviceLockModel,
} from '../platform/deviceLockState';
import { ApiError } from '../platform/networkErrors';

/**
 * Regression: App Locked -> Send code -> sign-out -> Recover access.
 *
 * This walks the same pieces the app wires together: the lock reducer, the
 * signed-out route cover, the staged recovery step and runLockScreenRecovery.
 * The cover rule is the one DeviceLock.tsx renders (a source guard below keeps
 * the two in step).
 */

const SESSION = 'user-1:session-1';
const PRIVATE_ROUTE = '/(tabs)/circles';
const LOGIN_ROUTE = '/login';

function lockedModel(): DeviceLockModel {
  const identified = reduceDeviceLock(INITIAL_DEVICE_LOCK, {
    type: 'auth_status',
    status: 'authenticated',
    sessionKey: SESSION,
  });
  return reduceDeviceLock(identified, {
    type: 'preferences',
    appLockEnabled: true,
    biometricUnlockEnabled: false,
  });
}

/** Same rule as DeviceLock.tsx: cover while locked, or signed out on a private route. */
function coverVisible(model: DeviceLockModel, pathname: string): boolean {
  return (
    deviceLockCoversProtectedContent(model) ||
    (model.phase === 'signed_out' && shouldCoverSignedOutRoute(pathname))
  );
}

afterEach(() => {
  acknowledgePasswordResetCodeEntry();
});

describe('App Locked -> Send code -> sign-out -> Recover access', () => {
  it('keeps private screens covered at every step of the transition', async () => {
    let model = lockedModel();
    let pathname = PRIVATE_ROUTE;
    const covered: Array<[string, boolean]> = [];
    const note = (step: string) => covered.push([step, coverVisible(model, pathname)]);
    const log: string[] = [];

    note('locked');
    expect(model.phase).toBe('locked');

    const outcome = await runLockScreenRecovery({
      email: 'member@example.com',
      confirm: async () => true,
      requestPasswordReset: async () => {
        log.push('request');
        note('code requested, still locked');
        return { accepted: true };
      },
      stagePasswordResetCodeEntry: (email) => {
        stagePasswordResetCodeEntry(email);
        log.push('stage');
        note('recovery step saved, still locked');
      },
      signOut: async () => {
        log.push('signOut');
        // Session is cleared: the lock model sees the unauthenticated status
        // while the private route is still mounted.
        model = reduceDeviceLock(model, { type: 'auth_status', status: 'unauthenticated' });
        note('signed out, private route still mounted');
      },
    });
    expect(outcome).toBe('ready');

    // The router then resets to login; only now is the cover allowed to drop.
    pathname = LOGIN_ROUTE;
    note('login route (Recover access) shown');

    expect(log).toEqual(['request', 'stage', 'signOut']);
    expect(covered).toEqual([
      ['locked', true],
      ['code requested, still locked', true],
      ['recovery step saved, still locked', true],
      ['signed out, private route still mounted', true],
      ['login route (Recover access) shown', false],
    ]);
    // Recover access is on the code step, with no second email request.
    expect(readFreshPasswordResetCodeEntry()?.email).toBe('member@example.com');
  });

  it('covers every private route while signed out, and only public ones are open', () => {
    const signedOut = reduceDeviceLock(lockedModel(), {
      type: 'auth_status',
      status: 'unauthenticated',
    });
    for (const route of [
      '/(tabs)/dashboard',
      '/(tabs)/circles',
      '/(tabs)/activity',
      '/(tabs)/settings',
      '/circle/abc',
      '/circle/abc/history',
      '/security',
    ]) {
      expect(coverVisible(signedOut, route)).toBe(true);
    }
    expect(coverVisible(signedOut, LOGIN_ROUTE)).toBe(false);
  });

  it('signs out only after the recovery step is saved', async () => {
    const calls: string[] = [];
    let staged: string | null = null;
    await runLockScreenRecovery({
      email: 'member@example.com',
      confirm: async () => true,
      requestPasswordReset: async () => ({ accepted: true }),
      stagePasswordResetCodeEntry: (email) => {
        staged = email;
        calls.push('stage');
      },
      signOut: async () => {
        // The step must already be saved at the moment sign-out starts.
        expect(staged).toBe('member@example.com');
        calls.push('signOut');
      },
    });
    expect(calls).toEqual(['stage', 'signOut']);
  });

  it('does not sign out, stage or uncover anything when the person cancels', async () => {
    const model = lockedModel();
    const signOut = jest.fn(async () => undefined);
    const request = jest.fn(async () => ({ accepted: true }));
    const outcome = await runLockScreenRecovery({
      email: 'member@example.com',
      confirm: async () => false,
      requestPasswordReset: request,
      stagePasswordResetCodeEntry,
      signOut,
    });

    expect(outcome).toBe('canceled');
    expect(request).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(readFreshPasswordResetCodeEntry()).toBeNull();
    expect(model.phase).toBe('locked');
    expect(coverVisible(model, PRIVATE_ROUTE)).toBe(true);
  });

  it.each([
    ['the request is not accepted', async () => ({ accepted: false })],
    [
      'the server errors',
      async (): Promise<{ accepted: boolean }> => {
        throw new ApiError('boom', 500, undefined, { category: 'http_5xx' });
      },
    ],
    [
      'the phone is offline',
      async (): Promise<{ accepted: boolean }> => {
        throw new ApiError('offline', 0, undefined, { category: 'offline' });
      },
    ],
    [
      'the person is rate limited',
      async (): Promise<{ accepted: boolean }> => {
        throw new ApiError('slow down', 429, undefined, { category: 'http_429' });
      },
    ],
  ])('leaves the app locked and covered when %s', async (_name, request) => {
    const model = lockedModel();
    const signOut = jest.fn(async () => undefined);
    const stage = jest.fn();
    const outcome = await runLockScreenRecovery({
      email: 'member@example.com',
      confirm: async () => true,
      requestPasswordReset: request,
      stagePasswordResetCodeEntry: stage,
      signOut,
    });

    expect(outcome).not.toBe('ready');
    expect(stage).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(readFreshPasswordResetCodeEntry()).toBeNull();
    expect(model.phase).toBe('locked');
    expect(coverVisible(model, PRIVATE_ROUTE)).toBe(true);
  });

  it('does not sign out if saving the recovery step throws', async () => {
    const signOut = jest.fn(async () => undefined);
    const outcome = runLockScreenRecovery({
      email: 'member@example.com',
      confirm: async () => true,
      requestPasswordReset: async () => ({ accepted: true }),
      stagePasswordResetCodeEntry: () => {
        throw new Error('storage failed');
      },
      signOut,
    });
    await expect(outcome).rejects.toThrow('storage failed');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('keeps DeviceLock.tsx on the same cover rule and the confirmed recovery path', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'components', 'DeviceLock.tsx'),
      'utf8',
    );
    expect(source).toMatch(
      /const coverVisible\s*=\s*coverLocked\s*\|\|\s*coverSignedOut/,
    );
    expect(source).toMatch(
      /model\.phase === 'signed_out' &&\s*shouldCoverSignedOutRoute\(pathname\)/,
    );
    expect(source).toContain('runLockScreenRecovery');
    expect(source).not.toMatch(/signOut\s*\(/);
  });
});
