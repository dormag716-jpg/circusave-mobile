/**
 * Informational final circle review + Start Circle (no agreement acceptances).
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ApiError,
  getCircleDetail,
  getCircleAgreementReadiness,
  getCircleAgreementSnapshot,
  startCircle,
  type CircleAgreementReadiness,
  type CircleAgreementSnapshot,
} from '@/lib/api';
import { loadAgreementReviewCircleDetail } from '@/lib/agreementReviewLoad';
import { useAuthSession } from '@/lib/authContext';
import {
  canEnableOrganizerStart,
  normalizeAgreementLanguage,
  orderedSnapshotHands,
  snapshotServiceFeeCents,
} from '@/lib/circleAgreements';
import { formatCurrency, formatDateTime } from '@/lib/i18n/formatters';
import { circleWorkspaceHref } from '@/lib/navigation';
import {
  extractAuthoritativeMoneyState,
  runMoneyMutation,
} from '@/lib/moneyMutationRecovery';
import { colors, radii, shadows, spacing } from '@/lib/theme';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function AgreementReviewScreen() {
  const { t, i18n } = useTranslation('agreements');
  const language = normalizeAgreementLanguage(i18n.resolvedLanguage || i18n.language || 'en');
  const { session } = useAuthSession();
  const token = session?.session.token;
  const userId = String(session?.user?.id || '');
  const params = useLocalSearchParams<{ circleId?: string }>();
  const circleId = String(params.circleId || '').trim();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<CircleAgreementSnapshot | null>(null);
  const [readiness, setReadiness] = useState<CircleAgreementReadiness | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [circleName, setCircleName] = useState('');

  const money = useCallback(
    (cents: number) => formatCurrency((cents || 0) / 100, language),
    [language],
  );

  const load = useCallback(async () => {
    if (!token || !circleId) return;
    setLoading(true);
    setError(null);
    try {
      const circle = await loadAgreementReviewCircleDetail(
        getCircleDetail,
        token,
        circleId,
      );
      setIsOrganizer(String(circle.userRole || '').toLowerCase() === 'organizer');
      setCircleName(String(circle.name || ''));

      let snap: CircleAgreementSnapshot | null = null;
      try {
        snap = await getCircleAgreementSnapshot(token, circleId);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }
      setSnapshot(snap);

      try {
        setReadiness(await getCircleAgreementReadiness(token, circleId));
      } catch {
        setReadiness(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  }, [circleId, t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const payoutOrderHands = useMemo(
    () => (snapshot ? orderedSnapshotHands(snapshot) : []),
    [snapshot],
  );

  const canStart = canEnableOrganizerStart({
    readiness,
    startPayoutChecked: true,
    startUnclaimedChecked: true,
    busy,
  });

  const goBack = () => {
    router.replace(circleWorkspaceHref(circleId, 'people'));
  };

  const confirmStart = () => {
    if (!token || !circleId || !canStart) return;
    Alert.alert(t('startConfirmTitle'), t('startConfirmBody'), [
      { text: t('startConfirmCancel'), style: 'cancel' },
      {
        text: t('startConfirmAction'),
        style: 'default',
        onPress: () => {
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              await runMoneyMutation({
                mutate: () =>
                  startCircle(token, circleId, {
                    confirmPayoutOrder: true,
                    confirmUnclaimedHands: Boolean(readiness?.requiresUnclaimedHandConfirmation),
                    language,
                    snapshotId: readiness?.snapshotId || snapshot?.id,
                    snapshotHash: readiness?.snapshotHash || snapshot?.snapshotHash,
                  }),
                goal: 'started',
                loadAuthoritativeState: async () => {
                  const detail = await getCircleDetail(token, circleId, {
                    revalidate: true,
                  });
                  return extractAuthoritativeMoneyState({
                    circleStatus: detail.status,
                    circleStarted: detail.isStarted ?? detail.is_started,
                    startedAt: detail.startedAt,
                  });
                },
              });
              Alert.alert(t('started'), undefined, [
                {
                  text: 'OK',
                  onPress: () => router.replace(circleWorkspaceHref(circleId)),
                },
              ]);
            } catch (err) {
              setError(err instanceof Error ? err.message : t('genericError'));
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
          <FontAwesome name="arrow-left" size={18} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>{isOrganizer ? t('title') : t('titleMember')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.body}>{t('loading')}</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.card}>
            <Text style={styles.blocker}>{error}</Text>
            <Pressable style={styles.secondaryBtn} onPress={() => void load()}>
              <Text style={styles.secondaryBtnText}>{t('retry') || 'Retry'}</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && snapshot ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{circleName || t('title')}</Text>
              <Text style={styles.version}>
                {t('snapshotVersion', { version: snapshot.snapshotVersion })}
              </Text>
              <Text style={styles.lockWarning}>{t('structureLockWarning')}</Text>
            </View>

            <View style={styles.card}>
              <Metric
                label={t('contributionPerHand')}
                value={money(snapshot.memberReview.contributionPerHandCents)}
              />
              <Metric label={t('frequency')} value={snapshot.frequency} />
              <Metric label={t('totalRounds')} value={String(snapshot.totalRounds)} />
              <Metric
                label={t('serviceFee')}
                value={money(snapshotServiceFeeCents(snapshot))}
              />
              <Metric
                label={t('organizerParticipates')}
                value={snapshot.organizerParticipates ? t('yes') : t('no')}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('finalOrderTitle')}</Text>
              {payoutOrderHands.map((hand) => (
                <Text style={styles.body} key={hand.handId}>
                  {t('finalOrderRow', {
                    position: hand.payoutPosition,
                    number: hand.handNumber,
                    suffix: hand.userId === userId ? t('finalOrderYours') : '',
                  })}
                  {hand.expectedPayoutDate
                    ? ` · ${formatDateTime(hand.expectedPayoutDate, language)}`
                    : ''}
                </Text>
              ))}
            </View>

            {isOrganizer ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('startTitle')}</Text>
                <Text style={styles.body}>{t('startBodyInformational')}</Text>
                {!canStart ? (
                  <Text style={styles.blocker}>{t('startBlockedStructural')}</Text>
                ) : null}
                <Pressable
                  style={[styles.primaryBtn, (!canStart || busy) && styles.primaryBtnDisabled]}
                  disabled={!canStart || busy}
                  onPress={confirmStart}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.onColor} />
                  ) : (
                    <Text style={styles.primaryBtnText}>{t('start')}</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.body}>{t('memberInformationalOnly')}</Text>
              </View>
            )}
          </>
        ) : null}

        {!loading && !snapshot && !error ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('missingTitle')}</Text>
            <Text style={styles.body}>
              {isOrganizer ? t('missingBodyStructural') : t('missingBodyMember')}
            </Text>
            {isOrganizer ? (
              <Pressable
                style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
                disabled={busy}
                onPress={confirmStart}
              >
                <Text style={styles.primaryBtnText}>{t('start')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenX,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  backBtn: { width: 36, padding: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.textStrong },
  content: { padding: spacing.screenX, paddingBottom: 48, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.card,
    gap: 10,
    ...shadows.small,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', color: colors.textStrong },
  body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  version: { color: colors.muted, fontSize: 13 },
  lockWarning: {
    color: colors.textStrong,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricLabel: { color: colors.muted, flex: 1 },
  metricValue: { color: colors.textStrong, fontWeight: '700' },
  blocker: { color: colors.danger, fontWeight: '700', lineHeight: 20 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: colors.onColor, fontWeight: '800', fontSize: 16 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.control,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.textStrong, fontWeight: '700' },
});
