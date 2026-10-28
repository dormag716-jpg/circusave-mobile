import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { createAuthNonce } from '@/lib/auth/federatedSignIn';

export type AppleIdentityResult =
  | { status: 'success'; idToken: string; authNonce: string; name?: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' };

function appleName(fullName: AppleAuthentication.AppleAuthenticationFullName | null): string {
  return [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ').trim();
}

export async function requestAppleIdentity(): Promise<AppleIdentityResult> {
  if (Platform.OS !== 'ios') {
    return { status: 'unavailable' };
  }
  try {
    if (!(await AppleAuthentication.isAvailableAsync())) {
      return { status: 'unavailable' };
    }
    const nonce = createAuthNonce();
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: nonce.hash,
    });
    if (!credential.identityToken) {
      return { status: 'unavailable' };
    }
    const name = appleName(credential.fullName);
    return {
      status: 'success',
      idToken: credential.identityToken,
      authNonce: nonce.raw,
      ...(name ? { name } : {}),
    };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === 'ERR_REQUEST_CANCELED') {
      return { status: 'cancelled' };
    }
    return { status: 'unavailable' };
  }
}
