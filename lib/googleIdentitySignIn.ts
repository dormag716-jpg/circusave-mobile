import { Platform } from 'react-native';
import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  statusCodes,
} from 'react-native-nitro-google-signin';

import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '@/lib/config';
import { createAuthNonce } from '@/lib/federatedSignIn';

export type NativeIdentityResult =
  | { status: 'ready'; idToken: string; authNonce: string; name?: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'not_configured' };

export async function requestGoogleIdentity(): Promise<NativeIdentityResult> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    return { status: 'not_configured' };
  }
  let nonce: { raw: string; hash: string };
  try {
    nonce = createAuthNonce();
  } catch {
    return { status: 'unavailable' };
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
      return { status: 'unavailable' };
    }
    const name = response.data.user?.name?.trim();
    return {
      status: 'ready',
      idToken: response.data.idToken,
      authNonce: nonce.raw,
      ...(name ? { name } : {}),
    };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      return { status: 'cancelled' };
    }
    return { status: 'unavailable' };
  }
}
