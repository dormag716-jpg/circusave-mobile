import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Linking from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
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

import { FederatedAuthButtons } from '@/components/FederatedAuthButtons';
import { loginHardwareBackAction } from '@/lib/auth/authBoundary';
import {
  acknowledgePasswordResetCodeEntry,
  openExistingRecoveryCode,
  passwordResetPhase,
  passwordResetRequestsReplacementCode,
  readFreshPasswordResetCodeEntry,
} from '@/lib/auth/passwordResetEntry';
import {
  login,
  signInWithFederatedProvider,
  requestPasswordReset,
  resetPassword,
  verifyPasswordReset,
  type AuthResponse,
} from '@/lib/api';
import { useAuthSession } from '@/lib/auth/authContext';
import {
  clearFederatedCredential,
  holdFederatedCredential,
  type FederatedIdentityProof,
} from '@/lib/auth/federatedSignIn';
import { googleSignInMessageKey } from '@/lib/auth/googleSignInOutcome';
import { backendAuthMessage, describeNetworkError } from '@/lib/platform/networkErrors';
import { postAuthHrefFromUrl } from '@/lib/platform/navigation';
import { colors, shadows, spacing } from '@/lib/shared/theme';
import { FORM_MAX_WIDTH } from '@/lib/shared/responsive';
import { useKeyboardReveal } from '@/lib/shared/useKeyboardReveal';
import { useLayoutMetrics } from '@/lib/shared/useLayoutMetrics';

export default function LoginScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const passwordInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const layout = useLayoutMetrics();
  const compact = layout.compact;
  const { scrollRef, viewportRef, onScroll, keyboardInset, onFieldFocus } =
    useKeyboardReveal(insets.top);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [resetVerified, setResetVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkChallenge, setLinkChallenge] = useState<
    (FederatedIdentityProof & { email: string }) | null
  >(null);
  const { setAuthenticatedSession, setPostAuthTarget, postAuthTarget } =
    useAuthSession();
  const incomingUrl = Linking.useURL();

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') {
        return undefined;
      }
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (loginHardwareBackAction() !== 'exit_app') {
          return false;
        }
        BackHandler.exitApp();
        return true;
      });
      return () => {
        subscription.remove();
      };
    }, []),
  );

  const normalizedEmail = email.trim().toLowerCase();

  function setRecovery(active: boolean) {
    setRecoveryMode(active);
    setOtpRequested(false);
    setResetVerified(false);
    setResetToken('');
    setOtpCode('');
    setPassword('');
    setLinkChallenge(null);
  }

  useFocusEffect(
    useCallback(() => {
      const staged = readFreshPasswordResetCodeEntry();
      if (!staged) {
        return undefined;
      }
      setEmail(staged.email);
      setRecoveryMode(true);
      setOtpRequested(true);
      setResetVerified(false);
      setResetToken('');
      setOtpCode('');
      setPassword('');
      setLinkChallenge(null);
      const timer = setTimeout(() => acknowledgePasswordResetCodeEntry(), 0);
      return () => clearTimeout(timer);
    }, []),
  );

  function openExistingCode() {
    const existing = openExistingRecoveryCode({ email: normalizedEmail });
    if ('error' in existing) {
      Alert.alert(t('login.missingEmailTitle'), t('login.missingEmailMessage'));
      return;
    }
    setOtpRequested(true);
  }

  async function finishAuthenticated(result: AuthResponse) {
    clearFederatedCredential();
    setLinkChallenge(null);
    if (!postAuthTarget) {
      setPostAuthTarget(postAuthHrefFromUrl(incomingUrl));
    }
    await setAuthenticatedSession(result);
  }

  async function onFederatedIdentity(proof: FederatedIdentityProof) {
    const result = await signInWithFederatedProvider({
      proof,
      name: proof.name,
    });
    if (result.status === 'authenticated') {
      await finishAuthenticated(result.auth);
      return;
    }
    if (result.status === 'link_required') {
      setLinkChallenge({ ...proof, email: result.email });
      setPassword('');
      return;
    }
    holdFederatedCredential({
      ...proof,
      email: result.email,
      name: result.name || proof.name || '',
    });
    router.push('/create-account');
  }

  async function handleSubmit() {
    if (isSubmitting) return;

    Keyboard.dismiss();

    if (!linkChallenge && !normalizedEmail) {
      Alert.alert(t('login.missingEmailTitle'), t('login.missingEmailMessage'));
      return;
    }

    if (!recoveryMode && !password) {
      Alert.alert(t('login.missingPasswordTitle'), t('login.missingPasswordMessage'));
      return;
    }

    if (recoveryMode && otpRequested && !resetVerified && otpCode.length < 6) {
      Alert.alert(t('login.missingCodeTitle'), t('login.missingCodeMessage'));
      return;
    }

    if (recoveryMode && resetVerified && password.length < 8) {
      Alert.alert(t('login.weakPasswordTitle'), t('login.weakPasswordMessage'));
      return;
    }

    setIsSubmitting(true);

    try {
      if (linkChallenge) {
        const linked = await signInWithFederatedProvider({
          proof: linkChallenge,
          password,
        });
        if (linked.status !== 'authenticated') {
          Alert.alert(t('federated.rejectedTitle'), t('federated.rejectedBody'));
          return;
        }
        await finishAuthenticated(linked.auth);
        return;
      }

      if (!recoveryMode) {
        const result = await login({ email: normalizedEmail, password });
        // Keep an explicit target (e.g. invite return) over the raw deep link.
        if (!postAuthTarget) {
          setPostAuthTarget(postAuthHrefFromUrl(incomingUrl));
        }
        await setAuthenticatedSession(result);
        return;
      }

      const phase = passwordResetPhase({
        codeEntryReady: otpRequested,
        codeVerified: resetVerified,
      });

      if (passwordResetRequestsReplacementCode(phase)) {
        const result = await requestPasswordReset({ email: normalizedEmail });
        if (!result.accepted) {
          throw new Error('Unable to initialize password recovery.');
        }

        setOtpRequested(true);
        Alert.alert(
          t('login.recoveryRequestedTitle'),
          t('login.recoveryRequestedMessage'),
        );
        return;
      }

      if (phase === 'code') {
        const result = await verifyPasswordReset({
          email: normalizedEmail,
          code: otpCode,
        });
        setResetToken(result.resetToken);
        setResetVerified(true);
        setPassword('');
        Alert.alert(t('login.codeVerifiedTitle'), t('login.codeVerifiedMessage'));
        return;
      }

      if (!resetToken) {
        throw new Error('Password reset verification has expired. Request a new code.');
      }

      await resetPassword({ resetToken, newPassword: password });
      setRecovery(false);
      Alert.alert(t('login.passwordResetTitle'), t('login.passwordResetMessage'));
    } catch (error) {
      const copy = describeNetworkError(error);
      Alert.alert(
        t(copy.titleKey),
        backendAuthMessage(error) ?? t(copy.bodyKey, copy.params),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {/*
        Android resizes the window for the keyboard (softwareKeyboardLayoutMode
        "resize"), so a second 'height' avoidance here double-shrank the view and
        left the focused field flush against the keyboard. iOS still needs
        'padding'. Scrolling the focused field into view is handled by
        useKeyboardReveal on both.
      */}
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
            { maxWidth: layout.wide ? FORM_MAX_WIDTH : 520, padding: layout.gutter },
            compact && styles.scrollContentCompact,
            // Only while the keyboard covers the form; zero otherwise.
            keyboardInset > 0 && { paddingBottom: (compact ? 24 : 48) + keyboardInset },
          ]}
          // Android 'on-drag' closed the keyboard on any scroll, so the form
          // could not be scrolled to Sign In while typing.
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.branding, compact && styles.brandingCompact]}>
            {layout.height < 600 ? null : (
              <View style={[styles.logo, compact && styles.logoCompact]}>
                <FontAwesome name="users" size={compact ? 22 : 42} color={colors.onColor} />
              </View>
            )}
            <Text style={[styles.appName, compact && styles.appNameCompact]}>CircuSave</Text>
            <Text style={[styles.tagline, compact && styles.taglineCompact]}>
              {t('login.tagline')}
            </Text>
          </View>

          <View style={[styles.card, compact && styles.cardCompact]}>
            <Text style={[styles.welcome, compact && styles.welcomeCompact]}>
              {recoveryMode ? t('login.recoverAccess') : t('login.welcomeBack')}
            </Text>
            {compact && !recoveryMode && !linkChallenge ? null : (
              <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>
                {linkChallenge
                  ? t('federated.linkBody')
                  : recoveryMode
                    ? t('login.recoverySubtitle')
                    : t('login.signInSubtitle')}
              </Text>
            )}

            {!recoveryMode && !linkChallenge ? (
              <FederatedAuthButtons
                disabled={isSubmitting}
                onIdentity={onFederatedIdentity}
                onGoogleStatus={(status) => {
                  const message = googleSignInMessageKey(status);
                  if (!message) {
                    return;
                  }
                  Alert.alert(t(message.title), t(message.body));
                }}
              />
            ) : null}

            {linkChallenge ? (
              <Text style={[styles.label, compact && styles.labelCompact]}>{linkChallenge.email}</Text>
            ) : (
              <>
                <Text style={[styles.label, compact && styles.labelCompact]}>{t('common.email')}</Text>
                <TextInput
                  onFocus={onFieldFocus}
                  style={[styles.input, compact && styles.inputCompact]}
                  placeholder={t('login.emailPlaceholder')}
                  accessibilityLabel={t('common.email')}
                  placeholderTextColor={colors.subtle}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  returnKeyType={recoveryMode ? 'done' : 'next'}
                  onSubmitEditing={() =>
                    recoveryMode ? void handleSubmit() : passwordInputRef.current?.focus()
                  }
                />
              </>
            )}

            {!recoveryMode && (
              <>
                <Text style={[styles.label, compact && styles.labelCompact]}>{t('common.password')}</Text>
                <TextInput
                  onFocus={onFieldFocus}
                  ref={passwordInputRef}
                  style={[styles.input, compact && styles.inputCompact]}
                  placeholder={t('login.passwordPlaceholder')}
                  accessibilityLabel={t('common.password')}
                  placeholderTextColor={colors.subtle}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="current-password"
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSubmit()}
                />
              </>
            )}

            {recoveryMode && otpRequested && !resetVerified && (
              <>
                <Text style={[styles.label, compact && styles.labelCompact]}>{t('login.recoveryCode')}</Text>
                <TextInput
                  onFocus={onFieldFocus}
                  style={[styles.input, compact && styles.inputCompact]}
                  placeholder={t('login.recoveryCodePlaceholder')}
                  accessibilityLabel={t('login.recoveryCode')}
                  placeholderTextColor={colors.subtle}
                  value={otpCode}
                  onChangeText={(text) => setOtpCode(text.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSubmit()}
                />
              </>
            )}

            {recoveryMode && resetVerified && (
              <>
                <Text style={[styles.label, compact && styles.labelCompact]}>{t('login.newPassword')}</Text>
                <TextInput
                  onFocus={onFieldFocus}
                  ref={passwordInputRef}
                  style={[styles.input, compact && styles.inputCompact]}
                  placeholder={t('login.newPasswordPlaceholder')}
                  accessibilityLabel={t('login.newPassword')}
                  placeholderTextColor={colors.subtle}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSubmit()}
                />
              </>
            )}

            <Pressable
              style={[styles.forgotPassword, compact && styles.forgotPasswordCompact]}
              accessibilityRole="button"
              onPress={() => setRecovery(!recoveryMode)}>
              <Text style={styles.forgotText}>
                {recoveryMode ? t('login.backToSignIn') : t('login.forgotPassword')}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.signInButton,
                compact && styles.signInButtonCompact,
                isSubmitting && styles.disabledButton,
              ]}
              onPress={() => void handleSubmit()}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
              accessibilityLabel={
                linkChallenge
                  ? t('federated.linkAction')
                  : !recoveryMode
                  ? t('login.signIn')
                  : !otpRequested
                    ? t('login.sendRecoveryCode')
                    : resetVerified
                      ? t('login.resetPassword')
                      : t('login.verifyRecoveryCode')
              }
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.onColor} />
              ) : (
                <Text style={styles.signInText}>
                  {linkChallenge
                    ? t('federated.linkAction')
                    : !recoveryMode
                    ? t('login.signIn')
                    : !otpRequested
                      ? t('login.sendRecoveryCode')
                      : resetVerified
                        ? t('login.resetPassword')
                        : t('login.verifyRecoveryCode')}
                </Text>
              )}
            </Pressable>

            {recoveryMode && !otpRequested && !linkChallenge ? (
              <Pressable
                onPress={openExistingCode}
                style={styles.existingCode}
                accessibilityRole="button"
                accessibilityLabel={t('login.enterExistingCode')}
              >
                <Text style={styles.forgotText}>{t('login.enterExistingCode')}</Text>
              </Pressable>
            ) : null}

            {!recoveryMode && (
              <Pressable
                onPress={() => router.push('/create-account')}
                style={[styles.createAccount, compact && styles.createAccountCompact]}
                accessibilityRole="button"
              >
                <Text style={styles.createAccountText}>
                  {t('login.noAccount')}{' '}
                  <Text style={styles.link}>{t('login.createOne')}</Text>
                </Text>
              </Pressable>
            )}
          </View>

          <View style={[styles.trustRow, compact && styles.trustRowCompact]}>
            <TrustBadge icon="lock" label={t('login.secureLedger')} />
            <TrustBadge icon="users" label={t('login.inviteOnly')} />
          </View>
        </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TrustBadge({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
}) {
  return (
    <View style={styles.trustBadge}>
      <FontAwesome name={icon} size={15} color={colors.success} />
      <Text style={styles.trustText}>{label}</Text>
    </View>
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
  branding: { alignItems: 'center', marginBottom: 32 },
  logo: {
    width: 80,
    height: 80,
    backgroundColor: colors.primary,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...shadows.medium,
  },
  appName: { fontSize: 36, fontWeight: '900', color: colors.textStrong },
  tagline: { fontSize: 16, color: colors.muted, marginTop: 4 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    ...shadows.medium,
  },
  welcome: { fontSize: 25, fontWeight: '900', color: colors.textStrong },
  subtitle: { fontSize: 15, color: colors.muted, marginBottom: 20, marginTop: 5 },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    color: colors.textStrong,
    fontSize: 16,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  forgotPassword: { alignSelf: 'flex-end', marginVertical: 16, paddingLeft: 12 },
  forgotText: { color: colors.primary, fontWeight: '700' },
  existingCode: { alignItems: 'center', marginTop: 16, minHeight: 44, justifyContent: 'center' },
  signInButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 58,
  },
  disabledButton: { opacity: 0.65 },
  // Compact (short or narrow) windows: trim decoration so email, password and
  // Sign in fit together at 360 x 640 dp. Tap targets stay at 44 dp or more.
  scrollContentCompact: { paddingBottom: 16, paddingTop: 8 },
  brandingCompact: { marginBottom: 10 },
  logoCompact: { width: 40, height: 40, marginBottom: 6 },
  appNameCompact: { fontSize: 26 },
  taglineCompact: { fontSize: 13, marginTop: 0, textAlign: 'center' },
  cardCompact: { borderRadius: 20, padding: 14 },
  welcomeCompact: { fontSize: 20, marginBottom: 10 },
  subtitleCompact: { fontSize: 14, marginBottom: 10, marginTop: 3 },
  labelCompact: { fontSize: 13, marginBottom: 4, marginTop: 6 },
  inputCompact: { borderRadius: 14, fontSize: 15, minHeight: 44 },
  forgotPasswordCompact: { justifyContent: 'center', marginVertical: 0, minHeight: 44 },
  signInButtonCompact: { minHeight: 48 },
  createAccountCompact: { justifyContent: 'center', marginTop: 0, minHeight: 44 },
  trustRowCompact: { gap: 8, marginTop: 16 },
  signInText: { color: colors.onColor, fontSize: 17, fontWeight: '900' },
  createAccount: { marginTop: 24, alignItems: 'center' },
  createAccountText: { fontSize: 15, color: colors.muted },
  link: { color: colors.primary, fontWeight: '800' },
  trustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 28,
  },
  trustBadge: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  trustText: { fontSize: 13, fontWeight: '700', color: colors.text },
});
