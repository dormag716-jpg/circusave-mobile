/**
 * Password recovery started from the App Locked screen.
 *
 * It reuses the Security screen's reset flow: email a code, stage the code
 * entry, then sign out so the login screen opens on the code step. Nothing here
 * runs until the person confirms, and every failure leaves the app locked and
 * signed in.
 */
import { ApiError } from '../platform/networkErrors';

export type LockScreenRecoveryOutcome =
  | 'ready'
  | 'no_email'
  | 'rate_limited'
  | 'network'
  | 'failed';

export async function requestLockScreenRecovery(input: {
  email: string | null | undefined;
  requestPasswordReset: (input: { email: string }) => Promise<{ accepted: boolean }>;
  stagePasswordResetCodeEntry: (email: string) => void;
}): Promise<LockScreenRecoveryOutcome> {
  const email = (input.email ?? '').trim();
  if (!email) {
    return 'no_email';
  }
  try {
    const result = await input.requestPasswordReset({ email });
    if (!result.accepted) {
      return 'failed';
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.category === 'http_429') {
        return 'rate_limited';
      }
      if (
        error.category === 'offline' ||
        error.category === 'timeout' ||
        error.category === 'cancelled'
      ) {
        return 'network';
      }
    }
    return 'failed';
  }
  input.stagePasswordResetCodeEntry(email);
  return 'ready';
}

/**
 * Runs recovery after the person confirmed. Signs out only when the code was
 * sent and staged; any other outcome leaves the lock screen in place.
 */
export async function continueLockScreenRecovery(input: {
  email: string | null | undefined;
  requestPasswordReset: (input: { email: string }) => Promise<{ accepted: boolean }>;
  stagePasswordResetCodeEntry: (email: string) => void;
  signOut: () => Promise<void>;
}): Promise<LockScreenRecoveryOutcome> {
  const outcome = await requestLockScreenRecovery(input);
  if (outcome === 'ready') {
    await input.signOut();
  }
  return outcome;
}

export type LockScreenRecoveryResult = LockScreenRecoveryOutcome | 'canceled';

/**
 * Full recovery: confirm first, then send the code and sign out. Declining the
 * confirmation does nothing at all, so the app stays locked and signed in.
 */
export async function runLockScreenRecovery(input: {
  email: string | null | undefined;
  confirm: () => Promise<boolean>;
  requestPasswordReset: (input: { email: string }) => Promise<{ accepted: boolean }>;
  stagePasswordResetCodeEntry: (email: string) => void;
  signOut: () => Promise<void>;
}): Promise<LockScreenRecoveryResult> {
  if (!(input.email ?? '').trim()) {
    return 'no_email';
  }
  if (!(await input.confirm())) {
    return 'canceled';
  }
  return continueLockScreenRecovery(input);
}
