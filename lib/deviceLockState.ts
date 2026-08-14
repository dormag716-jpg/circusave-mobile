/**
 * Device lock AppState policy.
 * Biometric UI often goes active → inactive → active. That is not a resume.
 * Arm only after a real background, then lock once on the next active.
 */

export function shouldArmDeviceLockOnAppState(
  next: string | null | undefined,
): boolean {
  return String(next || '').trim() === 'background';
}

export function shouldLockOnAppForeground(input: {
  armed: boolean;
  next: string | null | undefined;
  lockEnabled: boolean;
  authenticating: boolean;
}): boolean {
  if (!input.lockEnabled || input.authenticating || input.armed !== true) {
    return false;
  }
  return String(input.next || '').trim() === 'active';
}
