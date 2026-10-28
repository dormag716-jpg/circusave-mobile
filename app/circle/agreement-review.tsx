/**
 * Final circle review + Start Circle.
 *
 * The organizer reviews the exact structure that will start (who holds each
 * payout position, amounts, dates) and checks each confirmation themselves.
 * Start sends the hash of what was reviewed; if the circle changed since, the
 * backend refuses and the review starts over.
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { frequencyOptionKey } from '@/lib/circles/frequencyLabel';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ApiError,
  finalizeCircleAgreementSnapshot,
  getCircleDetail,
  getCircleAgreementReadiness,
  getCircleAgreementSnapshot,
  startCircle,
  type CircleAgreementReadiness,
  type CircleAgreementSnapshot,
} from '@/lib/api';
import { loadAgreementReviewCircleDetail } from '@/lib/circles/agreementReviewLoad';
import { useAuthSession } from '@/lib/auth/authContext';
import {
  canStartFromReview,
  normalizeAgreementLanguage,
  reviewHandRows,
  snapshotExpectedPotCents,
  snapshotServiceFeeCents,
  startConfirmationFlags,
  startReviewErrorCode,
  structuralBlockerCopyKey,
  type ReviewMember,
} from '@/lib/circles/circleAgreements';
import { getCircleLifecyclePhase } from '@/lib/circles/startCircleReadiness';
import { formatCurrency, formatDateTime } from '@/lib/i18n/formatters';
import { circleWorkspaceHref } from '@/lib/platform/navigation';
import {
  extractAuthoritativeMoneyState,
  runMoneyMutation,
} from '@/lib/payments/moneyMutationRecovery';
import { colors, radii, shadows, spacing } from '@/lib/shared/theme';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function CheckRow({
  checked,
  label,
  onPress,
  disabled,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={styles.checkRow}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      accessibilityLabel={label}
    >
      <FontAwesome
        name={checked ? 'check-square' : 'square-o'}
        size={22}
        color={checked ? colors.primary : colors.muted}
      />
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

export default function AgreementReviewScreen() {
  const { t, i18n } = useTranslation(['agreements', 'createCircle']);
  const language = normalizeAgreementLanguage(i18n.resolvedLanguage || i18n.language || 'en');
  const { session } = useAuthSession();
  const token = session?.session.token;
  const userId = String(session?.user?.id || '');
  const params = useLocalSearchParams<{ circleId?: string }>();
  const circleId = String(params.circleId || '').trim();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<CircleAgreementSnapshot | null>(null);
  const [readiness, setReadiness] = useState<CircleAgreementReadiness | null>(null);
  const [members, setMembers] = useState<ReviewMember[]>([]);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [circleName, setCircleName] = useState('');
  const [blockerMessage, setBlockerMessage] = useState<string | null>(null);
  // Nothing is pre-checked, and a tick only counts for the snapshot it was made on.
  const [payoutChecked, setPayoutChecked] = useState(false);
  const [unclaimedChecked, setUnclaimedChecked] = useState(false);
  const [reviewedHash, setReviewedHash] = useState<string | null>(null);
  const reviewedHashRef = useRef<string | null>(null);

  const money = useCallback(
    (cents: number) => formatCurrency((cents || 0) / 100, language),
    [language],
  );

  const resetReview = useCallback(() => {
    reviewedHashRef.current = null;
    setReviewedHash(null);
    setPayoutChecked(false);
    setUnclaimedChecked(false);
  }, []);

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
      const organizer = String(circle.userRole || '').toLowerCase() === 'organizer';
      const setupPhase = getCircleLifecyclePhase(circle) === 'setup';
      setIsOrganizer(organizer);
      setCircleName(String(circle.name || ''));
      setMembers((circle.members ?? []) as ReviewMember[]);

      // Create (or reuse) the snapshot being reviewed. It is idempotent when
      // nothing changed; if the structure is not complete it fails and the
      // blockers below explain why.
      let finalizeMessage: string | null = null;
      if (organizer && setupPhase) {
        try {
          await finalizeCircleAgreementSnapshot(token, circleId);
        } catch (err) {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
            finalizeMessage = err.message;
          } else {
            throw err;
          }
        }
      }

      let snap: CircleAgreementSnapshot | null = null;
      if (!finalizeMessage) {
        try {
          snap = await getCircleAgreementSnapshot(token, circleId);
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) throw err;
        }
      }
      setSnapshot(snap);
      setBlockerMessage(finalizeMessage);

      // A different snapshot than the one that was reviewed: start the review over.
      const nextHash = snap?.snapshotHash ?? null;
      if (reviewedHashRef.current !== null && reviewedHashRef.current !== nextHash) {
        resetReview();
        setNotice(t('reviewChanged'));
      }

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
  }, [circleId, resetReview, t, token]);

  // Reload whenever the screen is shown again and when the app returns to the
  // foreground, so a claim approved elsewhere cannot go unnoticed.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);

  const rows = useMemo(
    () => (snapshot ? reviewHandRows(snapshot, members) : []),
    [snapshot, members],
  );
  const unclaimedRows = useMemo(() => rows.filter((row) => !row.claimed), [rows]);
  const needsUnclaimedConfirmation =
    unclaimedRows.length > 0 || Boolean(readiness?.requiresUnclaimedHandConfirmation);

  const canStart = canStartFromReview({
    readiness,
    snapshot,
    reviewedHash,
    payoutChecked,
    unclaimedChecked,
    needsUnclaimedConfirmation,
    busy,
  });

  const toggleCheck = (which: 'payout' | 'unclaimed') => {
    if (!snapshot) return;
    reviewedHashRef.current = snapshot.snapshotHash;
    setReviewedHash(snapshot.snapshotHash);
    if (which === 'payout') setPayoutChecked((value) => !value);
    else setUnclaimedChecked((value) => !value);
  };

  const goBack = () => {
    router.replace(circleWorkspaceHref(circleId, 'people'));
  };

  const confirmStart = () => {
    if (!token || !circleId || !snapshot || !canStart) return;
    const flags = startConfirmationFlags({
      payoutChecked,
      unclaimedChecked,
      needsUnclaimedConfirmation,
    });
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
                    ...flags,
                    language,
                    snapshotId: snapshot.id,
                    snapshotHash: snapshot.snapshotHash,
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
              const reviewCode = startReviewErrorCode(err);
              if (reviewCode) {
                // What was reviewed is no longer what would start.
                resetReview();
                setNotice(
                  reviewCode === 'start_review_stale'
                    ? t('reviewChanged')
                    : t('reviewRequired'),
                );
                void load();
              } else {
                setError(err instanceof Error ? err.message : t('genericError'));
              }
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const structuralBlockers = (readiness?.structuralBlockers ?? [])
    .map((code) => structuralBlockerCopyKey(code))
    .filter((key): key is string => Boolean(key));

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

        {notice ? (
          <View style={styles.card} accessibilityRole="alert">
            <Text style={styles.blocker}>{notice}</Text>
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
              <Metric
                label={t('frequency')}
                value={
                  frequencyOptionKey(snapshot.frequency)
                    ? t(`createCircle:schedule.options.${frequencyOptionKey(snapshot.frequency)}`)
                    : snapshot.frequency
                }
              />
              <Metric label={t('totalRounds')} value={String(snapshot.totalRounds)} />
              <Metric
                label={t('expectedPotPerRound')}
                value={money(snapshotExpectedPotCents(snapshot))}
              />
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
              {rows.map((row) => {
                const suffix = row.userId && row.userId === userId ? t('finalOrderYours') : '';
                const label = row.name
                  ? t('finalOrderRowNamed', {
                      position: row.position,
                      name: row.name,
                      number: row.handNumber,
                      suffix,
                    })
                  : t('finalOrderRow', {
                      position: row.position,
                      number: row.handNumber,
                      suffix,
                    });
                return (
                  <View key={row.handId} style={styles.orderRow}>
                    <Text style={[styles.body, styles.orderLabel]}>
                      {label}
                      {row.expectedPayoutDate
                        ? ` · ${formatDateTime(row.expectedPayoutDate, language)}`
                        : ''}
                    </Text>
                    <Text
                      style={row.claimed ? styles.claimedTag : styles.unclaimedTag}
                    >
                      {row.claimed ? t('handConnected') : t('handUnclaimed')}
                    </Text>
                  </View>
                );
              })}
            </View>

            {unclaimedRows.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('unclaimedNoticeTitle')}</Text>
                <Text style={styles.body}>
                  {t('unclaimedNoticeBody', {
                    names: unclaimedRows
                      .map((row) => row.name || `#${row.position}`)
                      .join(', '),
                  })}
                </Text>
              </View>
            ) : null}

            {isOrganizer ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('startTitle')}</Text>
                <Text style={styles.body}>{t('startBodyInformational')}</Text>
                <CheckRow
                  checked={payoutChecked}
                  label={t('startPayoutCheck')}
                  onPress={() => toggleCheck('payout')}
                  disabled={busy}
                />
                {needsUnclaimedConfirmation ? (
                  <CheckRow
                    checked={unclaimedChecked}
                    label={t('startUnclaimedCheck')}
                    onPress={() => toggleCheck('unclaimed')}
                    disabled={busy}
                  />
                ) : null}
                {!canStart && !busy ? (
                  <Text style={styles.body}>
                    {readiness &&
                    !(
                      readiness.canStartCircle === true ||
                      readiness.canOpenStartFlow === true ||
                      readiness.structureComplete === true
                    )
                      ? t('startBlockedStructural')
                      : t('checkToStart')}
                  </Text>
                ) : null}
                <Pressable
                  style={[styles.primaryBtn, !canStart && styles.primaryBtnDisabled]}
                  disabled={!canStart}
                  onPress={confirmStart}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canStart }}
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
            <Text style={styles.cardTitle}>
              {isOrganizer ? t('blockersTitle') : t('missingTitle')}
            </Text>
            {isOrganizer ? (
              <>
                {structuralBlockers.map((key) => (
                  <Text key={key} style={styles.body}>
                    {t(key)}
                  </Text>
                ))}
                {structuralBlockers.length === 0 && blockerMessage ? (
                  <Text style={styles.body}>{blockerMessage}</Text>
                ) : null}
                {structuralBlockers.length === 0 && !blockerMessage ? (
                  <Text style={styles.body}>{t('missingBodyStructural')}</Text>
                ) : null}
                <Pressable style={styles.secondaryBtn} onPress={goBack}>
                  <Text style={styles.secondaryBtnText}>{t('back')}</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.body}>{t('missingBodyMember')}</Text>
            )}
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
  orderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  orderLabel: { flex: 1, flexShrink: 1 },
  claimedTag: { color: colors.successText, fontWeight: '700', fontSize: 12 },
  unclaimedTag: { color: colors.warningText, fontWeight: '700', fontSize: 12 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
    minHeight: 44,
  },
  checkLabel: { flex: 1, color: colors.textStrong, fontSize: 14, lineHeight: 20 },
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
