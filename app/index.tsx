import { Redirect, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuthSession } from '@/lib/auth/authContext';
import { restoreRegistrationVerification } from '@/lib/auth/registrationVerification';
import { colors } from '@/lib/shared/theme';

const VERIFY_EMAIL_HREF = '/verify-email' as Href;

export default function Index() {
  const { status } = useAuthSession();
  // After the app was closed during sign-up, bring back the saved code-screen state before
  // choosing where to go. null = still looking.
  const [hasPendingSignup, setHasPendingSignup] = useState<boolean | null>(null);

  useEffect(() => {
    if (status !== 'unauthenticated' && status !== 'error') {
      return undefined;
    }
    let cancelled = false;
    setHasPendingSignup(null);
    restoreRegistrationVerification()
      .then((saved) => {
        if (!cancelled) {
          setHasPendingSignup(Boolean(saved));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasPendingSignup(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === 'authenticated') {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  if (status === 'loading' || hasPendingSignup === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return hasPendingSignup ? <Redirect href={VERIFY_EMAIL_HREF} /> : <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
