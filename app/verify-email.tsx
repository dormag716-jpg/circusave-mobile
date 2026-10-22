import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { resendRegistrationCode, verifyRegistration } from '@/lib/api';
import { useAuthSession } from '@/lib/auth/authContext';
import {
  clearRegistrationVerification,
  describeRegistrationError,
  normalizeCodeInput,
  readRegistrationVerification,
  registrationErrorMessage,
  isRegistrationExpired,
  secondsUntil,
  updateRegistrationResendAt,
  type RegistrationErrorView,
} from '@/lib/auth/registrationVerification';
import { colors, shadows, spacing } from '@/lib/shared/theme';
import { useKeyboardReveal } from '@/lib/shared/useKeyboardReveal';

const CREATE_ACCOUNT_HREF = '/create-account' as Href;
const SIGN_IN_HREF = '/login' as Href;

export default function VerifyEmailScreen() {
  const { t } = useTranslation('auth');
  const insets = useSafeAreaInsets();
  const { scrollRef, viewportRef, onScroll, keyboardInset, onFieldFocus } =
    useKeyboardReveal(insets.top);
  const { setAuthenticatedSession } = useAuthSession();

  const [pending] = useState(() => readRegistrationVerification());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [resendAtMs, setResendAtMs] = useState(pending?.resendAvailableAtMs ?? 0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const secondsLeft = secondsUntil(resendAtMs, nowMs);

  const startOver = useCallback(() => {
    clearRegistrationVerification();
    router.replace(CREATE_ACCOUNT_HREF);
  }, []);

  const backToSignIn = useCallback(() => {
    clearRegistrationVerification();
    router.replace(SIGN_IN_HREF);
  }, []);

  // Count down to the next allowed resend.
  useEffect(() => {
    if (secondsLeft <= 0) {
      return undefined;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  // Android Back returns to the sign-up form instead of leaving the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      startOver();
      return true;
    });
    return () => subscription.remove();
  }, [startOver]);

  const messageFor = (view: RegistrationErrorView) => registrationErrorMessage(view, t);

  async function submitCode() {
    if (!pending || busy) {
      return;
    }
    if (code.length < 6) {
      Alert.alert(t('verify.missingCodeTitle'), t('verify.missingCodeMessage'));
      return;
    }
    setBusy('verify');
    setErrorText(null);
    try {
      const auth = await verifyRegistration({
        signupId: pending.signupId,
        email: pending.email,
        code,
      });
      clearRegistrationVerification();
      await setAuthenticatedSession(auth);
    } catch (err: unknown) {
      const view = describeRegistrationError(err);
      setErrorText(messageFor(view));
      if (view.kind === 'expiredCode' || view.kind === 'tooManyAttempts' || view.kind === 'wrongCode') {
        setCode('');
      }
    } finally {
      setBusy(null);
    }
  }

  async function resendCode() {
    if (!pending || busy || secondsLeft > 0) {
      return;
    }
    setBusy('resend');
    setErrorText(null);
    try {
      const next = await resendRegistrationCode({
        signupId: pending.signupId,
        email: pending.email,
      });
      setCode('');
      const now = Date.now();
      setNowMs(now);
      setResendAtMs(now + next.resendAfterSeconds * 1000);
      updateRegistrationResendAt(now + next.resendAfterSeconds * 1000);
      Alert.alert(t('verify.resentTitle'), t('verify.resentMessage', { email: pending.email }));
    } catch (err: unknown) {
      const view = describeRegistrationError(err);
      if (view.kind === 'resendTooSoon' && view.retryAfterSeconds) {
        const now = Date.now();
        setNowMs(now);
        setResendAtMs(now + view.retryAfterSeconds * 1000);
      }
      setErrorText(messageFor(view));
    } finally {
      setBusy(null);
    }
  }

  if (pending && isRegistrationExpired(pending, nowMs)) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.scrollContent}>
          <View style={styles.card}>
            <Text style={styles.title}>{t('verify.expiredTitle')}</Text>
            <Text style={styles.subtitle}>{t('verify.expiredMessage')}</Text>
            <Pressable
              style={styles.primaryButton}
              onPress={startOver}
              accessibilityRole="button"
              accessibilityLabel={t('verify.expiredAction')}
            >
              <Text style={styles.primaryText}>{t('verify.expiredAction')}</Text>
            </Pressable>
            <Pressable
              style={styles.linkButton}
              onPress={backToSignIn}
              accessibilityRole="button"
              accessibilityLabel={t('verify.expiredSignIn')}
            >
              <Text style={styles.linkText}>{t('verify.expiredSignIn')}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!pending) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.scrollContent}>
          <View style={styles.card}>
            <Text style={styles.title}>{t('verify.interruptedTitle')}</Text>
            <Text style={styles.subtitle}>{t('verify.interruptedMessage')}</Text>
            <Pressable
              style={styles.primaryButton}
              onPress={startOver}
              accessibilityRole="button"
              accessibilityLabel={t('verify.interruptedAction')}
            >
              <Text style={styles.primaryText}>{t('verify.interruptedAction')}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const resendLabel =
    secondsLeft > 0 ? t('verify.resendIn', { seconds: secondsLeft }) : t('verify.resend');

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View ref={viewportRef} collapsable={false} style={styles.keyboardView}>
          <ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={[
              styles.scrollContent,
              keyboardInset > 0 && { paddingBottom: 48 + keyboardInset },
            ]}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.branding}>
              <View style={styles.logo}>
                <FontAwesome name="envelope" size={36} color={colors.onColor} />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>{t('verify.title')}</Text>
              <Text style={styles.subtitle}>{t('verify.subtitle', { email: pending.email })}</Text>

              <Text style={styles.label}>{t('verify.codeLabel')}</Text>
              <TextInput
                onFocus={onFieldFocus}
                style={[styles.codeInput, code.length === 0 && styles.codeInputEmpty]}
                placeholder={t('verify.codePlaceholder')}
                placeholderTextColor={colors.subtle}
                accessibilityLabel={t('verify.codeLabel')}
                value={code}
                onChangeText={(text) => setCode(normalizeCodeInput(text))}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={() => void submitCode()}
                editable={busy === null}
              />

              {errorText ? (
                <Text style={styles.errorText} accessibilityRole="alert">
                  {errorText}
                </Text>
              ) : (
                <Text style={styles.hint}>{t('verify.spamHint')}</Text>
              )}

              <Pressable
                style={[styles.primaryButton, busy !== null && styles.disabledButton]}
                onPress={() => void submitCode()}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityState={{ busy: busy === 'verify', disabled: busy !== null }}
                accessibilityLabel={t('verify.verifyAction')}
              >
                {busy === 'verify' ? (
                  <ActivityIndicator color={colors.onColor} />
                ) : (
                  <Text style={styles.primaryText}>{t('verify.verifyAction')}</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => void resendCode()}
                disabled={secondsLeft > 0 || busy !== null}
                style={styles.linkButton}
                accessibilityRole="button"
                accessibilityState={{ disabled: secondsLeft > 0 || busy !== null }}
                accessibilityLabel={resendLabel}
              >
                {busy === 'resend' ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={[styles.linkText, secondsLeft > 0 && styles.linkTextDisabled]}>
                    {resendLabel}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={startOver}
                style={styles.linkButton}
                accessibilityRole="button"
                accessibilityLabel={t('verify.useDifferentEmail')}
              >
                <Text style={styles.linkText}>{t('verify.useDifferentEmail')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  keyboardView: { flex: 1 },
  scrollContent: {
    alignSelf: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    maxWidth: 520,
    padding: spacing.screenX,
    paddingBottom: 48,
    width: '100%',
  },
  branding: { alignItems: 'center', marginBottom: 24 },
  logo: {
    width: 76,
    height: 76,
    backgroundColor: colors.primary,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    ...shadows.medium,
  },
  title: { fontSize: 25, fontWeight: '900', color: colors.textStrong },
  subtitle: { fontSize: 15, color: colors.muted, marginBottom: 8, marginTop: 6 },
  label: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 8, marginTop: 12 },
  codeInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    color: colors.textStrong,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 6,
    minHeight: 60,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  // A placeholder cannot be styled on its own, so it would inherit the wide digit spacing and be clipped
  // in longer languages. While the field is empty use a plain style; typed digits keep the spaced look.
  codeInputEmpty: { fontSize: 17, fontWeight: '600', letterSpacing: 0 },
  hint: { color: colors.muted, fontSize: 13, marginBottom: 20, marginTop: 10 },
  errorText: { color: colors.danger, fontSize: 14, fontWeight: '700', marginBottom: 20, marginTop: 10 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 58,
  },
  disabledButton: { opacity: 0.65 },
  primaryText: { color: colors.onColor, fontSize: 17, fontWeight: '900' },
  linkButton: { alignItems: 'center', justifyContent: 'center', marginTop: 12, minHeight: 44 },
  linkText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  linkTextDisabled: { color: colors.subtle },
});
