import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Linking from 'expo-linking';
import { router, type Href } from 'expo-router';
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

import { LegalCheckbox } from '@/components/LegalCheckbox';
import { register } from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { LEGAL_VERSIONS } from '@/lib/legal';
import { postAuthHrefFromUrl } from '@/lib/navigation';
import { colors, shadows, spacing } from '@/lib/theme';

const LEGAL_TERMS_HREF = '/legal/terms' as Href;
const LEGAL_PRIVACY_HREF = '/legal/privacy' as Href;
const LEGAL_FUNDS_HREF = '/legal/how-money-moves' as Href;
const LEGAL_ECONSENT_HREF = '/legal/electronic-consent' as Href;

export default function CreateAccountScreen() {
  const { t } = useTranslation('auth');
  const lastNameInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTermsAndPrivacy, setAcceptedTermsAndPrivacy] = useState(false);
  const [acceptedFundsDisclosure, setAcceptedFundsDisclosure] = useState(false);
  const [acceptedElectronicConsent, setAcceptedElectronicConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setAuthenticatedSession, setPostAuthTarget, postAuthTarget } =
    useAuthSession();
  const incomingUrl = Linking.useURL();

  const hasAcceptedRequiredPolicies =
    acceptedTermsAndPrivacy &&
    acceptedFundsDisclosure &&
    acceptedElectronicConsent;

  const createDisabled = isSubmitting || !hasAcceptedRequiredPolicies;

  async function handleCreateAccount() {
    if (isSubmitting) return;

    Keyboard.dismiss();
    const normalizedEmail = email.trim().toLowerCase();

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !normalizedEmail ||
      !password ||
      !confirmPassword
    ) {
      Alert.alert(
        t('create.missingInfoTitle'),
        t('create.missingInfoMessage'),
      );
      return;
    }

    if (password.length < 8) {
      Alert.alert(t('create.weakPasswordTitle'), t('create.weakPasswordMessage'));
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(t('create.passwordMismatchTitle'), t('create.passwordMismatchMessage'));
      return;
    }

    if (!hasAcceptedRequiredPolicies) {
      Alert.alert(
        t('create.agreementsTitle'),
        t('create.agreementsMessage'),
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await register({
        name: `${firstName.trim()} ${lastName.trim()}`,
        email: normalizedEmail,
        phone: phone.trim(),
        password,
        legalAcceptance: {
          acceptedLegal: true,
          termsVersion: LEGAL_VERSIONS.terms,
          privacyVersion: LEGAL_VERSIONS.privacy,
          fundsDisclosureVersion: LEGAL_VERSIONS.fundsDisclosure,
          electronicConsentVersion: LEGAL_VERSIONS.electronicConsent,
        },
      });
      // Keep an explicit target (e.g. invite return) over the raw deep link.
      if (!postAuthTarget) {
        setPostAuthTarget(postAuthHrefFromUrl(incomingUrl));
      }
      await setAuthenticatedSession(result);
    } catch {
      Alert.alert(
        t('create.createErrorTitle'),
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
          <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={12}>
            <FontAwesome name="chevron-left" size={18} color={colors.primary} />
            <Text style={styles.backText}>{t('create.backToSignIn')}</Text>
          </Pressable>

          <View style={styles.header}>
            <View style={styles.logo}>
              <FontAwesome name="user-plus" size={36} color="#ffffff" />
            </View>
            <Text style={styles.title}>{t('create.title')}</Text>
            <Text style={styles.subtitle}>
              {t('create.subtitle')}
            </Text>
          </View>

          <View style={styles.guideCard}>
            <View style={styles.guideIcon}>
              <FontAwesome name="magic" size={20} color={colors.primary} />
            </View>
            <View style={styles.guideContent}>
              <Text style={styles.guideEyebrow}>{t('create.guideEyebrow')}</Text>
              <Text style={styles.guideTitle}>{t('create.guideTitle')}</Text>
              <Text style={styles.guideText}>
                {t('create.guideText')}
              </Text>
              <View style={styles.guideSteps}>
                <View style={styles.guideStep}>
                  <View style={styles.guideStepNumber}>
                    <Text style={styles.guideStepNumberText}>1</Text>
                  </View>
                  <Text style={styles.guideStepText}>{t('create.profile')}</Text>
                </View>
                <View style={styles.guideDivider} />
                <View style={styles.guideStep}>
                  <View style={styles.guideStepNumber}>
                    <Text style={styles.guideStepNumberText}>2</Text>
                  </View>
                  <Text style={styles.guideStepText}>{t('create.security')}</Text>
                </View>
                <View style={styles.guideDivider} />
                <View style={styles.guideStep}>
                  <View style={styles.guideStepNumber}>
                    <Text style={styles.guideStepNumberText}>3</Text>
                  </View>
                  <Text style={styles.guideStepText}>{t('create.review')}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <FontAwesome name="user" size={16} color={colors.primary} />
              </View>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionEyebrow}>{t('create.step', { number: 1 })}</Text>
                <Text style={styles.sectionTitle}>{t('create.aboutTitle')}</Text>
              </View>
            </View>
            <Text style={styles.sectionDescription}>
              {t('create.aboutDescription')}
            </Text>

            <Text style={styles.label}>{t('create.firstName')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('create.firstNamePlaceholder')}
              accessibilityLabel={t('create.firstName')}
              placeholderTextColor={colors.subtle}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoComplete="given-name"
              returnKeyType="next"
              onSubmitEditing={() => lastNameInputRef.current?.focus()}
            />

            <Text style={styles.label}>{t('create.lastName')}</Text>
            <TextInput
              ref={lastNameInputRef}
              style={styles.input}
              placeholder={t('create.lastNamePlaceholder')}
              accessibilityLabel={t('create.lastName')}
              placeholderTextColor={colors.subtle}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoComplete="family-name"
              returnKeyType="next"
              onSubmitEditing={() => emailInputRef.current?.focus()}
            />

            <Text style={styles.label}>{t('common.email')}</Text>
            <TextInput
              ref={emailInputRef}
              style={styles.input}
              placeholder={t('login.emailPlaceholder')}
              accessibilityLabel={t('common.email')}
              placeholderTextColor={colors.subtle}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => phoneInputRef.current?.focus()}
            />

            <Text style={styles.label}>
              {t('common.phoneNumber')}{' '}
              <Text style={styles.optionalLabel}>{t('common.optional')}</Text>
            </Text>
            <TextInput
              ref={phoneInputRef}
              style={styles.input}
              placeholder={t('create.phonePlaceholder')}
              accessibilityLabel={t('common.phoneNumber')}
              placeholderTextColor={colors.subtle}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
            />
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <FontAwesome name="lock" size={16} color={colors.primary} />
              </View>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionEyebrow}>{t('create.step', { number: 2 })}</Text>
                <Text style={styles.sectionTitle}>{t('create.securityTitle')}</Text>
              </View>
            </View>
            <Text style={styles.sectionDescription}>
              {t('create.securityDescription')}
            </Text>

            <Text style={styles.label}>{t('common.password')}</Text>
            <TextInput
              ref={passwordInputRef}
              style={styles.input}
              placeholder={t('create.passwordPlaceholder')}
              accessibilityLabel={t('common.password')}
              placeholderTextColor={colors.subtle}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="next"
              onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
            />

            <Text style={styles.label}>{t('create.confirmPassword')}</Text>
            <TextInput
              ref={confirmPasswordInputRef}
              style={styles.input}
              placeholder={t('create.confirmPasswordPlaceholder')}
              accessibilityLabel={t('create.confirmPassword')}
              placeholderTextColor={colors.subtle}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={() => void handleCreateAccount()}
            />
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <FontAwesome name="check-circle" size={17} color={colors.primary} />
              </View>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionEyebrow}>{t('create.step', { number: 3 })}</Text>
                <Text style={styles.sectionTitle}>{t('create.reviewTitle')}</Text>
              </View>
            </View>
            <Text style={styles.sectionDescription}>
              {t('create.reviewDescription')}
            </Text>

            <View style={styles.legalBlock}>
              <LegalCheckbox
                checked={acceptedTermsAndPrivacy}
                onCheckedChange={setAcceptedTermsAndPrivacy}
                accessibilityLabel={t('create.termsAccessibility')}
                segments={[
                  { type: 'text', text: t('create.termsPrefix') },
                  { type: 'link', text: t('create.terms'), href: LEGAL_TERMS_HREF },
                  { type: 'text', text: t('create.privacyConnector') },
                  { type: 'link', text: t('create.privacy'), href: LEGAL_PRIVACY_HREF },
                  { type: 'text', text: '.' },
                ]}
              />

              <LegalCheckbox
                checked={acceptedFundsDisclosure}
                onCheckedChange={setAcceptedFundsDisclosure}
                accessibilityLabel={t('create.fundsAccessibility')}
                segments={[
                  {
                    type: 'text',
                    text: t('create.fundsDisclosure'),
                  },
                  {
                    type: 'link',
                    text: t('create.moneyMoves'),
                    href: LEGAL_FUNDS_HREF,
                  },
                  { type: 'text', text: '.' },
                ]}
              />

              <LegalCheckbox
                checked={acceptedElectronicConsent}
                onCheckedChange={setAcceptedElectronicConsent}
                accessibilityLabel={t('create.electronicAccessibility')}
                segments={[
                  {
                    type: 'text',
                    text: t('create.electronicConsentPrefix'),
                  },
                  {
                    type: 'link',
                    text: t('create.electronicConsent'),
                    href: LEGAL_ECONSENT_HREF,
                  },
                  { type: 'text', text: '.' },
                ]}
              />
            </View>

            <Pressable
              style={[styles.primaryButton, createDisabled && styles.disabledButton]}
              onPress={() => void handleCreateAccount()}
              disabled={createDisabled}
              accessibilityRole="button"
              accessibilityState={{
                busy: isSubmitting,
                disabled: createDisabled,
              }}
              accessibilityLabel={t('create.createAccount')}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>{t('create.createAccount')}</Text>
              )}
            </Pressable>

            <Text style={styles.note}>
              {t('create.legalNote')}
            </Text>
          </View>
        </ScrollView>
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
    maxWidth: 520,
    padding: spacing.screenX,
    paddingBottom: 48,
    width: '100%',
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
  },
  backText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  header: { alignItems: 'center', marginBottom: 22, marginTop: 20 },
  logo: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 72,
    justifyContent: 'center',
    marginBottom: 16,
    width: 72,
    ...shadows.medium,
  },
  title: {
    color: colors.textStrong,
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
    textAlign: 'center',
  },
  guideCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
    padding: 18,
  },
  guideIcon: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
    ...shadows.small,
  },
  guideContent: { flex: 1 },
  guideEyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  guideTitle: {
    color: colors.textStrong,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 3,
  },
  guideText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  guideSteps: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 14,
  },
  guideStep: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  guideStepNumber: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  guideStepNumberText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
  guideStepText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  guideDivider: {
    backgroundColor: colors.primaryBorder,
    flex: 1,
    height: 1,
    marginHorizontal: 7,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 16,
    padding: 20,
    ...shadows.small,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  sectionIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 13,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  sectionHeading: { flex: 1 },
  sectionEyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: colors.textStrong,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 2,
  },
  sectionDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
    marginTop: 12,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 12,
  },
  optionalLabel: { color: colors.muted, fontWeight: '600' },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.textStrong,
    fontSize: 16,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  legalBlock: {
    marginTop: 8,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    justifyContent: 'center',
    marginTop: 28,
    minHeight: 58,
  },
  disabledButton: { opacity: 0.65 },
  primaryButtonText: { color: '#ffffff', fontSize: 17, fontWeight: '900' },
  note: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16,
    textAlign: 'center',
  },
});
