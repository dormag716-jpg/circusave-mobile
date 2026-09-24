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
  BIOMETRICS_NOT_CONFIGURED,
  PUBLISHED_ANDROID_VERSION_CODE_WITHOUT_SECURITY_SETTINGS,
  androidBuildIncludesSecuritySettingsIntent,
  biometricSetupTranslationKey,
  biometricStatusTranslationKey,
  classifyBiometricEnrollment,
  isLatestEnrollmentRead,
  openDeviceSecuritySettings,
  readBiometricEnrollment,
  shouldRefreshBiometricEnrollmentOnAppState,
  type BiometricHardwareReport,
} from '../biometricEnrollment';

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

describe('biometric enrollment status', () => {
  it('shows fingerprint enabled when a fingerprint is enrolled', () => {
    expect(
      classifyBiometricEnrollment(
        report({
          isEnrolled: true,
          supportedTypes: [BIOMETRIC_TYPE_FINGERPRINT],
          enrolledLevel: BIOMETRIC_LEVEL_STRONG,
        }),
      ),
    ).toEqual({ status: 'fingerprint_enabled', setup: null });
  });

  it('shows Face ID enabled when facial recognition is enrolled', () => {
    expect(
      classifyBiometricEnrollment(
        report({
          isEnrolled: true,
          supportedTypes: [BIOMETRIC_TYPE_FACIAL_RECOGNITION],
          enrolledLevel: BIOMETRIC_LEVEL_STRONG,
        }),
      ),
    ).toEqual({ status: 'face_id_enabled', setup: null });
  });

  it('keeps Face ID enabled when the sensor is locked out', () => {
    expect(
      classifyBiometricEnrollment(
        report({
          isEnrolled: true,
          supportedTypes: [BIOMETRIC_TYPE_FACIAL_RECOGNITION],
          enrolledLevel: BIOMETRIC_LEVEL_SECRET,
        }),
      ).status,
    ).toBe('face_id_enabled');
  });

  it('shows biometrics not configured when nothing is enrolled', () => {
    expect(
      classifyBiometricEnrollment(
        report({
          supportedTypes: [BIOMETRIC_TYPE_FINGERPRINT],
          enrolledLevel: BIOMETRIC_LEVEL_SECRET,
        }),
      ),
    ).toEqual({ status: 'not_configured', setup: 'fingerprint' });
    expect(classifyBiometricEnrollment(report({ hasHardware: false }))).toEqual(
      BIOMETRICS_NOT_CONFIGURED,
    );
  });

  it('offers Face ID setup only for a face sensor that is not enrolled', () => {
    expect(
      classifyBiometricEnrollment(
        report({ supportedTypes: [BIOMETRIC_TYPE_FACIAL_RECOGNITION] }),
      ),
    ).toEqual({ status: 'not_configured', setup: 'face_id' });
  });

  it('offers fingerprint setup when both sensors exist and neither is enrolled', () => {
    expect(
      classifyBiometricEnrollment(
        report({
          supportedTypes: [BIOMETRIC_TYPE_FINGERPRINT, BIOMETRIC_TYPE_FACIAL_RECOGNITION],
        }),
      ).setup,
    ).toBe('fingerprint');
  });

  it('labels weak enrollment on a dual-sensor device as Face ID', () => {
    expect(
      classifyBiometricEnrollment(
        report({
          isEnrolled: true,
          supportedTypes: [BIOMETRIC_TYPE_FINGERPRINT, BIOMETRIC_TYPE_FACIAL_RECOGNITION],
          enrolledLevel: BIOMETRIC_LEVEL_WEAK,
        }),
      ),
    ).toEqual({ status: 'face_id_enabled', setup: null });
  });

  it('labels strong enrollment on a dual-sensor device as fingerprint', () => {
    expect(
      classifyBiometricEnrollment(
        report({
          isEnrolled: true,
          supportedTypes: [BIOMETRIC_TYPE_FINGERPRINT, BIOMETRIC_TYPE_FACIAL_RECOGNITION],
          enrolledLevel: BIOMETRIC_LEVEL_STRONG,
        }),
      ),
    ).toEqual({ status: 'fingerprint_enabled', setup: null });
  });

  it('does not call a fingerprint or Face ID enrollment an iris sensor', () => {
    expect(
      classifyBiometricEnrollment(
        report({
          isEnrolled: true,
          supportedTypes: [BIOMETRIC_TYPE_IRIS],
          enrolledLevel: BIOMETRIC_LEVEL_STRONG,
        }),
      ),
    ).toEqual(BIOMETRICS_NOT_CONFIGURED);
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

    expect(view).toEqual({ status: 'fingerprint_enabled', setup: null });
    expect(calls).toEqual(['hardware', 'enrolled', 'types', 'level']);
  });

  it('treats a failed hardware report as not configured', async () => {
    const view = await readBiometricEnrollment({
      hasHardwareAsync: async () => false,
      isEnrolledAsync: async () => true,
      supportedAuthenticationTypesAsync: async () => [BIOMETRIC_TYPE_FINGERPRINT],
      getEnrolledLevelAsync: async () => BIOMETRIC_LEVEL_STRONG,
    });
    expect(view).toEqual(BIOMETRICS_NOT_CONFIGURED);
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
    expect(startAndroidActivity).toHaveBeenCalledWith(ANDROID_DEVICE_SECURITY_SETTINGS);
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

  it('requires a new Android build after the published version code 8 bundle', () => {
    expect(PUBLISHED_ANDROID_VERSION_CODE_WITHOUT_SECURITY_SETTINGS).toBe(8);
    expect(androidBuildIncludesSecuritySettingsIntent(8)).toBe(false);
    expect(androidBuildIncludesSecuritySettingsIntent(9)).toBe(true);
    expect(androidBuildIncludesSecuritySettingsIntent(1.5)).toBe(false);
  });
});

describe('security screen enrollment wiring', () => {
  const enrollmentSource = readFileSync(
    path.join(root, 'lib', 'biometricEnrollment.ts'),
    'utf8',
  );
  const securitySource = readFileSync(path.join(root, 'app', 'security.tsx'), 'utf8');
  const deviceLockSource = readFileSync(
    path.join(root, 'components', 'DeviceLock.tsx'),
    'utf8',
  );
  const packageSource = readFileSync(path.join(root, 'package.json'), 'utf8');

  it('checks enrollment again from the Security screen and opens device settings', () => {
    expect(securitySource).toContain('readBiometricEnrollment');
    expect(securitySource).toContain('shouldRefreshBiometricEnrollmentOnAppState');
    expect(securitySource).toContain('AppState.addEventListener');
    expect(securitySource).toContain('IntentLauncher.startActivityAsync');
    expect(securitySource).toContain('Linking.openSettings');
    expect(securitySource).toContain('biometricAssurance');
    expect(securitySource).toContain('appLockSubtitle');
    expect(securitySource).not.toContain('<Switch');
    expect(securitySource).not.toContain('authenticateAsync');
    expect(securitySource).not.toContain('SecureStore');
    expect(securitySource).not.toContain('AsyncStorage');
    expect(securitySource).not.toContain('expo-iap');
    expect(securitySource).not.toContain('GoogleSignin');
    expect(enrollmentSource).not.toContain('authenticateAsync');
    expect(enrollmentSource).not.toContain('SecureStore');
    expect(enrollmentSource).not.toContain('AsyncStorage');
    expect(enrollmentSource).not.toContain('expo-iap');
    expect(packageSource).toContain('"expo-intent-launcher"');
  });

  it('keeps CircuSave password unlock available', () => {
    expect(deviceLockSource).toContain('verifyAccountPassword');
    expect(deviceLockSource).toContain('show_password_fallback');
    expect(deviceLockSource).toContain('usePassword');
    expect(deviceLockSource).toContain('disableDeviceFallback: true');
    expect(securitySource).toContain('biometricAssurance');
  });

  it('uses the English, Spanish, and Haitian Creole enrollment copy', () => {
    const expected = {
      en: {
        fingerprintEnabled: 'Fingerprint enabled',
        faceIdEnabled: 'Face ID enabled',
        biometricsNotConfigured: 'Biometrics not configured',
        setupFingerprint: 'Set up fingerprint',
        setupFaceId: 'Set up Face ID',
      },
      es: {
        fingerprintEnabled: 'Huella activada',
        faceIdEnabled: 'Face ID activado',
        biometricsNotConfigured: 'Datos biométricos no configurados',
        setupFingerprint: 'Configurar huella',
        setupFaceId: 'Configurar Face ID',
      },
      ht: {
        fingerprintEnabled: 'Anprent aktive',
        faceIdEnabled: 'Face ID aktive',
        biometricsNotConfigured: 'Biometrik pa konfigire',
        setupFingerprint: 'Konfigire anprent',
        setupFaceId: 'Konfigire Face ID',
      },
    } as const;

    for (const language of ['en', 'es', 'ht'] as const) {
      const catalog = JSON.parse(
        readFileSync(
          path.join(root, 'lib', 'i18n', 'locales', language, 'security.json'),
          'utf8',
        ),
      ) as Record<string, string>;
      expect(catalog.fingerprintEnabled).toBe(expected[language].fingerprintEnabled);
      expect(catalog.faceIdEnabled).toBe(expected[language].faceIdEnabled);
      expect(catalog.biometricsNotConfigured).toBe(expected[language].biometricsNotConfigured);
      expect(catalog.setupFingerprint).toBe(expected[language].setupFingerprint);
      expect(catalog.setupFaceId).toBe(expected[language].setupFaceId);
      expect(catalog.biometricAssurance.length).toBeGreaterThan(0);
      expect(catalog.appLockSubtitle.toLowerCase()).toMatch(/password|contraseña|modpas/);
    }

    expect(biometricStatusTranslationKey('fingerprint_enabled')).toBe('fingerprintEnabled');
    expect(biometricStatusTranslationKey('face_id_enabled')).toBe('faceIdEnabled');
    expect(biometricStatusTranslationKey('not_configured')).toBe('biometricsNotConfigured');
    expect(biometricSetupTranslationKey('fingerprint')).toBe('setupFingerprint');
    expect(biometricSetupTranslationKey('face_id')).toBe('setupFaceId');
  });
});
