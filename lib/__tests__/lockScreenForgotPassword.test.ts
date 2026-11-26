import { readFileSync } from 'fs';
import path from 'path';

import { runLockScreenRecovery } from '../auth/lockScreenRecovery';
import { verifyAccountPassword } from '../platform/deviceLockPassword';
import {
  INITIAL_DEVICE_LOCK,
  reduceDeviceLock,
  shouldOfferPasswordRecovery,
  type DeviceLockModel,
} from '../platform/deviceLockState';
import { ApiError } from '../platform/networkErrors';

const SESSION = 'user-1:session-1';

function lockedModel(): DeviceLockModel {
  const identified = reduceDeviceLock(INITIAL_DEVICE_LOCK, {
    type: 'auth_status',
    status: 'authenticated',
    sessionKey: SESSION,
  });
  const ready = reduceDeviceLock(identified, {
    type: 'preferences',
    appLockEnabled: true,
    biometricUnlockEnabled: true,
  });
  return { ...ready, passwordFallback: true };
}

function attempt(
  model: DeviceLockModel,
  result: 'success' | 'rejected' | 'failed',
  attemptId: number,
): DeviceLockModel {
  const submitting = reduceDeviceLock(model, {
    type: 'password_submitted',
    attemptId,
    sessionKey: SESSION,
  });
  return reduceDeviceLock(submitting, {
    type: 'password_result',
    result,
    attemptId,
    sessionKey: SESSION,
    appState: 'active',
  });
}

function rejectedTimes(count: number): DeviceLockModel {
  let model = lockedModel();
  for (let i = 1; i <= count; i += 1) {
    model = attempt(model, 'rejected', i);
  }
  return model;
}

describe('Forgot password? on the lock screen', () => {
  it('stays hidden after the first and second incorrect password', () => {
    expect(shouldOfferPasswordRecovery(lockedModel())).toBe(false);
    expect(shouldOfferPasswordRecovery(rejectedTimes(1))).toBe(false);
    expect(shouldOfferPasswordRecovery(rejectedTimes(2))).toBe(false);
  });

  it('appears after the third incorrect password and stays for the lock session', () => {
    let model = rejectedTimes(3);
    expect(shouldOfferPasswordRecovery(model)).toBe(true);
    model = attempt(model, 'rejected', 4);
    expect(shouldOfferPasswordRecovery(model)).toBe(true);
    model = attempt(model, 'failed', 5);
    expect(shouldOfferPasswordRecovery(model)).toBe(true);
    model = reduceDeviceLock(model, { type: 'retry_biometric' });
    expect(shouldOfferPasswordRecovery(model)).toBe(true);
  });

  it('does not count network or server failures', () => {
    let model = lockedModel();
    for (let i = 1; i <= 5; i += 1) {
      model = attempt(model, 'failed', i);
    }
    expect(model.wrongPasswordAttempts).toBe(0);
    expect(shouldOfferPasswordRecovery(model)).toBe(false);
  });

  it('keeps the count across an unconfirmed failure', () => {
    let model = rejectedTimes(2);
    model = attempt(model, 'failed', 3);
    expect(model.wrongPasswordAttempts).toBe(2);
    expect(shouldOfferPasswordRecovery(model)).toBe(false);
    model = attempt(model, 'rejected', 4);
    expect(shouldOfferPasswordRecovery(model)).toBe(true);
  });

  it('resets the count after a successful unlock', () => {
    const opened = attempt(rejectedTimes(3), 'success', 4);
    expect(opened.phase).toBe('unlocked');
    expect(opened.wrongPasswordAttempts).toBe(0);
    expect(shouldOfferPasswordRecovery(opened)).toBe(false);
  });

  it('starts from zero in a new lock session', () => {
    const opened = attempt(rejectedTimes(3), 'success', 4);
    const away = reduceDeviceLock(opened, { type: 'app_state', next: 'background', now: 1_000 });
    const back = reduceDeviceLock(away, { type: 'app_state', next: 'active', now: 20_000 });
    expect(back.phase).toBe('locked');
    expect(back.wrongPasswordAttempts).toBe(0);
    expect(shouldOfferPasswordRecovery(back)).toBe(false);
  });

  it('resets on sign-out', () => {
    const out = reduceDeviceLock(rejectedTimes(3), { type: 'sign_out' });
    expect(out.wrongPasswordAttempts).toBe(0);
    expect(shouldOfferPasswordRecovery(out)).toBe(false);
  });

  it('is rendered only when the model offers it', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'components', 'DeviceLock.tsx'),
      'utf8',
    );
    expect(source).toMatch(/shouldOfferPasswordRecovery\(model\)\s*\?/);
    expect(source).toContain('outcome = result;');
  });
});

describe('account password proof: confirmed wrong password', () => {
  const base = {
    email: 'ada@example.com',
    password: 'wrong-password',
    expectedUserId: 'usr_1',
    revokeVerificationSession: async () => undefined,
  };

  it('reports rejected only when the server answers 401', async () => {
    await expect(
      verifyAccountPassword({
        ...base,
        login: async () => {
          throw new ApiError('Email or password is incorrect.', 401, undefined, {
            category: 'http_401',
          });
        },
      }),
    ).resolves.toBe('rejected');
  });

  it.each([
    ['offline', 0, 'offline'],
    ['timeout', 0, 'timeout'],
    ['server error', 500, 'http_5xx'],
    ['rate limit', 429, 'http_429'],
  ] as const)('reports failed, not rejected, on %s', async (_name, status, category) => {
    await expect(
      verifyAccountPassword({
        ...base,
        login: async () => {
          throw new ApiError('nope', status, undefined, { category });
        },
      }),
    ).resolves.toBe('failed');
  });
});

describe('canceling lock screen recovery', () => {
  function deps() {
    return {
      requestPasswordReset: jest.fn(async () => ({ accepted: true })),
      stagePasswordResetCodeEntry: jest.fn(),
      signOut: jest.fn(async () => undefined),
    };
  }

  it('sends nothing and does not sign out, so the app stays locked', async () => {
    const d = deps();
    const outcome = await runLockScreenRecovery({
      email: 'a@b.co',
      confirm: async () => false,
      ...d,
    });
    expect(outcome).toBe('canceled');
    expect(d.requestPasswordReset).not.toHaveBeenCalled();
    expect(d.stagePasswordResetCodeEntry).not.toHaveBeenCalled();
    expect(d.signOut).not.toHaveBeenCalled();
    // Nothing in the lock model changes either: still locked after three misses.
    const model = rejectedTimes(3);
    expect(model.phase).toBe('locked');
    expect(shouldOfferPasswordRecovery(model)).toBe(true);
  });

  it('continues only after the person confirms', async () => {
    const d = deps();
    const outcome = await runLockScreenRecovery({
      email: 'a@b.co',
      confirm: async () => true,
      ...d,
    });
    expect(outcome).toBe('ready');
    expect(d.signOut).toHaveBeenCalledTimes(1);
  });

  it('does not ask for confirmation without an email', async () => {
    const d = deps();
    const confirm = jest.fn(async () => true);
    expect(await runLockScreenRecovery({ email: '  ', confirm, ...d })).toBe('no_email');
    expect(confirm).not.toHaveBeenCalled();
  });
});
