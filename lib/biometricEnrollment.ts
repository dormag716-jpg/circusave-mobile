/**
 * Device biometric enrollment for the Security screen.
 * This reads hardware and enrollment flags only. It does not authenticate,
 * and it does not read, capture, or store a fingerprint, face, or iris sample.
 *
 * Android opens system security settings through expo-intent-launcher.
 * The published Play bundle at version code 8 was built without that native
 * module. A JavaScript update cannot add it, so this setup action requires
 * a new Android build.
 */

export const BIOMETRIC_TYPE_FINGERPRINT = 1;
export const BIOMETRIC_TYPE_FACIAL_RECOGNITION = 2;
export const BIOMETRIC_TYPE_IRIS = 3;

export const BIOMETRIC_LEVEL_NONE = 0;
export const BIOMETRIC_LEVEL_SECRET = 1;
export const BIOMETRIC_LEVEL_WEAK = 2;
export const BIOMETRIC_LEVEL_STRONG = 3;

/** Play version code whose binary does not contain expo-intent-launcher. */
export const PUBLISHED_ANDROID_VERSION_CODE_WITHOUT_SECURITY_SETTINGS = 8;

export const ANDROID_DEVICE_SECURITY_SETTINGS = 'android.settings.SECURITY_SETTINGS';

export type BiometricEnrollmentStatus =
  | 'fingerprint_enabled'
  | 'face_id_enabled'
  | 'not_configured';

export type BiometricSetupKind = 'fingerprint' | 'face_id';

export type BiometricEnrollmentView = {
  status: BiometricEnrollmentStatus;
  setup: BiometricSetupKind | null;
};

export type BiometricHardwareReport = {
  hasHardware: boolean;
  isEnrolled: boolean;
  supportedTypes: readonly number[];
  enrolledLevel: number;
};

export type BiometricHardwareProbe = {
  hasHardwareAsync: () => Promise<boolean> | boolean;
  isEnrolledAsync: () => Promise<boolean> | boolean;
  supportedAuthenticationTypesAsync: () => Promise<readonly number[]> | readonly number[];
  getEnrolledLevelAsync: () => Promise<number> | number;
};

export const BIOMETRICS_NOT_CONFIGURED: BiometricEnrollmentView = {
  status: 'not_configured',
  setup: null,
};

const STATUS_KEYS = {
  fingerprint_enabled: 'fingerprintEnabled',
  face_id_enabled: 'faceIdEnabled',
  not_configured: 'biometricsNotConfigured',
} as const;

const SETUP_KEYS = {
  fingerprint: 'setupFingerprint',
  face_id: 'setupFaceId',
} as const;

function asTypes(value: unknown): number[] {
  const source = Array.isArray(value)
    ? value
    : value instanceof Set
      ? [...value]
      : [];
  return source.filter((item): item is number => typeof item === 'number');
}

function setupForHardware(
  hasFingerprint: boolean,
  hasFace: boolean,
  hasHardware: boolean,
): BiometricSetupKind | null {
  if (!hasHardware) {
    return null;
  }
  if (hasFace && !hasFingerprint) {
    return 'face_id';
  }
  if (hasFingerprint) {
    return 'fingerprint';
  }
  return null;
}

export function classifyBiometricEnrollment(
  report: BiometricHardwareReport,
): BiometricEnrollmentView {
  const types = new Set(report.supportedTypes);
  const hasFingerprint = types.has(BIOMETRIC_TYPE_FINGERPRINT);
  const hasFace = types.has(BIOMETRIC_TYPE_FACIAL_RECOGNITION);
  const enrolled = report.hasHardware && report.isEnrolled;

  if (!enrolled) {
    return {
      status: 'not_configured',
      setup: setupForHardware(hasFingerprint, hasFace, report.hasHardware),
    };
  }

  if (hasFace && !hasFingerprint) {
    return { status: 'face_id_enabled', setup: null };
  }
  if (hasFingerprint && !hasFace) {
    return { status: 'fingerprint_enabled', setup: null };
  }
  if (hasFace && hasFingerprint) {
    // Weak success with both sensors is camera face. Fingerprint enrollment
    // satisfies strong biometrics. Strong success with both sensors is labeled
    // fingerprint because the platform does not say which sensor is enrolled.
    if (report.enrolledLevel === BIOMETRIC_LEVEL_WEAK) {
      return { status: 'face_id_enabled', setup: null };
    }
    return { status: 'fingerprint_enabled', setup: null };
  }

  return BIOMETRICS_NOT_CONFIGURED;
}

export function biometricStatusTranslationKey(
  status: BiometricEnrollmentStatus,
): (typeof STATUS_KEYS)[BiometricEnrollmentStatus] {
  return STATUS_KEYS[status];
}

export function biometricSetupTranslationKey(
  setup: BiometricSetupKind,
): (typeof SETUP_KEYS)[BiometricSetupKind] {
  return SETUP_KEYS[setup];
}

export async function readBiometricEnrollment(
  probe: BiometricHardwareProbe,
): Promise<BiometricEnrollmentView> {
  const [hasHardware, isEnrolled, supportedTypes, enrolledLevel] = await Promise.all([
    probe.hasHardwareAsync(),
    probe.isEnrolledAsync(),
    probe.supportedAuthenticationTypesAsync(),
    probe.getEnrolledLevelAsync(),
  ]);
  return classifyBiometricEnrollment({
    hasHardware: hasHardware === true,
    isEnrolled: isEnrolled === true,
    supportedTypes: asTypes(supportedTypes),
    enrolledLevel:
      typeof enrolledLevel === 'number' && Number.isFinite(enrolledLevel)
        ? enrolledLevel
        : BIOMETRIC_LEVEL_NONE,
  });
}

export function shouldRefreshBiometricEnrollmentOnAppState(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean {
  return String(next || '').trim() === 'active' && String(previous || '').trim() !== 'active';
}

export function isLatestEnrollmentRead(readId: number, latestReadId: number): boolean {
  return readId > 0 && readId === latestReadId;
}

export function androidBuildIncludesSecuritySettingsIntent(versionCode: number): boolean {
  return (
    Number.isInteger(versionCode) &&
    versionCode > PUBLISHED_ANDROID_VERSION_CODE_WITHOUT_SECURITY_SETTINGS
  );
}

export async function openDeviceSecuritySettings(input: {
  platform: string;
  startAndroidActivity?: (action: string) => Promise<unknown>;
  openIosSettings?: () => Promise<unknown>;
}): Promise<'opened' | 'unavailable'> {
  const platform = String(input.platform || '').trim().toLowerCase();
  try {
    if (platform === 'android') {
      if (!input.startAndroidActivity) {
        return 'unavailable';
      }
      await input.startAndroidActivity(ANDROID_DEVICE_SECURITY_SETTINGS);
      return 'opened';
    }
    if (platform === 'ios') {
      if (!input.openIosSettings) {
        return 'unavailable';
      }
      await input.openIosSettings();
      return 'opened';
    }
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}
