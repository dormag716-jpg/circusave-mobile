import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
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
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  login,
  requestPasswordReset,
  resetPassword,
  verifyPasswordReset,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { postAuthHrefFromUrl } from '@/lib/navigation';
import { colors, shadows, spacing } from '@/lib/theme';

export default function LoginScreen() {
  const { t } = useTranslation('auth');
  const passwordInputRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [resetVerified, setResetVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setAuthenticatedSession, setPostAuthTarget, postAuthTarget } =
    useAuthSession();
  const incomingUrl = Linking.useURL();

  const normalizedEmail = email.trim().toLowerCase();

  function setRecovery(active: boolean) {
    setRecoveryMode(active);
    setOtpRequested(false);
    setResetVerified(false);
    setResetToken('');
    setOtpCode('');
    setPassword('');
  }

  async function handleSubmit() {
    if (isSubmitting) return;

    Keyboard.dismiss();

    if (!normalizedEmail) {
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
      if (!recoveryMode) {
        const result = await login({ email: normalizedEmail, password });
        // Keep an explicit target (e.g. invite return) over the raw deep link.
        if (!postAuthTarget) {
          setPostAuthTarget(postAuthHrefFromUrl(incomingUrl));
        }
        await setAuthenticatedSession(result);
        return;
      }

      if (!otpRequested) {
        const result = await requestPasswordReset({ email: normalizedEmail });
        if (!result.sent) throw new Error('Unable to send a password reset code.');

        setOtpRequested(true);
        Alert.alert(
          t('login.codeSentTitle'),
          t('login.codeSentMessage'),
        );
        return;
      }

      if (!resetVerified) {
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
    } catch {
      Alert.alert(
        t('common.genericErrorTitle'),
        t('common.genericErrorMessage'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.branding}>
            <View style={styles.logo}>
              <FontAwesome name="users" size={42} color="#ffffff" />
            </View>
            <Text style={styles.appName}>CircuSave</Text>
            <Text style={styles.tagline}>{t('login.tagline')}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.welcome}>
              {recoveryMode ? t('login.recoverAccess') : t('login.welcomeBack')}
            </Text>
            <Text style={styles.subtitle}>
              {recoveryMode
                ? t('login.recoverySubtitle')
                : t('login.signInSubtitle')}
            </Text>

            <Text style={styles.label}>{t('common.email')}</Text>
            <TextInput
              style={styles.input}
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

            {!recoveryMode && (
              <>
                <Text style={styles.label}>{t('common.password')}</Text>
                <TextInput
                  ref={passwordInputRef}
                  style={styles.input}
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
                <Text style={styles.label}>{t('login.recoveryCode')}</Text>
                <TextInput
                  style={styles.input}
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
                <Text style={styles.label}>{t('login.newPassword')}</Text>
                <TextInput
                  ref={passwordInputRef}
                  style={styles.input}
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

            <Pressable style={styles.forgotPassword} onPress={() => setRecovery(!recoveryMode)}>
              <Text style={styles.forgotText}>
                {recoveryMode ? t('login.backToSignIn') : t('login.forgotPassword')}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.signInButton, isSubmitting && styles.disabledButton]}
              onPress={() => void handleSubmit()}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
              accessibilityLabel={
                !recoveryMode
                  ? t('login.signIn')
                  : !otpRequested
                    ? t('login.sendRecoveryCode')
                    : resetVerified
                      ? t('login.resetPassword')
                      : t('login.verifyRecoveryCode')
              }
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.signInText}>
                  {!recoveryMode
                    ? t('login.signIn')
                    : !otpRequested
                      ? t('login.sendRecoveryCode')
                      : resetVerified
                        ? t('login.resetPassword')
                        : t('login.verifyRecoveryCode')}
                </Text>
              )}
            </Pressable>

            {!recoveryMode && (
              <Pressable
                onPress={() => router.push('/create-account')}
                style={styles.createAccount}
              >
                <Text style={styles.createAccountText}>
                  {t('login.noAccount')}{' '}
                  <Text style={styles.link}>{t('login.createOne')}</Text>
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.trustRow}>
            <TrustBadge icon="lock" label={t('login.secureLedger')} />
            <TrustBadge icon="users" label={t('login.inviteOnly')} />
          </View>
        </ScrollView>
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
  forgotPassword: { alignSelf: 'flex-end', marginVertical: 16 },
  forgotText: { color: colors.primary, fontWeight: '700' },
  signInButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 58,
  },
  disabledButton: { opacity: 0.65 },
  signInText: { color: '#ffffff', fontSize: 17, fontWeight: '900' },
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
