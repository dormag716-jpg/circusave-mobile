import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { BIOMETRIC_LEVEL_STRONG } from '@/lib/platform/biometricEnrollment';

export type AppLockPreferences = {
  appLockEnabled: boolean;
  biometricUnlockEnabled: boolean;
};

export type AppLockPreferenceStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type AppLockPreferenceLoad =
  | { ok: true; preferences: AppLockPreferences }
  | { ok: false };

type Listener = (userId: string, preferences: AppLockPreferences) => void;

const listeners = new Set<Listener>();
const memoryStore = new Map<string, string>();

function secureStore(): AppLockPreferenceStore {
  if (Platform.OS === 'web') {
    return {
      async getItem(key) {
        return memoryStore.get(key) ?? null;
      },
      async setItem(key, value) {
        memoryStore.set(key, value);
      },
    };
  }
  return {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
  };
}

export function appLockStorageKey(userId: string): string {
  return `circusave.appLock.v1.${userId.trim()}`;
}

export function defaultAppLockPreferences(compatibleEnrolled: boolean): AppLockPreferences {
  return {
    appLockEnabled: true,
    biometricUnlockEnabled: compatibleEnrolled,
  };
}

export function preferencesFromStorage(
  raw: string | null,
  compatibleEnrolled: boolean,
): AppLockPreferences {
  if (!raw) {
    return defaultAppLockPreferences(compatibleEnrolled);
  }
  try {
    const parsed = JSON.parse(raw) as { appLockEnabled?: unknown; biometricUnlockEnabled?: unknown };
    if (!parsed || typeof parsed.appLockEnabled !== 'boolean') {
      return defaultAppLockPreferences(compatibleEnrolled);
    }
    return {
      appLockEnabled: parsed.appLockEnabled,
      biometricUnlockEnabled: parsed.biometricUnlockEnabled === true,
    };
  } catch {
    return defaultAppLockPreferences(compatibleEnrolled);
  }
}

export function subscribeAppLockPreferences(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadAppLockPreferences(
  userId: string,
  compatibleEnrolled: boolean,
  store: AppLockPreferenceStore = secureStore(),
): Promise<AppLockPreferenceLoad> {
  try {
    const raw = await store.getItem(appLockStorageKey(userId));
    return { ok: true, preferences: preferencesFromStorage(raw, compatibleEnrolled) };
  } catch {
    return { ok: false };
  }
}

export async function saveAppLockPreferences(
  userId: string,
  preferences: AppLockPreferences,
  store: AppLockPreferenceStore = secureStore(),
): Promise<AppLockPreferenceLoad> {
  try {
    await store.setItem(appLockStorageKey(userId), JSON.stringify(preferences));
  } catch {
    return { ok: false };
  }
  for (const listener of listeners) {
    listener(userId, preferences);
  }
  return { ok: true, preferences };
}

export function isCompatibleStrongBiometric(input: {
  hasHardware: boolean;
  isEnrolled: boolean;
  enrolledLevel: number;
}): boolean {
  return (
    input.hasHardware &&
    input.isEnrolled &&
    input.enrolledLevel === BIOMETRIC_LEVEL_STRONG
  );
}

export type LockChangeProof = 'authorized' | 'canceled' | 'failed';

export async function authenticateForAppLockChange(
  promptMessage: string,
  cancelLabel: string,
): Promise<'success' | 'canceled' | 'failed' | 'unavailable'> {
  try {
    const localAuthentication = await import('expo-local-authentication');
    const hasHardware = await localAuthentication.hasHardwareAsync();
    const isEnrolled = await localAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) {
      return 'unavailable';
    }
    const result = await localAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel,
      fallbackLabel: '',
      disableDeviceFallback: true,
      biometricsSecurityLevel: 'strong',
    });
    if (result.success) {
      return 'success';
    }
    if (
      result.error === 'user_cancel' ||
      result.error === 'app_cancel' ||
      result.error === 'system_cancel'
    ) {
      return 'canceled';
    }
    if (
      result.error === 'not_available' ||
      result.error === 'not_enrolled' ||
      result.error === 'user_fallback' ||
      result.error === 'passcode_not_set'
    ) {
      return 'unavailable';
    }
    return 'failed';
  } catch {
    return 'unavailable';
  }
}

export async function confirmAppLockDisable(input: {
  biometricUnlockEnabled: boolean;
  authenticate: () => Promise<'success' | 'canceled' | 'failed' | 'unavailable'>;
  promptPassword: () => Promise<string | null>;
  verifyPassword: (password: string) => Promise<'success' | 'failed'>;
}): Promise<LockChangeProof> {
  if (input.biometricUnlockEnabled) {
    const biometric = await input.authenticate();
    if (biometric === 'success') {
      return 'authorized';
    }
    if (biometric === 'canceled') {
      return 'canceled';
    }
  }
  const password = await input.promptPassword();
  if (password == null || password.length === 0) {
    return 'canceled';
  }
  const verified = await input.verifyPassword(password);
  return verified === 'success' ? 'authorized' : 'failed';
}
