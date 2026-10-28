import { isErrorWithCode, statusCodes } from 'react-native-nitro-google-signin';

import { ApiError } from '@/lib/platform/networkErrors';

export type GoogleSignInStatus =
  | 'success'
  | 'cancelled'
  | 'in_progress'
  | 'play_services_unavailable'
  | 'not_configured'
  | 'native_module_unavailable'
  | 'nonce_unavailable'
  | 'network_failure'
  | 'backend_failure'
  | 'unknown';

export type GoogleSignInMessageKey = {
  title: string;
  body: string;
};

const MESSAGE_KEYS: Partial<Record<GoogleSignInStatus, GoogleSignInMessageKey>> = {
  in_progress: {
    title: 'federated.inProgressTitle',
    body: 'federated.inProgressBody',
  },
  play_services_unavailable: {
    title: 'federated.playServicesTitle',
    body: 'federated.playServicesBody',
  },
  not_configured: {
    title: 'federated.notConfiguredTitle',
    body: 'federated.notConfiguredBody',
  },
  native_module_unavailable: {
    title: 'federated.unavailableTitle',
    body: 'federated.unavailableBody',
  },
  nonce_unavailable: {
    title: 'federated.nonceTitle',
    body: 'federated.nonceBody',
  },
  network_failure: {
    title: 'federated.networkTitle',
    body: 'federated.networkBody',
  },
  backend_failure: {
    title: 'federated.backendTitle',
    body: 'federated.backendBody',
  },
  unknown: {
    title: 'federated.unknownTitle',
    body: 'federated.unknownBody',
  },
};

export function googleSignInMessageKey(
  status: GoogleSignInStatus,
): GoogleSignInMessageKey | null {
  return MESSAGE_KEYS[status] ?? null;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '';
}

function isMissingNativeModule(error: unknown): boolean {
  const message = errorText(error);
  return /native module|nitro module|turbomodule|cannot find module|invariant violation|is not a function/i.test(
    message,
  );
}

export function classifyGoogleNativeError(error: unknown): GoogleSignInStatus {
  if (isErrorWithCode(error)) {
    switch (error.code) {
      case statusCodes.SIGN_IN_CANCELLED:
        return 'cancelled';
      case statusCodes.IN_PROGRESS:
        return 'in_progress';
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        return 'play_services_unavailable';
      case statusCodes.DEVELOPER_ERROR:
        return 'not_configured';
      case statusCodes.ONE_TAP_START_FAILED:
      case statusCodes.SIGN_IN_REQUIRED:
        return 'unknown';
      default:
        break;
    }
  }
  if (isMissingNativeModule(error)) {
    return 'native_module_unavailable';
  }
  return 'unknown';
}

export function classifyFederatedSubmitError(error: unknown): GoogleSignInStatus {
  if (error instanceof ApiError) {
    if (error.status === 0 || error.status >= 500) {
      return 'network_failure';
    }
    return 'backend_failure';
  }
  const message = errorText(error);
  if (/network request failed|failed to fetch|offline|internet connection|timeout/i.test(message)) {
    return 'network_failure';
  }
  return 'backend_failure';
}
