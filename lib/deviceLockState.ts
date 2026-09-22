/**
 * Local application lock. This is not the server session.
 * A saved session stays in place while the UI is covered.
 * Nothing in this module records, repeats, or reverses a payment.
 *
 * An unlock result is applied only for the attempt that is still current,
 * for the same signed-in session, while the app is active and still locked.
 * Leaving the foreground cancels that attempt. A late success cannot open
 * the app in the background or after a newer attempt, logout, or session change.
 */

export type DeviceLockAuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

export type DeviceLockPhase =
  | 'initializing'
  | 'signed_out'
  | 'locked'
  | 'unlocked';

export type DeviceLockFailure =
  | 'biometric_failed'
  | 'biometric_canceled'
  | 'password_failed'
  | null;

export type BiometricPromptResult =
  | 'success'
  | 'failed'
  | 'canceled'
  | 'unavailable';

export type DeviceLockAppState = 'active' | 'inactive' | 'background' | 'unknown';

export type UnlockAttemptKind = 'biometric' | 'password' | null;

export type DeviceLockModel = {
  phase: DeviceLockPhase;
  authenticating: boolean;
  passwordSubmitting: boolean;
  passwordFallback: boolean;
  failure: DeviceLockFailure;
  promptGeneration: number;
  appState: DeviceLockAppState;
  attemptId: number;
  attemptKind: UnlockAttemptKind;
  sessionKey: string;
};

export type DeviceLockEvent =
  | { type: 'auth_status'; status: DeviceLockAuthStatus; sessionKey?: string }
  | { type: 'app_state'; next: string | null | undefined }
  | { type: 'biometric_started'; attemptId: number; sessionKey: string }
  | {
      type: 'biometric_result';
      result: BiometricPromptResult;
      attemptId: number;
      sessionKey: string;
      appState: string | null | undefined;
    }
  | { type: 'show_password_fallback' }
  | { type: 'retry_biometric' }
  | { type: 'password_submitted'; attemptId: number; sessionKey: string }
  | {
      type: 'password_result';
      result: 'success' | 'failed';
      attemptId: number;
      sessionKey: string;
      appState: string | null | undefined;
    }
  | { type: 'sign_out' };

export const INITIAL_DEVICE_LOCK: DeviceLockModel = {
  phase: 'initializing',
  authenticating: false,
  passwordSubmitting: false,
  passwordFallback: false,
  failure: null,
  promptGeneration: 0,
  appState: 'active',
  attemptId: 0,
  attemptKind: null,
  sessionKey: '',
};

export function deviceLockCoversProtectedContent(model: DeviceLockModel): boolean {
  return model.phase === 'initializing' || model.phase === 'locked';
}

export function supportsNativeBiometrics(platform: string | null | undefined): boolean {
  const value = String(platform || '').trim().toLowerCase();
  return value === 'ios' || value === 'android';
}

export function normalizeDeviceLockAppState(
  next: string | null | undefined,
): DeviceLockAppState {
  const value = String(next || '').trim();
  if (value === 'active' || value === 'inactive' || value === 'background') {
    return value;
  }
  return 'unknown';
}

export function canApplyUnlockResult(input: {
  phase: DeviceLockPhase;
  modelAppState: string | null | undefined;
  resultAppState: string | null | undefined;
  currentAttemptId: number;
  resultAttemptId: number;
  currentSessionKey: string;
  resultSessionKey: string;
  attemptKind: UnlockAttemptKind;
  resultKind: 'biometric' | 'password';
  inFlight: boolean;
}): boolean {
  return (
    input.phase === 'locked' &&
    input.inFlight &&
    input.attemptKind === input.resultKind &&
    input.currentAttemptId > 0 &&
    input.currentAttemptId === input.resultAttemptId &&
    input.currentSessionKey.length > 0 &&
    input.currentSessionKey === input.resultSessionKey &&
    normalizeDeviceLockAppState(input.modelAppState) !== 'background' &&
    normalizeDeviceLockAppState(input.resultAppState) === 'active'
  );
}

export function shouldStartBiometricPrompt(input: {
  phase: DeviceLockPhase;
  authenticating: boolean;
  passwordSubmitting: boolean;
  passwordFallback: boolean;
  appState: string | null | undefined;
  platform: string | null | undefined;
  promptedGeneration: number;
  promptGeneration: number;
}): boolean {
  if (!supportsNativeBiometrics(input.platform)) {
    return false;
  }
  if (input.phase !== 'locked') {
    return false;
  }
  if (input.authenticating || input.passwordSubmitting || input.passwordFallback) {
    return false;
  }
  if (normalizeDeviceLockAppState(input.appState) !== 'active') {
    return false;
  }
  return input.promptedGeneration !== input.promptGeneration;
}

function lockedModel(
  model: DeviceLockModel,
  appState?: DeviceLockAppState,
): DeviceLockModel {
  return {
    phase: 'locked',
    authenticating: false,
    passwordSubmitting: false,
    passwordFallback: false,
    failure: null,
    promptGeneration: model.promptGeneration + 1,
    appState: appState ?? model.appState,
    attemptId: 0,
    attemptKind: null,
    sessionKey: model.sessionKey,
  };
}

function unlockedModel(model: DeviceLockModel): DeviceLockModel {
  return {
    phase: 'unlocked',
    authenticating: false,
    passwordSubmitting: false,
    passwordFallback: false,
    failure: null,
    promptGeneration: 0,
    appState: 'active',
    attemptId: 0,
    attemptKind: null,
    sessionKey: model.sessionKey,
  };
}

function signedOutModel(model: DeviceLockModel): DeviceLockModel {
  return {
    phase: 'signed_out',
    authenticating: false,
    passwordSubmitting: false,
    passwordFallback: false,
    failure: null,
    promptGeneration: model.promptGeneration,
    appState: model.appState,
    attemptId: 0,
    attemptKind: null,
    sessionKey: '',
  };
}

function invalidateAttempt(
  model: DeviceLockModel,
  appState: DeviceLockAppState,
): DeviceLockModel {
  const hadAttempt = model.authenticating || model.passwordSubmitting || model.attemptId !== 0;
  return {
    ...model,
    appState,
    authenticating: false,
    passwordSubmitting: false,
    attemptId: 0,
    attemptKind: null,
    failure: null,
    promptGeneration: hadAttempt ? model.promptGeneration + 1 : model.promptGeneration,
  };
}

function leftForeground(next: DeviceLockAppState): boolean {
  return next === 'inactive' || next === 'background';
}

function isCurrentAttempt(
  model: DeviceLockModel,
  event: { attemptId: number; sessionKey: string },
  kind: 'biometric' | 'password',
): boolean {
  const inFlight = kind === 'biometric' ? model.authenticating : model.passwordSubmitting;
  return (
    inFlight &&
    model.attemptKind === kind &&
    model.attemptId > 0 &&
    model.attemptId === event.attemptId &&
    model.sessionKey.length > 0 &&
    model.sessionKey === event.sessionKey
  );
}

function canUnlock(
  model: DeviceLockModel,
  event: { attemptId: number; sessionKey: string; appState: string | null | undefined },
  kind: 'biometric' | 'password',
): boolean {
  return canApplyUnlockResult({
    phase: model.phase,
    modelAppState: model.appState,
    resultAppState: event.appState,
    currentAttemptId: model.attemptId,
    resultAttemptId: event.attemptId,
    currentSessionKey: model.sessionKey,
    resultSessionKey: event.sessionKey,
    attemptKind: model.attemptKind,
    resultKind: kind,
    inFlight: kind === 'biometric' ? model.authenticating : model.passwordSubmitting,
  });
}

function rejectStaleSuccess(model: DeviceLockModel): DeviceLockModel {
  return {
    ...model,
    authenticating: false,
    passwordSubmitting: false,
    attemptId: 0,
    attemptKind: null,
  };
}

export function reduceDeviceLock(
  model: DeviceLockModel,
  event: DeviceLockEvent,
): DeviceLockModel {
  if (event.type === 'sign_out') {
    return signedOutModel(model);
  }

  if (event.type === 'auth_status') {
    if (event.status === 'loading') {
      return model;
    }
    if (event.status === 'unauthenticated' || event.status === 'error') {
      return signedOutModel(model);
    }
    if (model.phase === 'initializing') {
      return {
        ...lockedModel(model),
        sessionKey: event.sessionKey ?? model.sessionKey,
      };
    }
    if (model.phase === 'signed_out') {
      return {
        ...unlockedModel(model),
        sessionKey: event.sessionKey ?? '',
      };
    }
    if (event.sessionKey !== undefined && event.sessionKey !== model.sessionKey) {
      const next = {
        ...model,
        sessionKey: event.sessionKey,
      };
      if (model.authenticating || model.passwordSubmitting) {
        return invalidateAttempt(next, model.appState);
      }
      return next;
    }
    return model;
  }

  if (event.type === 'app_state') {
    const next = normalizeDeviceLockAppState(event.next);
    if (model.phase !== 'locked' && model.phase !== 'unlocked') {
      return model.appState === next ? model : { ...model, appState: next };
    }
    if (!leftForeground(next)) {
      return model.appState === next ? model : { ...model, appState: next };
    }
    if (model.phase === 'unlocked') {
      return lockedModel(model, next);
    }
    // The biometric sheet itself moves iOS to inactive. That is not the user
    // leaving. Background, and inactive during a password check, cancel it.
    const biometricSheet =
      next === 'inactive' && model.authenticating && model.attemptKind === 'biometric';
    if (biometricSheet) {
      return model.appState === 'inactive' ? model : { ...model, appState: 'inactive' };
    }
    if (model.authenticating || model.passwordSubmitting || model.attemptId !== 0) {
      return invalidateAttempt(model, next);
    }
    return model.appState === next ? model : { ...model, appState: next };
  }

  if (event.type === 'biometric_started') {
    if (
      model.phase !== 'locked' ||
      model.authenticating ||
      model.passwordSubmitting ||
      model.appState !== 'active' ||
      event.attemptId <= 0 ||
      !event.sessionKey
    ) {
      return model;
    }
    return {
      ...model,
      authenticating: true,
      passwordSubmitting: false,
      failure: null,
      attemptId: event.attemptId,
      attemptKind: 'biometric',
      sessionKey: event.sessionKey,
    };
  }

  if (event.type === 'biometric_result') {
    if (!isCurrentAttempt(model, event, 'biometric')) {
      return model;
    }
    if (model.phase !== 'locked') {
      return model;
    }
    if (event.result === 'success') {
      if (!canUnlock(model, event, 'biometric')) {
        return rejectStaleSuccess(model);
      }
      return unlockedModel(model);
    }
    if (event.result === 'unavailable') {
      return {
        ...model,
        authenticating: false,
        attemptId: 0,
        attemptKind: null,
        passwordFallback: true,
        failure: null,
      };
    }
    return {
      ...model,
      authenticating: false,
      attemptId: 0,
      attemptKind: null,
      failure: event.result === 'canceled' ? 'biometric_canceled' : 'biometric_failed',
    };
  }

  if (event.type === 'show_password_fallback') {
    if (model.phase !== 'locked') {
      return model;
    }
    return {
      ...model,
      authenticating: false,
      attemptId: 0,
      attemptKind: null,
      passwordFallback: true,
    };
  }

  if (event.type === 'retry_biometric') {
    if (model.phase !== 'locked' || model.authenticating || model.passwordSubmitting) {
      return model;
    }
    return { ...model, passwordFallback: false, failure: null };
  }

  if (event.type === 'password_submitted') {
    if (
      model.phase !== 'locked' ||
      model.passwordSubmitting ||
      model.authenticating ||
      model.appState !== 'active' ||
      event.attemptId <= 0 ||
      !event.sessionKey
    ) {
      return model;
    }
    return {
      ...model,
      passwordSubmitting: true,
      passwordFallback: true,
      failure: null,
      attemptId: event.attemptId,
      attemptKind: 'password',
      sessionKey: event.sessionKey,
    };
  }

  if (event.type === 'password_result') {
    if (!isCurrentAttempt(model, event, 'password')) {
      return model;
    }
    if (model.phase !== 'locked') {
      return model;
    }
    if (event.result === 'success') {
      if (!canUnlock(model, event, 'password')) {
        return rejectStaleSuccess(model);
      }
      return unlockedModel(model);
    }
    return {
      ...model,
      passwordSubmitting: false,
      attemptId: 0,
      attemptKind: null,
      passwordFallback: true,
      failure: 'password_failed',
    };
  }

  return model;
}
