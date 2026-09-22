import { readFileSync } from 'fs';
import path from 'path';

import {
  INITIAL_DEVICE_LOCK,
  deviceLockCoversProtectedContent,
  reduceDeviceLock,
  shouldStartBiometricPrompt,
  supportsNativeBiometrics,
  type DeviceLockModel,
} from '../deviceLockState';

const SESSION = 'user-1:session-1';
const OTHER_SESSION = 'user-1:session-2';

function locked(overrides?: Partial<DeviceLockModel>): DeviceLockModel {
  return {
    ...reduceDeviceLock(INITIAL_DEVICE_LOCK, {
      type: 'auth_status',
      status: 'authenticated',
      sessionKey: SESSION,
    }),
    ...overrides,
  };
}

function startBiometric(model: DeviceLockModel, attemptId = 1, sessionKey = SESSION) {
  return reduceDeviceLock(model, {
    type: 'biometric_started',
    attemptId,
    sessionKey,
  });
}

function startPassword(model: DeviceLockModel, attemptId = 1, sessionKey = SESSION) {
  return reduceDeviceLock(model, {
    type: 'password_submitted',
    attemptId,
    sessionKey,
  });
}

function biometricSuccess(
  model: DeviceLockModel,
  attemptId = 1,
  sessionKey = SESSION,
  appState: string = 'active',
) {
  return reduceDeviceLock(model, {
    type: 'biometric_result',
    result: 'success',
    attemptId,
    sessionKey,
    appState,
  });
}

function passwordSuccess(
  model: DeviceLockModel,
  attemptId = 1,
  sessionKey = SESSION,
  appState: string = 'active',
) {
  return reduceDeviceLock(model, {
    type: 'password_result',
    result: 'success',
    attemptId,
    sessionKey,
    appState,
  });
}

describe('device lock state', () => {
  it('covers protected content during cold start before auth is known', () => {
    expect(deviceLockCoversProtectedContent(INITIAL_DEVICE_LOCK)).toBe(true);
    const loading = reduceDeviceLock(INITIAL_DEVICE_LOCK, {
      type: 'auth_status',
      status: 'loading',
    });
    expect(loading.phase).toBe('initializing');
    expect(deviceLockCoversProtectedContent(loading)).toBe(true);
  });

  it('shows login for an unauthenticated start and does not cover it', () => {
    const signedOut = reduceDeviceLock(INITIAL_DEVICE_LOCK, {
      type: 'auth_status',
      status: 'unauthenticated',
    });
    expect(signedOut.phase).toBe('signed_out');
    expect(deviceLockCoversProtectedContent(signedOut)).toBe(false);
  });

  it('locks a restored authenticated session before the dashboard can show', () => {
    const restored = locked();
    expect(restored.phase).toBe('locked');
    expect(deviceLockCoversProtectedContent(restored)).toBe(true);
  });

  it('lets a password login in this session open protected screens', () => {
    const signedOut = reduceDeviceLock(INITIAL_DEVICE_LOCK, {
      type: 'auth_status',
      status: 'unauthenticated',
    });
    const signedIn = reduceDeviceLock(signedOut, {
      type: 'auth_status',
      status: 'authenticated',
      sessionKey: SESSION,
    });
    expect(signedIn.phase).toBe('unlocked');
  });

  it('locks as soon as the authenticated app leaves the active state', () => {
    const open = reduceDeviceLock(
      reduceDeviceLock(INITIAL_DEVICE_LOCK, {
        type: 'auth_status',
        status: 'unauthenticated',
      }),
      { type: 'auth_status', status: 'authenticated', sessionKey: SESSION },
    );
    expect(open.phase).toBe('unlocked');

    const inactive = reduceDeviceLock(open, { type: 'app_state', next: 'inactive' });
    expect(inactive.phase).toBe('locked');
    expect(deviceLockCoversProtectedContent(inactive)).toBe(true);

    const background = reduceDeviceLock(open, { type: 'app_state', next: 'background' });
    expect(background.phase).toBe('locked');
  });

  it('stays locked when the app becomes active again', () => {
    const afterBackground = reduceDeviceLock(locked(), {
      type: 'app_state',
      next: 'active',
    });
    expect(afterBackground.phase).toBe('locked');
    expect(deviceLockCoversProtectedContent(afterBackground)).toBe(true);
  });

  it('does not stack prompts while a biometric sheet is open', () => {
    const started = startBiometric(locked());
    const second = reduceDeviceLock(started, {
      type: 'biometric_started',
      attemptId: 2,
      sessionKey: SESSION,
    });
    expect(second.authenticating).toBe(true);
    expect(second.attemptId).toBe(1);
    expect(second).toBe(started);

    const interrupted = reduceDeviceLock(started, {
      type: 'app_state',
      next: 'inactive',
    });
    expect(interrupted.phase).toBe('locked');
    expect(interrupted.authenticating).toBe(true);
    expect(interrupted.attemptId).toBe(1);

    const returned = reduceDeviceLock(interrupted, {
      type: 'app_state',
      next: 'active',
    });
    expect(returned.phase).toBe('locked');
    expect(returned.authenticating).toBe(true);
  });

  it('unlocks only after a current foreground biometric success', () => {
    const started = startBiometric(locked());
    const opened = biometricSuccess(started);
    expect(opened.phase).toBe('unlocked');
    expect(deviceLockCoversProtectedContent(opened)).toBe(false);
  });

  it('stays locked when biometrics are canceled or fail', () => {
    for (const result of ['canceled', 'failed'] as const) {
      const next = reduceDeviceLock(startBiometric(locked()), {
        type: 'biometric_result',
        result,
        attemptId: 1,
        sessionKey: SESSION,
        appState: 'active',
      });
      expect(next.phase).toBe('locked');
      expect(next.authenticating).toBe(false);
      expect(next.failure).not.toBeNull();
    }
  });

  it('offers the password fallback when biometrics are unavailable', () => {
    const next = reduceDeviceLock(startBiometric(locked()), {
      type: 'biometric_result',
      result: 'unavailable',
      attemptId: 1,
      sessionKey: SESSION,
      appState: 'active',
    });
    expect(next.phase).toBe('locked');
    expect(next.passwordFallback).toBe(true);
    expect(supportsNativeBiometrics('web')).toBe(false);
    expect(supportsNativeBiometrics('ios')).toBe(true);
    expect(supportsNativeBiometrics('android')).toBe(true);
  });

  it('does not start a biometric prompt on web, while inactive, or twice', () => {
    const base = {
      phase: 'locked' as const,
      authenticating: false,
      passwordSubmitting: false,
      passwordFallback: false,
      appState: 'active',
      platform: 'ios',
      promptedGeneration: -1,
      promptGeneration: 1,
    };
    expect(shouldStartBiometricPrompt(base)).toBe(true);
    expect(shouldStartBiometricPrompt({ ...base, platform: 'web' })).toBe(false);
    expect(shouldStartBiometricPrompt({ ...base, appState: 'background' })).toBe(false);
    expect(shouldStartBiometricPrompt({ ...base, authenticating: true })).toBe(false);
    expect(
      shouldStartBiometricPrompt({
        ...base,
        promptedGeneration: 1,
        promptGeneration: 1,
      }),
    ).toBe(false);
  });

  it('keeps the app locked when the password is wrong', () => {
    const submitting = startPassword(locked({ passwordFallback: true }));
    const failed = reduceDeviceLock(submitting, {
      type: 'password_result',
      result: 'failed',
      attemptId: 1,
      sessionKey: SESSION,
      appState: 'active',
    });
    expect(failed.phase).toBe('locked');
    expect(failed.passwordSubmitting).toBe(false);
    expect(failed.failure).toBe('password_failed');
  });

  it('unlocks when the account password is accepted in the foreground', () => {
    const submitting = startPassword(locked({ passwordFallback: true }));
    const opened = passwordSuccess(submitting);
    expect(opened.phase).toBe('unlocked');
  });

  it('ignores a second password submit while one is in flight', () => {
    const submitting = startPassword(locked());
    expect(
      reduceDeviceLock(submitting, {
        type: 'password_submitted',
        attemptId: 2,
        sessionKey: SESSION,
      }),
    ).toBe(submitting);
    expect(
      reduceDeviceLock(submitting, {
        type: 'biometric_started',
        attemptId: 2,
        sessionKey: SESSION,
      }),
    ).toBe(submitting);
  });

  it('clears lock state on logout and does not unlock afterwards', () => {
    const started = startBiometric(locked());
    const signedOut = reduceDeviceLock(started, { type: 'sign_out' });
    expect(signedOut.phase).toBe('signed_out');
    expect(signedOut.authenticating).toBe(false);
    expect(signedOut.attemptId).toBe(0);
    expect(deviceLockCoversProtectedContent(signedOut)).toBe(false);

    expect(biometricSuccess(signedOut).phase).toBe('signed_out');
    expect(passwordSuccess(signedOut).phase).toBe('signed_out');
  });

  it('handles a quick background and foreground without unlocking', () => {
    const open = reduceDeviceLock(
      reduceDeviceLock(INITIAL_DEVICE_LOCK, {
        type: 'auth_status',
        status: 'unauthenticated',
      }),
      { type: 'auth_status', status: 'authenticated', sessionKey: SESSION },
    );
    const background = reduceDeviceLock(open, { type: 'app_state', next: 'background' });
    const stillBackground = reduceDeviceLock(background, {
      type: 'app_state',
      next: 'inactive',
    });
    const foreground = reduceDeviceLock(stillBackground, {
      type: 'app_state',
      next: 'active',
    });
    expect(foreground.phase).toBe('locked');
    expect(foreground.promptGeneration).toBe(background.promptGeneration);
  });

  it('does not treat a refreshed authenticated status as a new lock or login', () => {
    const open = reduceDeviceLock(
      reduceDeviceLock(INITIAL_DEVICE_LOCK, {
        type: 'auth_status',
        status: 'unauthenticated',
      }),
      { type: 'auth_status', status: 'authenticated', sessionKey: SESSION },
    );
    expect(
      reduceDeviceLock(open, {
        type: 'auth_status',
        status: 'authenticated',
        sessionKey: SESSION,
      }),
    ).toBe(open);
    const covered = locked();
    expect(
      reduceDeviceLock(covered, {
        type: 'auth_status',
        status: 'authenticated',
        sessionKey: SESSION,
      }),
    ).toBe(covered);
  });

  it('ignores a late biometric success after the app backgrounds', () => {
    const started = startBiometric(locked());
    const backgrounded = reduceDeviceLock(started, {
      type: 'app_state',
      next: 'background',
    });
    expect(backgrounded.phase).toBe('locked');
    expect(backgrounded.authenticating).toBe(false);
    expect(backgrounded.attemptId).toBe(0);

    const late = biometricSuccess(backgrounded);
    expect(late.phase).toBe('locked');
    expect(deviceLockCoversProtectedContent(late)).toBe(true);

    const returned = reduceDeviceLock(late, { type: 'app_state', next: 'active' });
    expect(returned.phase).toBe('locked');
    expect(returned.authenticating).toBe(false);
    expect(biometricSuccess(returned).phase).toBe('locked');
  });

  it('ignores a late password success after the app backgrounds', () => {
    const started = startPassword(locked({ passwordFallback: true }));
    const backgrounded = reduceDeviceLock(started, {
      type: 'app_state',
      next: 'background',
    });
    expect(backgrounded.phase).toBe('locked');
    expect(backgrounded.passwordSubmitting).toBe(false);
    expect(backgrounded.attemptId).toBe(0);

    const late = passwordSuccess(backgrounded);
    expect(late.phase).toBe('locked');

    const returned = reduceDeviceLock(late, { type: 'app_state', next: 'active' });
    expect(returned.phase).toBe('locked');
    expect(passwordSuccess(returned).phase).toBe('locked');
  });

  it('ignores a late success after logout during either attempt', () => {
    const biometric = reduceDeviceLock(startBiometric(locked()), { type: 'sign_out' });
    expect(biometricSuccess(biometric).phase).toBe('signed_out');

    const password = reduceDeviceLock(startPassword(locked()), { type: 'sign_out' });
    expect(passwordSuccess(password).phase).toBe('signed_out');
  });

  it('ignores an older attempt that finishes after a newer one', () => {
    let model = startBiometric(locked(), 1);
    model = reduceDeviceLock(model, { type: 'app_state', next: 'background' });
    model = reduceDeviceLock(model, { type: 'app_state', next: 'active' });
    model = startBiometric(model, 2);
    expect(model.authenticating).toBe(true);
    expect(model.attemptId).toBe(2);

    const late = biometricSuccess(model, 1);
    expect(late).toBe(model);
    expect(late.phase).toBe('locked');

    const passwordModel = startPassword(
      reduceDeviceLock(startPassword(locked(), 4), {
        type: 'app_state',
        next: 'background',
      }),
    );
    const activePassword = reduceDeviceLock(passwordModel, {
      type: 'app_state',
      next: 'active',
    });
    const newerPassword = startPassword(activePassword, 5);
    expect(passwordSuccess(newerPassword, 4)).toBe(newerPassword);
    expect(passwordSuccess(newerPassword, 5).phase).toBe('unlocked');
  });

  it('ignores a late success after the signed-in session is replaced', () => {
    const started = startBiometric(locked(), 1, SESSION);
    const replaced = reduceDeviceLock(started, {
      type: 'auth_status',
      status: 'authenticated',
      sessionKey: OTHER_SESSION,
    });
    expect(replaced.phase).toBe('locked');
    expect(replaced.authenticating).toBe(false);
    expect(replaced.sessionKey).toBe(OTHER_SESSION);
    expect(biometricSuccess(replaced, 1, SESSION).phase).toBe('locked');
    expect(biometricSuccess(replaced, 1, OTHER_SESSION).phase).toBe('locked');
  });

  it('does not unlock when biometric success is observed while inactive', () => {
    const started = startBiometric(locked());
    const inactive = reduceDeviceLock(started, { type: 'app_state', next: 'inactive' });
    const late = biometricSuccess(inactive, 1, SESSION, 'inactive');
    expect(late.phase).toBe('locked');
    expect(late.authenticating).toBe(false);
    expect(late.attemptId).toBe(0);
  });

  it('wires the provider to the current attempt and not to an opt-in bypass', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'components', 'DeviceLock.tsx'),
      'utf8',
    );
    expect(source).toContain('reduceDeviceLock');
    expect(source).toContain('verifyAccountPassword');
    expect(source).toContain('supportsNativeBiometrics');
    expect(source).toContain('disableDeviceFallback: true');
    expect(source).toContain('attemptId');
    expect(source).toContain('sessionKey');
    expect(source).toContain('AppState.currentState');
    expect(source).toContain('<Modal');
    expect(source).not.toContain('circusave_require_local_auth');
    expect(source).not.toContain('SecureStore');
    expect(source).not.toContain('setLockEnabled');
    expect(source).not.toContain('remember');
    expect(source).not.toContain('submitContribution');
    expect(source).not.toContain('runMoneyMutation');
    expect(source).not.toContain('releasePayout');
    expect(source).not.toContain('approveContribution');
    expect(source).not.toContain('markContribution');
    expect(source).not.toContain('@stripe/stripe-react-native');
    expect(source).not.toContain('setIsLocked(false)');
    expect(source).not.toContain('setAuthenticatedSession');
    expect(source).not.toContain('signOut');
  });
});
