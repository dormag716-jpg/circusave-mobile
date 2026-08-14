import { readFileSync } from 'fs';
import path from 'path';

import {
  shouldArmDeviceLockOnAppState,
  shouldLockOnAppForeground,
} from '../deviceLockState';

describe('device lock AppState policy', () => {
  it('arms only after a real background, not inactive', () => {
    expect(shouldArmDeviceLockOnAppState('background')).toBe(true);
    expect(shouldArmDeviceLockOnAppState('inactive')).toBe(false);
    expect(shouldArmDeviceLockOnAppState('active')).toBe(false);
  });

  it('does not relock on biometric inactive → active', () => {
    expect(
      shouldLockOnAppForeground({
        armed: false,
        next: 'active',
        lockEnabled: true,
        authenticating: false,
      }),
    ).toBe(false);
  });

  it('locks once when returning from background while enabled', () => {
    expect(shouldArmDeviceLockOnAppState('background')).toBe(true);
    expect(
      shouldLockOnAppForeground({
        armed: true,
        next: 'active',
        lockEnabled: true,
        authenticating: false,
      }),
    ).toBe(true);
  });

  it('does not stack a prompt while authentication is in flight', () => {
    expect(
      shouldLockOnAppForeground({
        armed: true,
        next: 'active',
        lockEnabled: true,
        authenticating: true,
      }),
    ).toBe(false);
  });

  it('does not lock when the setting is off', () => {
    expect(
      shouldLockOnAppForeground({
        armed: true,
        next: 'active',
        lockEnabled: false,
        authenticating: false,
      }),
    ).toBe(false);
  });

  it('DeviceLock uses background-arm policy instead of inactive resume', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'components', 'DeviceLock.tsx'),
      'utf8',
    );
    expect(source).toMatch(/shouldArmDeviceLockOnAppState/);
    expect(source).toMatch(/shouldLockOnAppForeground/);
    expect(source).toMatch(/authenticatingRef/);
    expect(source).not.toMatch(/inactive\|background/);
  });
});
