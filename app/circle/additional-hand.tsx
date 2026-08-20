import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  getAdditionalHandPreview,
  requestAdditionalHand,
  type AdditionalHandPreview,
} from '@/lib/api';
import { normalizeAgreementLanguage, shouldRefreshStaleSnapshot } from '@/lib/circleAgreements';
import { useAuthSession } from '@/lib/authContext';
import { logClientError } from '@/lib/errorLogging';
import { formatCurrency } from '@/lib/i18n/formatters';
import { circleWorkspaceHref } from '@/lib/navigation';
import { colors, radii, shadows, spacing } from '@/lib/theme';

export default function AdditionalHandConsentScreen() {
  const { t, i18n } = useTranslation('agreements');
  const { session } = useAuthSession();
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = Array.isArray(params.circleId) ? params.circleId[0] : params.circleId;
  const token = session?.session.token;
  const language = normalizeAgreementLanguage(i18n.resolvedLanguage || i18n.language);
  const [preview, setPreview] = useState<AdditionalHandPreview | null>(null);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!token || !circleId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setChecked(false);
    setError(null);
    try {
      setPreview(await getAdditionalHandPreview(token, circleId));
    } catch (requestError) {
      logClientError('Unable to load additional-hand obligation preview', requestError, {
        circleId,
      });
      setPreview(null);
      setError(t('genericError'));
    } finally {
      setLoading(false);
    }
  }, [circleId, t, token]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  async function submit() {
    if (!token || !circleId || !preview || !checked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestAdditionalHand(token, circleId, {
        previewHash: preview.previewHash,
        acceptedAdditionalHandObligation: true,
        consentTextVersion: preview.consentTextVersion,
        language,
        clientIdentifier: 'circusave-expo-mobile-v1',
      });
      router.replace({ pathname: '/circle/workspace', params: { circleId, tab: 'people', additionalHandRequested: '1' } });
    } catch (requestError) {
      logClientError('Unable to request an additional hand', requestError, { circleId });
      if (shouldRefreshStaleSnapshot(requestError)) {
        setError(t('previewExpired'));
        await loadPreview();
      } else {
        setError(t('genericError'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const money = (cents: number) =>
    formatCurrency(cents / 100, language, preview?.currency || 'USD', 2);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => (circleId ? router.replace(circleWorkspaceHref(circleId, 'people')) : router.back())} accessibilityRole="button">
            <FontAwesome name="chevron-left" size={24} color={colors.textStrong} />
          </Pressable>
          <Text style={styles.title}>{t('additionalTitle')}</Text>
          <View style={styles.spacer} />
        </View>

        {loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {preview ? (
          <>
            <View style={[styles.card, styles.draftCard]}>
              <Text style={styles.draftText}>{t('additionalDraft')}</Text>
            </View>
            <View style={styles.card}>
              <Row label={t('currentRecurringObligation', { frequency: preview.frequency })} value={money(preview.currentRecurringObligationCents)} />
              <Row label={t('additionalRecurringObligation')} value={money(preview.additionalRecurringObligationCents)} />
              <Row label={t('newRecurringObligation', { frequency: preview.frequency })} value={money(preview.newRecurringObligationCents)} strong />
              <Row label={t('remainingRounds')} value={String(preview.remainingRounds)} />
              <Row label={t('currentRemainingObligation')} value={money(preview.currentRemainingObligationCents)} />
              <Row label={t('additionalRemainingObligation')} value={money(preview.additionalRemainingObligationCents)} />
              <Row label={t('newTotalRemainingObligation')} value={money(preview.newTotalRemainingObligationCents)} strong />
            </View>
            <View style={styles.card}>
              <Pressable style={styles.consentRow} onPress={() => setChecked((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked }}>
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked ? <FontAwesome name="check" color={colors.onColor} size={13} /> : null}</View>
                <Text style={styles.consentLabel}>{t('additionalCheck')}</Text>
              </Pressable>
              <Pressable style={[styles.primary, (!checked || submitting) && styles.disabled]} disabled={!checked || submitting} onPress={() => void submit()} accessibilityRole="button">
                {submitting ? <ActivityIndicator color={colors.onColor} /> : <Text style={styles.primaryText}>{t('additionalAction')}</Text>}
              </Pressable>
              <Pressable style={styles.cancel} disabled={submitting} onPress={() => (circleId ? router.replace(circleWorkspaceHref(circleId, 'people')) : router.back())} accessibilityRole="button">
                <Text style={styles.cancelText}>{t('cancel')}</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.row}><Text style={[styles.label, strong && styles.strong]}>{label}</Text><Text style={[styles.value, strong && styles.strong]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenX, paddingBottom: 48, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 24 },
  title: { flex: 1, color: colors.textStrong, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radii.card, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing.card, gap: 14, ...shadows.small },
  draftCard: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  draftText: { color: colors.textStrong, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  label: { color: colors.muted, flex: 1 },
  value: { color: colors.textStrong, fontWeight: '700', textAlign: 'right' },
  strong: { color: colors.primaryDark, fontWeight: '900' },
  consentRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.primary },
  consentLabel: { flex: 1, color: colors.text, lineHeight: 20 },
  primary: { backgroundColor: colors.primary, padding: 15, borderRadius: radii.control, alignItems: 'center' },
  primaryText: { color: colors.onColor, fontWeight: '800', textAlign: 'center' },
  cancel: { padding: 12, alignItems: 'center' },
  cancelText: { color: colors.primary, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, padding: 12, borderRadius: 12 },
});
