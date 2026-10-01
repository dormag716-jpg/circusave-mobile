import { Platform } from 'react-native';
import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
} from 'react-native-nitro-google-signin';

import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '@/lib/shared/config';
import { createAuthNonce } from '@/lib/auth/federatedSignIn';
import {
  classifyGoogleNativeError,
  type GoogleSignInStatus,
} from '@/lib/auth/googleSignInOutcome';
import { logClientError } from '@/lib/platform/errorLogging';

export type GoogleIdentityResult =
  | { status: 'success'; idToken: string; authNonce: string; name?: string }
  | { status: Exclude<GoogleSignInStatus, 'success' | 'network_failure' | 'backend_failure'> };

function report(
  status: Exclude<GoogleIdentityResult, { status: 'success' }>['status'],
): GoogleIdentityResult {
  if (status !== 'cancelled') {
    logClientError('Google sign-in was not completed', new Error(status), { status });
  }
  return { status };
}

export async function requestGoogleIdentity(): Promise<GoogleIdentityResult> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    return report('not_configured');
  }
  let nonce: { raw: string; hash: string };
  try {
    nonce = createAuthNonce();
  } catch {
    logClientError('Google sign-in nonce was unavailable', new Error('nonce_unavailable'));
    return { status: 'nonce_unavailable' };
  }
  try {
    GoogleOneTapSignIn.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID || null,
      nonce: nonce.hash,
      offlineAccess: false,
    });
    if (Platform.OS === 'android') {
      await GoogleOneTapSignIn.checkPlayServices(false);
    }
    let response = await GoogleOneTapSignIn.signIn();
    if (isNoSavedCredentialFoundResponse(response)) {
      response = await GoogleOneTapSignIn.createAccount();
    }
    if (isNoSavedCredentialFoundResponse(response)) {
      response = await GoogleOneTapSignIn.presentExplicitSignIn();
    }
    if (isCancelledResponse(response)) {
      return { status: 'cancelled' };
    }
    if (!isSuccessResponse(response) || !response.data.idToken) {
      return report('unknown');
    }
    const name = response.data.user?.name?.trim();
    return {
      status: 'success',
      idToken: response.data.idToken,
      authNonce: nonce.raw,
      ...(name ? { name } : {}),
    };
  } catch (error) {
    const status = classifyGoogleNativeError(error);
    if (status === 'network_failure' || status === 'backend_failure' || status === 'success') {
      return report('unknown');
    }
    return report(status);
  }
}
