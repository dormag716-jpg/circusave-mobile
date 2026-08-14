import { publicAuthStatusFromRestorePhase } from '../authSessionRestore';
import { shouldHideLaunchSplash } from '../launchSplash';

describe('shouldHideLaunchSplash', () => {
  it('keeps the splash while DeviceLock is still reading storage', () => {
    expect(
      shouldHideLaunchSplash({
        authStatus: 'authenticated',
        deviceLockInitializing: true,
      }),
    ).toBe(false);
  });

  it('keeps the splash while the session is still being restored', () => {
    expect(
      shouldHideLaunchSplash({
        authStatus: 'loading',
        deviceLockInitializing: false,
      }),
    ).toBe(false);
  });

  it('hides the splash for the first authenticated frame', () => {
    expect(
      shouldHideLaunchSplash({
        authStatus: 'authenticated',
        deviceLockInitializing: false,
      }),
    ).toBe(true);
  });

  it('hides the splash once a locally valid session is restored', () => {
    expect(
      shouldHideLaunchSplash({
        authStatus: publicAuthStatusFromRestorePhase('authenticated-local'),
        deviceLockInitializing: false,
      }),
    ).toBe(true);
    expect(
      shouldHideLaunchSplash({
        authStatus: publicAuthStatusFromRestorePhase('restoring'),
        deviceLockInitializing: false,
      }),
    ).toBe(false);
  });

  it('hides the splash for the unauthenticated landing', () => {
    expect(
      shouldHideLaunchSplash({
        authStatus: 'unauthenticated',
        deviceLockInitializing: false,
      }),
    ).toBe(true);
  });

  it('hides the splash on a session error so the landing can paint', () => {
    expect(
      shouldHideLaunchSplash({
        authStatus: 'error',
        deviceLockInitializing: false,
      }),
    ).toBe(true);
  });
});
