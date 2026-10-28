import { readFileSync } from 'fs';
import path from 'path';

import {
  ANDROID_DEVICE_SECURITY_SETTINGS,
  BIOMETRIC_LEVEL_NONE,
  BIOMETRIC_LEVEL_SECRET,
  BIOMETRIC_LEVEL_STRONG,
  BIOMETRIC_LEVEL_WEAK,
  BIOMETRIC_TYPE_FACIAL_RECOGNITION,
  BIOMETRIC_TYPE_FINGERPRINT,
  BIOMETRIC_TYPE_IRIS,
  biometricEnrollmentTranslationKey,
  isLatestEnrollmentRead,
  openDeviceSecuritySettings,
  presentBiometricSecurity,
  readBiometricEnrollment,
  shouldRefreshBiometricEnrollmentOnAppState,
  supportedBiometricTranslationKey,
  type BiometricHardwareReport,
} from '../platform/biometricEnrollment';

const root = path.join(__dirname, '..', '..');

function report(overrides: Partial<BiometricHardwareReport> = {}): BiometricHardwareReport {
  return {
    hasHardware: true,
    isEnrolled: false,
    supportedTypes: [],
    enrolledLevel: BIOMETRIC_LEVEL_NONE,
    ...overrides,
  };
}

describe('biometric security presentation', () => {
  it('reports no hardware and hides settings off Android', () => {
    const presentation = presentBiometricSecurity(
      report({ hasHardware: false, supportedTypes: [] }),
      'ios',
    );
    expect(presentation).toMatchObject({
      appLockAlwaysOn: true,
      hardwareAvailable: false,
      enrollment: 'none',
      requiresStrongBiometrics: true,
      supported: [],
      showSettings: false,
    });
    expect(presentBiometricSecurity(report({ hasHardware: false }), 'android').showSettings).toBe(
      true,
    );
  });

  it('lists Android fingerprint and face recognition without calling either enrolled', () => {
    const presentation = presentBiometricSecurity(
      report({
        supportedTypes: [BIOMETRIC_TYPE_FINGERPRINT, BIOMETRIC_TYPE_FACIAL_RECOGNITION],
      }),
      'android',
    );
    expect(presentation.enrollment).toBe('none');
    expect(presentation.supported).toEqual(['fingerprint', 'face_recognition']);
    expect(presentation.showSettings).toBe(true);
    expect(supportedBiometricTranslationKey('face_recognition')).toBe('supportedFaceRecognition');
    expect(supportedBiometricTranslationKey('fingerprint')).toBe('supportedFingerprint');
  });

  it('uses Touch ID and Face ID wording on iOS', () => {
    const presentation = presentBiometricSecurity(
      report({
        supportedTypes: [BIOMETRIC_TYPE_FINGERPRINT, BIOMETRIC_TYPE_FACIAL_RECOGNITION],
      }),
      'ios',
    );
    expect(presentation.supported).toEqual(['touch_id', 'face_id']);
    expect(supportedBiometricTranslationKey('touch_id')).toBe('supportedTouchId');
    expect(supportedBiometricTranslationKey('face_id')).toBe('supportedFaceId');
  });

  it('says a compatible biometric is enrolled without naming the sensor', () => {
    const presentation = presentBiometricSecurity(
      report({
        isEnrolled: true,
        enrolledLevel: BIOMETRIC_LEVEL_STRONG,
        supportedTypes: [BIOMETRIC_TYPE_FINGERPRINT, BIOMETRIC_TYPE_FACIAL_RECOGNITION],
      }),
      'android',
    );
    expect(presentation.enrollment).toBe('compatible');
    expect(biometricEnrollmentTranslationKey(presentation.enrollment)).toBe(
      'compatibleBiometricsEnrolled',
    );
    expect(presentation.showSettings).toBe(true);
    expect(JSON.stringify(presentation)).not.toMatch(/fingerprint_enabled|face_id_enabled/);
  });

  it('explains a weak biometric instead of treating it as Face ID or unavailable', () => {
    const presentation = presentBiometricSecurity(
      report({
        isEnrolled: true,
        enrolledLevel: BIOMETRIC_LEVEL_WEAK,
        supportedTypes: [BIOMETRIC_TYPE_FACIAL_RECOGNITION],
      }),
      'android',
    );
    expect(presentation.enrollment).toBe('weak_only');
    expect(presentation.supported).toEqual(['face_recognition']);
    expect(biometricEnrollmentTranslationKey('weak_only')).toBe('weakBiometricOnly');
  });

  it('does not claim an iris enrollment is a fingerprint or a face', () => {
    const presentation = presentBiometricSecurity(
      report({
        isEnrolled: true,
        enrolledLevel: BIOMETRIC_LEVEL_STRONG,
        supportedTypes: [BIOMETRIC_TYPE_IRIS],
      }),
      'android',
    );
    expect(presentation.enrollment).toBe('compatible');
    expect(presentation.supported).toEqual(['iris']);
  });

  it('keeps an enrolled sensor visible when the level cannot be proven during lockout', () => {
    const presentation = presentBiometricSecurity(
      report({
        isEnrolled: true,
        enrolledLevel: BIOMETRIC_LEVEL_SECRET,
        supportedTypes: [BIOMETRIC_TYPE_FINGERPRINT],
      }),
      'ios',
    );
    expect(presentation.enrollment).toBe('enrolled_unproven');
    expect(presentation.supported).toEqual(['touch_id']);
  });

  it('rechecks enrollment when CircuSave becomes active again', () => {
    expect(shouldRefreshBiometricEnrollmentOnAppState('background', 'active')).toBe(true);
    expect(shouldRefreshBiometricEnrollmentOnAppState('inactive', 'active')).toBe(true);
    expect(shouldRefreshBiometricEnrollmentOnAppState(null, 'active')).toBe(true);
    expect(shouldRefreshBiometricEnrollmentOnAppState('active', 'active')).toBe(false);
    expect(shouldRefreshBiometricEnrollmentOnAppState('active', 'background')).toBe(false);
  });

  it('ignores a stale enrollment read', () => {
    expect(isLatestEnrollmentRead(2, 2)).toBe(true);
    expect(isLatestEnrollmentRead(1, 2)).toBe(false);
    expect(isLatestEnrollmentRead(0, 0)).toBe(false);
  });

  it('reads hardware and enrollment without authenticating or storing a sample', async () => {
    const calls: string[] = [];
    const view = await readBiometricEnrollment({
      hasHardwareAsync: async () => {
        calls.push('hardware');
        return true;
      },
      isEnrolledAsync: async () => {
        calls.push('enrolled');
        return true;
      },
      supportedAuthenticationTypesAsync: async () => {
        calls.push('types');
        return new Set([BIOMETRIC_TYPE_FINGERPRINT]) as unknown as readonly number[];
      },
      getEnrolledLevelAsync: async () => {
        calls.push('level');
        return BIOMETRIC_LEVEL_STRONG;
      },
      authenticateAsync: async () => {
        calls.push('authenticate');
        return { success: true };
      },
    } as Parameters<typeof readBiometricEnrollment>[0]);

    expect(view).toEqual({
      hasHardware: true,
      isEnrolled: true,
      supportedTypes: [BIOMETRIC_TYPE_FINGERPRINT],
      enrolledLevel: BIOMETRIC_LEVEL_STRONG,
    });
    expect(calls).toEqual(['hardware', 'enrolled', 'types', 'level']);
  });

  it('does not treat missing hardware as an enrolled biometric', async () => {
    const view = await readBiometricEnrollment({
      hasHardwareAsync: async () => false,
      isEnrolledAsync: async () => true,
      supportedAuthenticationTypesAsync: async () => [BIOMETRIC_TYPE_FINGERPRINT],
      getEnrolledLevelAsync: async () => BIOMETRIC_LEVEL_STRONG,
    });
    expect(presentBiometricSecurity(view, 'android').enrollment).toBe('none');
  });
});

describe('device security settings', () => {
  it('opens the Android security settings action and leaves iOS settings alone', async () => {
    const startAndroidActivity = jest.fn().mockResolvedValue({ resultCode: -1 });
    const openIosSettings = jest.fn();
    await expect(
      openDeviceSecuritySettings({
        platform: 'android',
        startAndroidActivity,
        openIosSettings,
      }),
    ).resolves.toBe('opened');
    expect(startAndroidActivity).toHaveBeenCalledWith(
      'android.settings.BIOMETRIC_ENROLL',
      {
        extra: {
          'android.provider.extra.BIOMETRIC_AUTHENTICATORS_ALLOWED': 15,
        },
      },
    );
    expect(startAndroidActivity).not.toHaveBeenCalledWith(ANDROID_DEVICE_SECURITY_SETTINGS);
    expect(ANDROID_DEVICE_SECURITY_SETTINGS).toBe('android.settings.SECURITY_SETTINGS');
    expect(openIosSettings).not.toHaveBeenCalled();
  });

  it('opens iOS settings without an Android intent', async () => {
    const startAndroidActivity = jest.fn();
    const openIosSettings = jest.fn().mockResolvedValue(undefined);
    await expect(
      openDeviceSecuritySettings({
        platform: 'ios',
        startAndroidActivity,
        openIosSettings,
      }),
    ).resolves.toBe('opened');
    expect(openIosSettings).toHaveBeenCalledTimes(1);
    expect(startAndroidActivity).not.toHaveBeenCalled();
  });

  it('does not open settings on web or when the Android intent fails', async () => {
    const startAndroidActivity = jest.fn().mockRejectedValue(new Error('missing native module'));
    const openIosSettings = jest.fn();
    await expect(
      openDeviceSecuritySettings({
        platform: 'web',
        startAndroidActivity,
        openIosSettings,
      }),
    ).resolves.toBe('unavailable');
    await expect(
      openDeviceSecuritySettings({
        platform: 'android',
        startAndroidActivity,
        openIosSettings,
      }),
    ).resolves.toBe('unavailable');
    expect(openIosSettings).not.toHaveBeenCalled();
  });

  it('falls back to Android security settings when biometric enrollment is rejected', async () => {
    const startAndroidActivity = jest
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce({ resultCode: -1 });
    await expect(
      openDeviceSecuritySettings({
        platform: 'android',
        startAndroidActivity,
        openIosSettings: jest.fn(),
      }),
    ).resolves.toBe('opened');
    expect(startAndroidActivity).toHaveBeenLastCalledWith(ANDROID_DEVICE_SECURITY_SETTINGS);
  });
});

describe('security screen enrollment wiring', () => {
  const enrollmentSource = readFileSync(path.join(root, 'lib', 'platform', 'biometricEnrollment.ts'), 'utf8');
  const securitySource = readFileSync(path.join(root, 'app', 'security.tsx'), 'utf8');
  const deviceLockSource = readFileSync(path.join(root, 'components', 'DeviceLock.tsx'), 'utf8');
  const packageSource = readFileSync(path.join(root, 'package.json'), 'utf8');

  it('checks enrollment again from the Security screen and opens device settings', () => {
    expect(securitySource).toContain('readBiometricEnrollment');
    expect(securitySource).toContain('shouldRefreshBiometricEnrollmentOnAppState');
    expect(securitySource).toContain('AppState.addEventListener');
    expect(securitySource).toContain('IntentLauncher.startActivityAsync');
    expect(securitySource).toContain('Linking.openSettings');
    expect(securitySource).toContain('appLockSwitchSubtitle');
    expect(securitySource).toContain('managePhoneBiometrics');
    expect(securitySource).toContain('accessibilityRole="switch"');
    expect(securitySource).not.toContain('appLockAlwaysOn');
    expect(securitySource).not.toContain('strongBiometricsRequired');
    expect(securitySource).not.toContain('authenticateAsync');
    expect(securitySource).not.toContain('SecureStore');
    expect(securitySource).not.toContain('AsyncStorage');
    expect(securitySource).not.toContain('expo-iap');
    expect(enrollmentSource).not.toContain('fingerprint_enabled');
    expect(enrollmentSource).not.toContain('authenticateAsync');
    expect(packageSource).toContain('"expo-intent-launcher"');
  });

  it('keeps CircuSave password unlock available and the strong biometric policy', () => {
    expect(deviceLockSource).toContain('verifyAccountPassword');
    expect(deviceLockSource).toContain('show_password_fallback');
    expect(deviceLockSource).toContain('usePassword');
    expect(deviceLockSource).toContain('disableDeviceFallback: true');
    expect(deviceLockSource).toContain("biometricsSecurityLevel: 'strong'");
    expect(deviceLockSource).not.toContain('console.log');
    expect(securitySource).toContain('verifyAccountPassword');
  });

  it('uses accurate English, Spanish, and Haitian Creole biometric copy', () => {
    const keys = [
      'appLock',
      'appLockSwitchSubtitle',
      'biometricUnlock',
      'managePhoneBiometrics',
      'availableSensors',
      'weakBiometricOnly',
      'supportedFaceId',
      'supportedFaceRecognition',
      'supportedTouchId',
      'strongBiometricsRequired',
      'appLockSubtitleIos',
      'appLockSubtitleAndroid',
    ] as const;
    for (const language of ['en', 'es', 'ht'] as const) {
      const catalog = JSON.parse(
        readFileSync(path.join(root, 'lib', 'i18n', 'locales', language, 'security.json'), 'utf8'),
      ) as Record<string, string>;
      for (const key of keys) {
        expect(catalog[key]?.length).toBeGreaterThan(0);
      }
      expect(catalog.appLockSubtitle.toLowerCase()).toMatch(/password|contraseña|modpas/);
      expect(catalog.appLockSubtitleAndroid).not.toMatch(/Face ID/);
      expect(catalog.appLockSubtitleIos).toMatch(/Face ID/);
    }
    expect(securitySource).toContain('biometricUnlockSubtitleIos');
    expect(securitySource).not.toContain('>10 seconds<');
    expect(JSON.parse(readFileSync(path.join(root, 'lib', 'i18n', 'locales', 'en', 'security.json'), 'utf8')).appLock).toBe(
      'App Lock',
    );
    expect(JSON.parse(readFileSync(path.join(root, 'lib', 'i18n', 'locales', 'en', 'security.json'), 'utf8')).managePhoneBiometrics).toBe(
      'Manage phone biometrics',
    );
    expect(
      JSON.parse(readFileSync(path.join(root, 'lib', 'i18n', 'locales', 'en', 'security.json'), 'utf8'))
        .supportedFaceRecognition,
    ).toBe('Face recognition');
    expect(
      JSON.parse(readFileSync(path.join(root, 'lib', 'i18n', 'locales', 'en', 'security.json'), 'utf8'))
        .supportedFaceId,
    ).toBe('Face ID');
  });
});
