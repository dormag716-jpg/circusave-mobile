jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

import {
  appLockStorageKey,
  confirmAppLockDisable,
  defaultAppLockPreferences,
  isCompatibleStrongBiometric,
  loadAppLockPreferences,
  preferencesFromStorage,
  saveAppLockPreferences,
  subscribeAppLockPreferences,
  type AppLockPreferenceStore,
} from '../platform/appLockPreferences';
import {
  BIOMETRIC_LEVEL_NONE,
  BIOMETRIC_LEVEL_STRONG,
  BIOMETRIC_LEVEL_WEAK,
} from '../platform/biometricEnrollment';

function memoryStore(): AppLockPreferenceStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe('app lock preferences', () => {
  it('defaults App Lock on and enables biometrics only when a strong one is enrolled', () => {
    expect(defaultAppLockPreferences(true)).toEqual({
      appLockEnabled: true,
      biometricUnlockEnabled: true,
    });
    expect(preferencesFromStorage(null, false)).toEqual({
      appLockEnabled: true,
      biometricUnlockEnabled: false,
    });
    expect(isCompatibleStrongBiometric({
      hasHardware: true,
      isEnrolled: true,
      enrolledLevel: BIOMETRIC_LEVEL_STRONG,
    })).toBe(true);
    expect(isCompatibleStrongBiometric({
      hasHardware: true,
      isEnrolled: true,
      enrolledLevel: BIOMETRIC_LEVEL_WEAK,
    })).toBe(false);
    expect(isCompatibleStrongBiometric({
      hasHardware: true,
      isEnrolled: false,
      enrolledLevel: BIOMETRIC_LEVEL_NONE,
    })).toBe(false);
  });

  it('stores preferences per user and does not inherit them across accounts', async () => {
    const store = memoryStore();
    const seen: string[] = [];
    const unsubscribe = subscribeAppLockPreferences((userId) => {
      seen.push(userId);
    });
    await saveAppLockPreferences('user-a', {
      appLockEnabled: false,
      biometricUnlockEnabled: true,
    }, store);
    await saveAppLockPreferences('user-b', {
      appLockEnabled: true,
      biometricUnlockEnabled: false,
    }, store);
    unsubscribe();
    expect(appLockStorageKey('user-a')).not.toBe(appLockStorageKey('user-b'));
    const first = await loadAppLockPreferences('user-a', true, store);
    const second = await loadAppLockPreferences('user-b', true, store);
    expect(first.ok && first.preferences).toEqual({
      appLockEnabled: false,
      biometricUnlockEnabled: true,
    });
    expect(second.ok && second.preferences).toEqual({
      appLockEnabled: true,
      biometricUnlockEnabled: false,
    });
    expect(seen).toEqual(['user-a', 'user-b']);
    expect(JSON.stringify([...store.values.values()])).not.toMatch(/fingerprint|face|template/i);
  });

  it('reports storage failure without throwing', async () => {
    const store: AppLockPreferenceStore = {
      async getItem() {
        throw new Error('native secure-store detail');
      },
      async setItem() {
        throw new Error('native secure-store detail');
      },
    };
    await expect(loadAppLockPreferences('user-a', true, store)).resolves.toEqual({ ok: false });
    await expect(saveAppLockPreferences('user-a', defaultAppLockPreferences(true), store)).resolves.toEqual({
      ok: false,
    });
  });

  it('leaves the switch unchanged when disable proof is canceled or fails', async () => {
    const canceled = await confirmAppLockDisable({
      biometricUnlockEnabled: true,
      authenticate: async () => 'canceled',
      promptPassword: async () => 'secret-password',
      verifyPassword: async () => 'success',
    });
    expect(canceled).toBe('canceled');

    const failed = await confirmAppLockDisable({
      biometricUnlockEnabled: false,
      authenticate: async () => 'success',
      promptPassword: async () => 'secret-password',
      verifyPassword: async () => 'failed',
    });
    expect(failed).toBe('failed');

    const authorized = await confirmAppLockDisable({
      biometricUnlockEnabled: true,
      authenticate: async () => 'success',
      promptPassword: async () => {
        throw new Error('password should not be requested');
      },
      verifyPassword: async () => 'failed',
    });
    expect(authorized).toBe('authorized');
  });
});
