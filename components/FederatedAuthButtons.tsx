import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { requestAppleIdentity } from '@/lib/auth/appleIdentitySignIn';
import type { FederatedIdentityProof } from '@/lib/auth/federatedSignIn';
import { requestGoogleIdentity } from '@/lib/auth/googleIdentitySignIn';
import {
  classifyFederatedSubmitError,
  googleSignInMessageKey,
  type GoogleSignInStatus,
} from '@/lib/auth/googleSignInOutcome';
import { logClientError } from '@/lib/platform/errorLogging';
import { colors, radii } from '@/lib/shared/theme';
import { useLayoutMetrics } from '@/lib/shared/useLayoutMetrics';

type Props = {
  disabled?: boolean;
  onIdentity: (proof: FederatedIdentityProof) => Promise<void>;
  onGoogleStatus?: (status: GoogleSignInStatus) => void;
};

export function FederatedAuthButtons({
  disabled = false,
  onIdentity,
  onGoogleStatus,
}: Props) {
  const { t } = useTranslation('auth');
  const compact = useLayoutMetrics().compact;
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return undefined;
    }
    let active = true;
    void AppleAuthentication.isAvailableAsync().then((available) => {
      if (active) {
        setAppleAvailable(available);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  function reportGoogle(status: GoogleSignInStatus) {
    if (googleSignInMessageKey(status)) {
      onGoogleStatus?.(status);
    }
  }

  async function startGoogle() {
    if (disabled || busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await requestGoogleIdentity();
      if (result.status === 'cancelled') {
        return;
      }
      if (result.status !== 'success') {
        reportGoogle(result.status);
        return;
      }
      try {
        await onIdentity({
          provider: 'google',
          idToken: result.idToken,
          authNonce: result.authNonce,
          ...(result.name ? { name: result.name } : {}),
        });
      } catch (error) {
        const status = classifyFederatedSubmitError(error);
        logClientError('Google sign-in was not completed', new Error(status), { status });
        reportGoogle(status);
      }
    } finally {
      setBusy(false);
    }
  }

  async function startApple() {
    if (disabled || busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await requestAppleIdentity();
      if (result.status !== 'success') {
        return;
      }
      await onIdentity({
        provider: 'apple',
        idToken: result.idToken,
        authNonce: result.authNonce,
        ...(result.name ? { name: result.name } : {}),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Pressable
        style={[
          styles.googleButton,
          compact && styles.googleButtonCompact,
          (disabled || busy) && styles.disabled,
        ]}
        onPress={() => {
          void startGoogle();
        }}
        disabled={disabled || busy}
        accessibilityRole="button"
        accessibilityLabel={t('federated.continueGoogle')}
      >
        {busy ? (
          <ActivityIndicator color={colors.textStrong} />
        ) : (
          <Text style={styles.googleText}>{t('federated.continueGoogle')}</Text>
        )}
      </Pressable>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radii.pill}
          style={styles.appleButton}
          onPress={() => {
            void startApple();
          }}
        />
      ) : null}
      <Text style={[styles.or, compact && styles.orCompact]}>{t('federated.or')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  wrapCompact: { marginBottom: 0 },
  googleButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  googleButtonCompact: { minHeight: 44 },
  googleText: { color: colors.textStrong, fontSize: 16, fontWeight: '700' },
  appleButton: { height: 48, marginTop: 12, width: '100%' },
  or: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginVertical: 14,
    textAlign: 'center',
  },
  orCompact: { fontSize: 12, marginVertical: 4 },
  disabled: { opacity: 0.6 },
});
