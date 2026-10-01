/**
 * Launch splash visibility. Keep the native splash up until the first real
 * screen can paint — not merely until fonts or i18n finish.
 */

export type LaunchAuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

export function shouldHideLaunchSplash(input: {
  authStatus: LaunchAuthStatus;
  deviceLockInitializing: boolean;
}): boolean {
  return !input.deviceLockInitializing && input.authStatus !== 'loading';
}
