import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
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

import { register } from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { postAuthHrefFromUrl } from '@/lib/navigation';
import { colors, shadows, spacing } from '@/lib/theme';

export default function CreateAccountScreen() {
  const emailInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setAuthenticatedSession, setPostAuthTarget } = useAuthSession();
  const incomingUrl = Linking.useURL();

  async function handleCreateAccount() {
    if (isSubmitting) return;

    Keyboard.dismiss();
    const normalizedEmail = email.trim().toLowerCase();

    if (!fullName.trim() || !normalizedEmail || !password) {
      Alert.alert('Missing information', 'Full name, email, and password are required.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await register({
        name: fullName.trim(),
        email: normalizedEmail,
        phone: phone.trim(),
        password,
      });
      setPostAuthTarget(postAuthHrefFromUrl(incomingUrl));
      await setAuthenticatedSession(result);
    } catch (error) {
      Alert.alert(
        'Unable to create account',
        error instanceof Error ? error.message : 'The request could not be completed.',
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
            <Text style={styles.backText}>Sign in</Text>
          </Pressable>

          <View style={styles.header}>
            <View style={styles.logo}>
              <FontAwesome name="user-plus" size={36} color="#ffffff" />
            </View>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>
              Start saving with family and friends you trust.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={styles.input}
              placeholder="Your full name"
              placeholderTextColor={colors.subtle}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => emailInputRef.current?.focus()}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              ref={emailInputRef}
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.subtle}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => phoneInputRef.current?.focus()}
            />

            <Text style={styles.label}>Phone number (optional)</Text>
            <TextInput
              ref={phoneInputRef}
              style={styles.input}
              placeholder="+1 415 555 0123"
              placeholderTextColor={colors.subtle}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              ref={passwordInputRef}
              style={styles.input}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.subtle}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={() => void handleCreateAccount()}
            />

            <Pressable
              style={[styles.primaryButton, isSubmitting && styles.disabledButton]}
              onPress={() => void handleCreateAccount()}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Create Account</Text>
              )}
            </Pressable>

            <Text style={styles.note}>
              By creating an account, you agree to save responsibly with people you trust.
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
  header: { alignItems: 'center', marginBottom: 28, marginTop: 20 },
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
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    ...shadows.medium,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 12,
  },
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
