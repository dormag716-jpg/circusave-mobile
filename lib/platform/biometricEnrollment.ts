/**
 * Device biometric enrollment for the Security screen.
 * This reads hardware and enrollment flags only. It does not authenticate,
 * and it does not read, capture, or store a fingerprint, face, or iris sample.
 *
 * Android opens system security settings through expo-intent-launcher.
 * The Security screen uses the module in the installed build. A failed
 * intent is reported by that call, not by a stored Play version code.
 */

export const BIOMETRIC_TYPE_FINGERPRINT = 1;
export const BIOMETRIC_TYPE_FACIAL_RECOGNITION = 2;
export const BIOMETRIC_TYPE_IRIS = 3;

export const BIOMETRIC_LEVEL_NONE = 0;
export const BIOMETRIC_LEVEL_SECRET = 1;
export const BIOMETRIC_LEVEL_WEAK = 2;
export const BIOMETRIC_LEVEL_STRONG = 3;

export const ANDROID_DEVICE_SECURITY_SETTINGS = 'android.settings.SECURITY_SETTINGS';
export const ANDROID_BIOMETRIC_ENROLL = 'android.settings.BIOMETRIC_ENROLL';
export const ANDROID_BIOMETRIC_AUTHENTICATORS_EXTRA =
  'android.provider.extra.BIOMETRIC_AUTHENTICATORS_ALLOWED';
/** Android BiometricManager.Authenticators.BIOMETRIC_STRONG (Class 3). */
export const ANDROID_BIOMETRIC_STRONG = 15;

export type BiometricPlatform = 'ios' | 'android' | 'other';

export type SupportedBiometricLabel =
  | 'fingerprint'
  | 'touch_id'
  | 'face_id'
  | 'face_recognition'
  | 'iris';

export type BiometricEnrollmentState = 'compatible' | 'weak_only' | 'enrolled_unproven' | 'none';

export type BiometricSecurityPresentation = {
  appLockAlwaysOn: true;
  hardwareAvailable: boolean;
  enrollment: BiometricEnrollmentState;
  requiresStrongBiometrics: true;
  supported: SupportedBiometricLabel[];
  showSettings: boolean;
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

const SUPPORTED_LABEL_KEYS = {
  fingerprint: 'supportedFingerprint',
  touch_id: 'supportedTouchId',
  face_id: 'supportedFaceId',
  face_recognition: 'supportedFaceRecognition',
  iris: 'supportedIris',
} as const;

const ENROLLMENT_KEYS = {
  compatible: 'compatibleBiometricsEnrolled',
  weak_only: 'weakBiometricOnly',
  enrolled_unproven: 'biometricEnrolledUnproven',
  none: 'noCompatibleBiometric',
} as const;

function asTypes(value: unknown): number[] {
  const source = Array.isArray(value)
    ? value
    : value instanceof Set
      ? [...value]
      : [];
  return source.filter((item): item is number => typeof item === 'number');
}

function enrollmentState(report: BiometricHardwareReport): BiometricEnrollmentState {
  if (!report.hasHardware || !report.isEnrolled) {
    return 'none';
  }
  if (report.enrolledLevel === BIOMETRIC_LEVEL_STRONG) {
    return 'compatible';
  }
  if (report.enrolledLevel === BIOMETRIC_LEVEL_WEAK) {
    return 'weak_only';
  }
  return 'enrolled_unproven';
}

function supportedLabels(
  report: BiometricHardwareReport,
  platform: BiometricPlatform,
): SupportedBiometricLabel[] {
  const types = new Set(report.supportedTypes);
  const labels: SupportedBiometricLabel[] = [];
  if (types.has(BIOMETRIC_TYPE_FINGERPRINT)) {
    labels.push(platform === 'ios' ? 'touch_id' : 'fingerprint');
  }
  if (types.has(BIOMETRIC_TYPE_FACIAL_RECOGNITION)) {
    labels.push(platform === 'ios' ? 'face_id' : 'face_recognition');
  }
  if (types.has(BIOMETRIC_TYPE_IRIS)) {
    labels.push('iris');
  }
  return labels;
}

/**
 * CircuSave's lock accepts only strong Class 3 biometrics. The operating
 * system does not say which sensor is enrolled, so this does not treat a
 * strong result as a fingerprint or a weak result as a face.
 */
export function presentBiometricSecurity(
  report: BiometricHardwareReport,
  platform: BiometricPlatform,
): BiometricSecurityPresentation {
  const supported = supportedLabels(report, platform);
  return {
    appLockAlwaysOn: true,
    hardwareAvailable: report.hasHardware,
    enrollment: enrollmentState(report),
    requiresStrongBiometrics: true,
    supported,
    showSettings: platform === 'android' || (platform === 'ios' && report.hasHardware),
  };
}

export function biometricEnrollmentTranslationKey(
  enrollment: BiometricEnrollmentState,
): (typeof ENROLLMENT_KEYS)[BiometricEnrollmentState] {
  return ENROLLMENT_KEYS[enrollment];
}

export function joinSensorNames(names: readonly string[], andWord: string): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  if (names.length === 2) {
    return `${names[0]} ${andWord} ${names[1]}`;
  }
  return `${names.slice(0, -1).join(', ')}, ${andWord} ${names[names.length - 1]}`;
}

export function supportedBiometricTranslationKey(
  label: SupportedBiometricLabel,
): (typeof SUPPORTED_LABEL_KEYS)[SupportedBiometricLabel] {
  return SUPPORTED_LABEL_KEYS[label];
}

export async function readBiometricEnrollment(
  probe: BiometricHardwareProbe,
): Promise<BiometricHardwareReport> {
  const [hasHardware, isEnrolled, supportedTypes, enrolledLevel] = await Promise.all([
    probe.hasHardwareAsync(),
    probe.isEnrolledAsync(),
    probe.supportedAuthenticationTypesAsync(),
    probe.getEnrolledLevelAsync(),
  ]);
  return {
    hasHardware: hasHardware === true,
    isEnrolled: isEnrolled === true,
    supportedTypes: asTypes(supportedTypes),
    enrolledLevel:
      typeof enrolledLevel === 'number' && Number.isFinite(enrolledLevel)
        ? enrolledLevel
        : BIOMETRIC_LEVEL_NONE,
  };
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

export async function openDeviceSecuritySettings(input: {
  platform: string;
  startAndroidActivity?: (
    action: string,
    params?: { extra?: Record<string, number> },
  ) => Promise<unknown>;
  openIosSettings?: () => Promise<unknown>;
}): Promise<'opened' | 'unavailable'> {
  const platform = String(input.platform || '').trim().toLowerCase();
  if (platform === 'android') {
    if (!input.startAndroidActivity) {
      return 'unavailable';
    }
    try {
      await input.startAndroidActivity(ANDROID_BIOMETRIC_ENROLL, {
        extra: { [ANDROID_BIOMETRIC_AUTHENTICATORS_EXTRA]: ANDROID_BIOMETRIC_STRONG },
      });
      return 'opened';
    } catch {
      try {
        await input.startAndroidActivity(ANDROID_DEVICE_SECURITY_SETTINGS);
        return 'opened';
      } catch {
        return 'unavailable';
      }
    }
  }
  if (platform === 'ios') {
    if (!input.openIosSettings) {
      return 'unavailable';
    }
    try {
      await input.openIosSettings();
      return 'opened';
    } catch {
      return 'unavailable';
    }
  }
  return 'unavailable';
}
