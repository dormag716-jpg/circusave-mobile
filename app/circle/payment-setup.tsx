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
import { useTranslation } from 'react-i18next';

import { getCircleDetail, updateCircleSettings } from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { contributionCopy } from '@/lib/i18n/contributionCopy';
import { formatDateTime } from '@/lib/i18n/formatters';
import { circleWorkspaceHref } from '@/lib/navigation';
import {
  destinationsForPaymentSetupEditor,
  MAX_PAYMENT_DESTINATION_LENGTH,
  MAX_PAYMENT_DESTINATION_MEMO_LENGTH,
  MAX_PAYMENT_DESTINATIONS,
  PAYMENT_DESTINATION_METHODS,
  type PaymentDestinationMethod,
} from '@/lib/paymentDestinations';
import { saveCirclePaymentInstructions } from '@/lib/paymentSetupSave';
import { colors, radii, spacing } from '@/lib/theme';

type DestinationDraft = {
  key: string;
  method: PaymentDestinationMethod;
  destination: string;
  memo: string;
};

let draftSeq = 0;

function createDraft(
  method: PaymentDestinationMethod = 'zelle',
  destination = '',
  memo = '',
): DestinationDraft {
  draftSeq += 1;
  return { key: `dest-${draftSeq}`, method, destination, memo };
}

export default function PaymentSetupScreen() {
  const { t, i18n } = useTranslation(['contributions', 'financialErrors']);
  const { session } = useAuthSession();
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = Array.isArray(params.circleId) ? params.circleId[0] : params.circleId;
  const token = session?.session.token;

  const [circleName, setCircleName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [drafts, setDrafts] = useState<DestinationDraft[]>([createDraft()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [instructionAudit, setInstructionAudit] = useState<
    Array<{ at?: string; nextInstructions?: string | null }>
  >([]);

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
        const editorRows = destinationsForPaymentSetupEditor({
          paymentInstructions: circle.paymentInstructions,
          paymentDestinations: circle.paymentDestinations,
        });
        if (editorRows.length > 0) {
          setDrafts(
            editorRows.map((row) =>
              createDraft(row.method, row.destination, row.memo ?? ''),
            ),
          );
        }
        if (circle.paymentInstructions) {
          setInstructions(circle.paymentInstructions);
        }
        setInstructionAudit(
          Array.isArray(circle.paymentInstructionAudit)
            ? circle.paymentInstructionAudit
            : [],
        );
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

    setSaving(true);
    try {
      const result = await saveCirclePaymentInstructions({
        token,
        circleId,
        instructions,
        destinations: drafts,
        updateCircleSettings,
      });

      if (result.status === 'empty_instructions') {
        Alert.alert(
          t('contributions:paymentSetup.requiredTitle'),
          t('contributions:paymentSetup.requiredBody'),
        );
        return;
      }

      if (result.status === 'missing_token') {
        Alert.alert(
          t('contributions:paymentSetup.saveFailedTitle'),
          t('financialErrors:generic'),
        );
        return;
      }

      if (result.status === 'error') {
        console.error(
          'Unable to save circle payment instructions',
          result.error,
        );
        Alert.alert(
          t('contributions:paymentSetup.saveFailedTitle'),
          t('financialErrors:generic'),
        );
        return;
      }

      // Success only after updateCircleSettings resolved.
      Alert.alert(
        t('contributions:paymentSetup.savedTitle'),
        t('contributions:paymentSetup.savedBody'),
        [
          {
            text: t('contributions:paymentSetup.done'),
            onPress: () => router.replace(circleWorkspaceHref(circleId)),
          },
        ],
      );
    } finally {
      setSaving(false);
    }
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
              accessibilityLabel={t('contributions:paymentSetup.backA11y')}
            >
              <FontAwesome name="angle-left" size={28} color={colors.primaryDark} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>
                {t('contributions:paymentSetup.title')}
              </Text>
              <Text style={styles.title}>
                {circleName || t('contributions:paymentSetup.circleFallback')}
              </Text>
            </View>
          </View>

          {/* Explainer */}
          <View style={styles.explainerCard}>
            <View style={styles.explainerIcon}>
              <FontAwesome name="info-circle" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={styles.explainerText}>
                {t('contributions:paymentSetup.explainer')}
              </Text>
              <Text style={styles.explainerText}>
                {t('contributions:paymentSetup.notPayoutPreferences')}
              </Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>
              {contributionCopy(t, 'paymentSetup.fieldLabel')}
            </Text>
            {drafts.map((draft, index) => (
              <View key={draft.key} style={styles.destinationCard}>
                <View style={styles.destinationHeader}>
                  <Text style={styles.destinationIndex}>
                    {contributionCopy(t, 'paymentSetup.methodLabel')}
                  </Text>
                  {drafts.length > 1 ? (
                    <Pressable
                      onPress={() =>
                        setDrafts((current) =>
                          current.filter((row) => row.key !== draft.key),
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={contributionCopy(
                        t,
                        'paymentSetup.removeA11y',
                      )}
                    >
                      <Text style={styles.removeText}>
                        {contributionCopy(t, 'paymentSetup.removeDestination')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.methodWrap}>
                  {PAYMENT_DESTINATION_METHODS.map((method) => {
                    const selected = draft.method === method;
                    return (
                      <Pressable
                        key={method}
                        style={[
                          styles.methodChip,
                          selected && styles.methodChipSelected,
                        ]}
                        onPress={() =>
                          setDrafts((current) =>
                            current.map((row) =>
                              row.key === draft.key ? { ...row, method } : row,
                            ),
                          )
                        }
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text
                          style={[
                            styles.methodChipText,
                            selected && styles.methodChipTextSelected,
                          ]}
                        >
                          {contributionCopy(t, `paymentSetup.methods.${method}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.subLabel}>
                  {contributionCopy(t, 'paymentSetup.destinationLabel')}
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={draft.destination}
                  onChangeText={(value) =>
                    setDrafts((current) =>
                      current.map((row) =>
                        row.key === draft.key
                          ? { ...row, destination: value }
                          : row,
                      ),
                    )
                  }
                  placeholder={contributionCopy(
                    t,
                    `paymentSetup.destinationPlaceholder.${draft.method}`,
                  )}
                  accessibilityLabel={contributionCopy(
                    t,
                    'paymentSetup.destinationA11y',
                  )}
                  placeholderTextColor={colors.muted}
                  maxLength={MAX_PAYMENT_DESTINATION_LENGTH}
                />
                <Text style={styles.subLabel}>
                  {contributionCopy(t, 'paymentSetup.memoLabel')}
                </Text>
                <TextInput
                  style={styles.memoInput}
                  value={draft.memo}
                  onChangeText={(value) =>
                    setDrafts((current) =>
                      current.map((row) =>
                        row.key === draft.key ? { ...row, memo: value } : row,
                      ),
                    )
                  }
                  placeholder={contributionCopy(
                    t,
                    'paymentSetup.memoPlaceholder',
                  )}
                  accessibilityLabel={contributionCopy(t, 'paymentSetup.memoA11y')}
                  placeholderTextColor={colors.muted}
                  maxLength={MAX_PAYMENT_DESTINATION_MEMO_LENGTH}
                />
                {index < drafts.length - 1 ? <View style={styles.rowDivider} /> : null}
              </View>
            ))}
            {drafts.length < MAX_PAYMENT_DESTINATIONS ? (
              <Pressable
                style={styles.addButton}
                onPress={() => setDrafts((current) => [...current, createDraft()])}
                accessibilityRole="button"
                accessibilityLabel={contributionCopy(t, 'paymentSetup.addA11y')}
              >
                <FontAwesome name="plus" size={14} color={colors.primary} />
                <Text style={styles.addButtonText}>
                  {contributionCopy(t, 'paymentSetup.addDestination')}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.charCount}>
                {contributionCopy(t, 'paymentSetup.maxDestinations', {
                  count: MAX_PAYMENT_DESTINATIONS,
                })}
              </Text>
            )}
          </View>

          {instructionAudit.length > 0 ? (
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>
                {contributionCopy(t, 'paymentSetup.recentChanges')}
              </Text>
              {instructionAudit.slice(-3).reverse().map((event, index) => (
                <Text key={`${event.at || 'audit'}-${index}`} style={styles.charCount}>
                  {event.at
                    ? formatDateTime(event.at, i18n.resolvedLanguage || i18n.language)
                    : ''}
                  {event.nextInstructions ? ` · ${event.nextInstructions}` : ''}
                </Text>
              ))}
            </View>
          ) : null}

          {/* Save */}
          <Pressable
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            disabled={saving}
            onPress={() => void handleSave()}
          >
            {saving ? (
              <ActivityIndicator color={colors.onColor} />
            ) : (
              <>
                <FontAwesome name="check" size={16} color={colors.onColor} />
                <Text style={styles.saveButtonText}>
                  {t('contributions:paymentSetup.save')}
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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
  explainerText: { fontSize: 14, color: colors.primaryDark, lineHeight: 20 },

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
  destinationCard: { gap: 10, marginBottom: 16 },
  destinationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  destinationIndex: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  removeText: { fontSize: 13, fontWeight: '800', color: colors.danger },
  methodWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodChip: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.background,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  methodChipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  methodChipText: { fontSize: 13, fontWeight: '700', color: colors.text },
  methodChipTextSelected: { color: colors.primaryDark },
  subLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textStrong,
    marginTop: 4,
  },
  textInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    padding: 14,
  },
  memoInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.text,
    fontSize: 15,
    minHeight: 44,
    padding: 14,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginTop: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  addButtonText: { fontSize: 15, fontWeight: '800', color: colors.primary },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
  },

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
  saveButtonText: { color: colors.onColor, fontSize: 17, fontWeight: '900' },
});
