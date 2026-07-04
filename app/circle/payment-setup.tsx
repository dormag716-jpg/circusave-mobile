// app/circle/payment-setup.tsx
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { getCircleDetail, updateCircleSettings } from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { circleWorkspaceHref } from '@/lib/navigation';
import { colors, radii, spacing } from '@/lib/theme';

const EXAMPLES = [
  { label: 'Zelle', placeholder: 'Zelle: organizer@email.com' },
  { label: 'CashApp', placeholder: 'CashApp: $yourtag' },
  { label: 'Venmo', placeholder: 'Venmo: @yourusername' },
  { label: 'Bank', placeholder: 'Wire to Acct# 1234 / Routing# 5678' },
];

export default function PaymentSetupScreen() {
  const { session } = useAuthSession();
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = Array.isArray(params.circleId) ? params.circleId[0] : params.circleId;
  const token = session?.session.token;

  const [circleName, setCircleName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      if (!token || !circleId) {
        setLoading(false);
        return;
      }
      try {
        // Try backend first
        const circle = await getCircleDetail(token, circleId);
        setCircleName(circle.name);
        if (circle.paymentInstructions) {
          setInstructions(circle.paymentInstructions);
        }
      } catch {
        // Fallback or error handled upstream
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [circleId, token]);

  async function handleSave() {
    if (!circleId) return;
    const trimmed = instructions.trim();
    if (!trimmed) {
      Alert.alert('Instructions required', 'Please enter how members should pay you.');
      return;
    }

    setSaving(true);
    let backendSaved = false;

    // Try saving to backend
    if (token) {
      try {
        await updateCircleSettings(token, circleId, { paymentInstructions: trimmed });
      } catch (err) {
        Alert.alert('Error', 'Failed to save payment instructions to the circle.');
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    Alert.alert(
      'Saved!',
      'Payment instructions saved to your circle.',
      [{ text: 'Done', onPress: () => router.replace(circleWorkspaceHref(circleId)) }],
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              style={styles.backButton}
              onPress={() => circleId && router.replace(circleWorkspaceHref(circleId))}
              hitSlop={20}
            >
              <FontAwesome name="angle-left" size={28} color={colors.primaryDark} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>Payment Setup</Text>
              <Text style={styles.title}>{circleName || 'Circle'}</Text>
            </View>
          </View>

          {/* Explainer */}
          <View style={styles.explainerCard}>
            <View style={styles.explainerIcon}>
              <FontAwesome name="info-circle" size={20} color={colors.primary} />
            </View>
            <Text style={styles.explainerText}>
              Tell your members exactly where to send money. This will appear on their "My Next Action" card so they can pay you without asking.
            </Text>
          </View>

          {/* Input */}
          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>How should members pay you?</Text>
            <TextInput
              style={styles.textInput}
              value={instructions}
              onChangeText={setInstructions}
              placeholder="e.g. Zelle: organizer@email.com"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={280}
            />
            <Text style={styles.charCount}>{instructions.length}/280</Text>
          </View>

          {/* Examples */}
          <View style={styles.examplesCard}>
            <Text style={styles.examplesTitle}>Quick fill examples</Text>
            {EXAMPLES.map((ex) => (
              <Pressable
                key={ex.label}
                style={styles.exampleRow}
                onPress={() => setInstructions(ex.placeholder)}
              >
                <View style={styles.exampleIcon}>
                  <FontAwesome name="arrow-right" size={12} color={colors.primary} />
                </View>
                <Text style={styles.exampleText}>{ex.placeholder}</Text>
              </Pressable>
            ))}
          </View>

          {/* Save */}
          <Pressable
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            disabled={saving}
            onPress={() => void handleSave()}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <FontAwesome name="check" size={16} color="#fff" />
                <Text style={styles.saveButtonText}>Save Instructions</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: spacing.screenX, paddingBottom: 100, paddingTop: 8 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
    paddingTop: 8,
  },
  backButton: {
    backgroundColor: colors.primarySoft,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1 },
  kicker: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 22, fontWeight: '900', color: colors.textStrong, marginTop: 2 },

  explainerCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.card,
    padding: 16,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  explainerIcon: { marginTop: 2 },
  explainerText: { flex: 1, fontSize: 14, color: colors.primaryDark, lineHeight: 20 },

  formCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 20,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textStrong,
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.text,
    fontSize: 16,
    minHeight: 90,
    padding: 14,
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
  },

  examplesCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 20,
    marginBottom: 24,
    gap: 14,
  },
  examplesTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exampleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleText: { fontSize: 15, color: colors.text, flex: 1 },

  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 17, fontWeight: '900' },
});
