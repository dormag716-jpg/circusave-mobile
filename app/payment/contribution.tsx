import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

const isStripeSupported = Platform.OS !== 'web' && Constants.appOwnership !== 'expo';

import {
  ApiError,
  createPaymentIntent,
  getCircleDetail,
  getCircleSchedule,
  submitContribution,
  type BackendCircleDetail,
  type BackendCircleMember,
  type BackendRoundSnapshot,
} from '@/lib/api';
import { shouldLoadAuthenticatedScreen } from '@/lib/activityAuthGate';
import { useAuthSession } from '@/lib/authContext';
import { circleWorkspaceHref } from '@/lib/navigation';
import { canShowBackendGatedAction } from '@/lib/startCircleReadiness';
import {
  PaymentSessionLock,
  runStripeContributionPayment,
  sanitizePaymentUserMessage,
} from '@/lib/stripeContributionPayment';
import { colors, radii, spacing } from '@/lib/theme';
import {
  contributionStatusLabel,
  contributionTotal,
} from '@/lib/i18n/financial-presentation';
import { formatCurrency } from '@/lib/i18n/formatters';

export default function ContributionPaymentScreen() {
  const { t, i18n } = useTranslation([
    'contributions',
    'financialErrors',
    'createCircle',
    'people',
  ]);
  const { session, status } = useAuthSession();
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;
  const token = session?.session.token;
  const userId = session?.user.id;

  const [circle, setCircle] = useState<BackendCircleDetail | null>(null);
  const [snapshot, setSnapshot] = useState<BackendRoundSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [payingStripe, setPayingStripe] = useState(false);
  /** UI phase while waiting for webhook settlement after PaymentSheet success. */
  const [settlementPhase, setSettlementPhase] = useState<
    null | 'confirming' | 'pending'
  >(null);
  const [refreshing, setRefreshing] = useState(false);
  const stripe = useStripe();
  // Synchronous lock: React state alone can allow a second tap before re-render.
  const paymentLockRef = useRef(new PaymentSessionLock());

  async function loadContribution(options?: { silent?: boolean }) {
    const accessToken = String(token ?? '').trim();
    // Logout / unauthenticated: quiet no-op (no payment error, no PI).
    if (!shouldLoadAuthenticatedScreen({ status, token: accessToken })) {
      setLoading(false);
      return null;
    }
    if (!circleId) {
      setError(t('contributions:unavailableBody'));
      setLoading(false);
      return null;
    }

    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [circleResponse, scheduleResponse] = await Promise.all([
        getCircleDetail(accessToken, circleId),
        getCircleSchedule(accessToken, circleId),
      ]);
      setCircle(circleResponse);
      setSnapshot(scheduleResponse);
      return { circle: circleResponse, snapshot: scheduleResponse };
    } catch (loadError) {
      console.error('Unable to load contribution details', loadError);
      setError(t('financialErrors:loadContribution'));
      return null;
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  async function loadHandStatus(handId: string): Promise<string> {
    const accessToken = String(token ?? '').trim();
    if (!accessToken || !circleId) {
      return 'due';
    }
    const schedule = await getCircleSchedule(accessToken, circleId);
    // Keep UI snapshot in sync during settlement polling (no new PaymentIntent).
    setSnapshot(schedule);
    const contribution = schedule.contributions?.find(
      (entry) => entry.memberId === handId,
    );
    return String(contribution?.status || 'due').toLowerCase();
  }

  useEffect(() => {
    void loadContribution();
  }, [circleId, token, status]);

  const viewerHands = findViewerHands(circle, userId, snapshot, t);
  const amountPerHand = circle?.contributionAmount ?? 0;
  const totalOwedPerRound =
    contributionTotal({
      amountPerHand,
      handCount: viewerHands.length,
      serverTotal: circle?.viewerContributionSummary?.totalOwedPerRound,
    });
  const recipient = findRecipient(circle, snapshot);
  const currentRound =
    snapshot?.currentRoundSummary?.roundNumber ??
    snapshot?.roundWorkspace?.currentRoundNumber ??
    snapshot?.currentRound ??
    circle?.currentRound;

  const dueHands = viewerHands.filter((hand) =>
    ['due', 'missed', 'rejected'].includes(hand.status),
  );
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);
  const activeHandId =
    selectedHandId && dueHands.some((h) => h.id === selectedHandId)
      ? selectedHandId
      : dueHands[0]?.id ?? viewerHands[0]?.id ?? null;
  const activeHand = viewerHands.find((h) => h.id === activeHandId);
  const statusLabel = contributionStatusLabel(activeHand?.status, t);
  // Backend schedule/detail permissions are authoritative for financial submit.
  // Missing flags default false — never invent allow from role or local status alone.
  const backendCanSubmit = canShowBackendGatedAction(
    snapshot?.roundWorkspace?.viewerPermissions?.canSubmitOwnContribution ??
      (circle as BackendCircleDetail & {
        viewerPermissions?: { canSubmitOwnContribution?: boolean };
      } | null)?.viewerPermissions?.canSubmitOwnContribution,
  );
  const handDue =
    Boolean(activeHand) &&
    ['due', 'missed', 'rejected'].includes(String(activeHand?.status || ''));
  // Pattern: backend true AND local hand-due condition (never reverse).
  const canSubmit = backendCanSubmit && handDue;

  async function handleSubmitContribution() {
    const accessToken = String(token ?? '').trim();
    if (!shouldLoadAuthenticatedScreen({ status, token: accessToken })) {
      return;
    }
    if (!accessToken || !circle || !activeHand) {
      Alert.alert(
        t('contributions:alerts.unavailableTitle'),
        t('contributions:alerts.handMissing'),
      );
      return;
    }
    if (!backendCanSubmit) {
      Alert.alert(
        t('contributions:alerts.unavailableTitle'),
        t('contributions:alerts.handMissing'),
      );
      return;
    }

    setSubmitting(true);
    try {
      await submitContribution(accessToken, circle.id, activeHand.id);
      Alert.alert(
        t('contributions:submittedTitle'),
        t('contributions:submittedBody', { hand: activeHand.label }),
        [
          {
            text: t('contributions:alerts.ok'),
            onPress: () => void loadContribution(),
          },
        ],
      );
    } catch (submitError) {
      console.error('Unable to submit contribution', submitError);
      Alert.alert(
        t('contributions:alerts.submitFailedTitle'),
        financialClientErrorMessage(
          submitError,
          t('financialErrors:submitContribution'),
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStripePayment() {
    const accessToken = String(token ?? '').trim();
    if (!shouldLoadAuthenticatedScreen({ status, token: accessToken })) {
      return;
    }
    if (!accessToken || !circle || !activeHand || currentRound == null) return;
    if (!backendCanSubmit) {
      Alert.alert(
        t('contributions:alerts.paymentFailedTitle'),
        t('financialErrors:stripePayment'),
      );
      return;
    }

    // Freeze hand at tap time so sibling hands cannot be paid by mistake.
    const frozenHandId = activeHand.id;
    const frozenHandLabel = activeHand.label;
    const frozenCircleId = circle.id;
    const frozenRound = currentRound;

    if (!paymentLockRef.current.tryAcquire()) {
      return;
    }

    setPayingStripe(true);
    setSettlementPhase(null);
    try {
      const outcome = await runStripeContributionPayment(
        {
          token: accessToken,
          circleId: frozenCircleId,
          roundNumber: frozenRound,
          handId: frozenHandId,
        },
        {
          createPaymentIntent,
          initPaymentSheet: (params) => stripe.initPaymentSheet(params),
          presentPaymentSheet: () => stripe.presentPaymentSheet(),
          loadHandStatus: async (handId) => {
            setSettlementPhase('confirming');
            return loadHandStatus(handId);
          },
          pollIntervalMs: 1500,
          pollMaxAttempts: 8,
        },
      );

      if (outcome.kind === 'canceled') {
        return;
      }

      if (outcome.kind === 'error') {
        Alert.alert(
          t('contributions:alerts.paymentFailedTitle'),
          sanitizePaymentUserMessage(
            { message: outcome.message },
            t('financialErrors:stripePayment'),
          ),
        );
        return;
      }

      if (outcome.kind === 'confirmed') {
        setSettlementPhase(null);
        Alert.alert(
          t('contributions:paymentConfirmedTitle'),
          t('contributions:paymentConfirmedBody', { hand: frozenHandLabel }),
          [
            {
              text: t('contributions:alerts.ok'),
              onPress: () => void loadContribution({ silent: true }),
            },
          ],
        );
        return;
      }

      // PaymentSheet succeeded; webhook has not confirmed yet.
      setSettlementPhase('pending');
      Alert.alert(
        t('contributions:paymentPendingSettlementTitle'),
        t('contributions:paymentPendingSettlementBody'),
        [
          {
            text: t('contributions:alerts.ok'),
            onPress: () => void loadContribution({ silent: true }),
          },
        ],
      );
    } catch (err: unknown) {
      console.error('Unable to complete Stripe contribution payment', err);
      Alert.alert(
        t('contributions:alerts.paymentFailedTitle'),
        financialClientErrorMessage(err, t('financialErrors:stripePayment')),
      );
    } finally {
      paymentLockRef.current.release();
      setPayingStripe(false);
    }
  }

  async function onPullRefresh() {
    setRefreshing(true);
    try {
      const loaded = await loadContribution({ silent: true });
      if (loaded && activeHandId) {
        const contribution = loaded.snapshot.contributions?.find(
          (entry) => entry.memberId === activeHandId,
        );
        if (String(contribution?.status || '').toLowerCase() === 'confirmed') {
          setSettlementPhase(null);
        }
      }
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.statusCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.statusText}>{t('contributions:loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !circle) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.statusCard}>
          <FontAwesome name="warning" size={32} color={colors.warning} />
          <Text style={styles.statusTitle}>
            {t('contributions:unavailableTitle')}
          </Text>
          <Text style={styles.statusText}>
            {error ?? t('contributions:unavailableBody')}
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => void loadContribution()}
            accessibilityRole="button"
            accessibilityLabel={t('contributions:retry')}
          >
            <Text style={styles.primaryButtonText}>
              {t('contributions:retry')}
            </Text>
          </Pressable>
          {circleId ? (
            <Pressable
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primarySoft, marginTop: 12 },
              ]}
              onPress={() => router.replace(circleWorkspaceHref(circleId))}
              accessibilityRole="button"
              accessibilityLabel={t('contributions:backToWorkspace')}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: colors.primaryDark },
                ]}
              >
                {t('contributions:backToWorkspace')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onPullRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.replace(circleWorkspaceHref(circle.id))}
            accessibilityRole="button"
            accessibilityLabel={t('contributions:backToWorkspace')}
          >
            <FontAwesome name="angle-left" size={24} color={colors.primaryDark} />
          </Pressable>
          <View>
            <Text style={styles.kicker}>{t('contributions:title')}</Text>
            <Text style={styles.title}>{circle.name}</Text>
          </View>
        </View>

        {settlementPhase === 'confirming' || settlementPhase === 'pending' ? (
          <View style={styles.settlementBanner} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.settlementBannerText}>
              {settlementPhase === 'confirming'
                ? t('contributions:paymentConfirmingBody')
                : t('contributions:paymentPendingSettlementBody')}
            </Text>
          </View>
        ) : null}

        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>
            {viewerHands.length > 1
              ? t('contributions:totalDue')
              : t('contributions:contributionDue')}
          </Text>
          <Text style={styles.amountText}>
            {formatCurrency(
              dueHands.length > 0
                ? amountPerHand * dueHands.length
                : totalOwedPerRound,
              i18n.resolvedLanguage || i18n.language,
            )}
          </Text>
          <Text style={styles.amountBody}>
            {viewerHands.length > 1
              ? t('contributions:perHandSummary', {
                  amount: formatCurrency(
                    amountPerHand,
                    i18n.resolvedLanguage || i18n.language,
                  ),
                  count: viewerHands.length,
                  round: formatRound(currentRound),
                })
              : t('contributions:frequencySummary', {
                  frequency: frequencyLabel(circle.frequency, t),
                  round: formatRound(currentRound),
                })}
          </Text>
        </View>

        {viewerHands.length > 0 ? (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>
              {t('contributions:yourHands')}
            </Text>
            {viewerHands.map((hand) => {
              const selected = hand.id === activeHandId;
              const due = ['due', 'missed', 'rejected'].includes(hand.status);
              return (
                <Pressable
                  key={hand.id}
                  style={[
                    styles.handRow,
                    selected && styles.handRowSelected,
                    !due && styles.handRowSettled,
                  ]}
                  onPress={() => {
                    if (payingStripe || settlementPhase === 'confirming') {
                      return;
                    }
                    setSelectedHandId(hand.id);
                  }}
                  disabled={payingStripe || settlementPhase === 'confirming'}
                  accessibilityRole="button"
                  accessibilityLabel={t('contributions:selectHand', {
                    name: hand.label,
                  })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.handTitle}>{hand.label}</Text>
                    <Text style={styles.handMeta}>
                      {formatCurrency(
                        amountPerHand,
                        i18n.resolvedLanguage || i18n.language,
                      )}{' '}
                      · {contributionStatusLabel(hand.status, t)}
                    </Text>
                  </View>
                  {selected ? (
                    <FontAwesome name="check-circle" size={18} color={colors.primary} />
                  ) : null}
                </Pressable>
              );
            })}
            <Text style={styles.handHint}>
              {t('contributions:handPaymentNotice')}
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.iconBox}>
            <FontAwesome name="user" size={18} color={colors.primary} />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardLabel}>
              {t('contributions:recipient')}
            </Text>
            <Text style={styles.cardTitle}>
              {memberName(recipient, t('contributions:statusLabels.unavailable'))}
            </Text>
            <Text style={styles.cardBody}>
              {t('contributions:recipientDescription', {
                round: formatRound(currentRound),
              })}
            </Text>
          </View>
        </View>

        <View style={styles.reviewCard}>
          <Text style={styles.reviewTitle}>{t('contributions:review')}</Text>
          <ReviewRow label={t('contributions:circle')} value={circle.name} />
          <ReviewRow
            label={t('contributions:round')}
            value={formatRound(currentRound)}
          />
          <ReviewRow
            label={t('contributions:selectedHand')}
            value={activeHand?.label ?? '—'}
          />
          <ReviewRow
            label={t('contributions:amountForHand')}
            value={formatCurrency(
              amountPerHand,
              i18n.resolvedLanguage || i18n.language,
            )}
          />
          <ReviewRow label={t('contributions:status')} value={statusLabel} />
        </View>

        {viewerHands.length === 0 ? (
          <Text style={styles.unavailableText}>
            {t('contributions:handsUnavailable')}
          </Text>
        ) : null}

        {isStripeSupported ? (
          <Pressable
            style={[
              styles.primaryButton,
              (!canSubmit ||
                payingStripe ||
                submitting ||
                settlementPhase === 'confirming') &&
                styles.disabledButton,
            ]}
            disabled={
              !canSubmit ||
              payingStripe ||
              submitting ||
              settlementPhase === 'confirming'
            }
            onPress={() => void handleStripePayment()}
            accessibilityRole="button"
            accessibilityState={{
              busy: payingStripe || settlementPhase === 'confirming',
              disabled:
                !canSubmit ||
                payingStripe ||
                submitting ||
                settlementPhase === 'confirming',
            }}
            accessibilityLabel={t('contributions:payWithStripe')}
          >
            <Text style={styles.primaryButtonText}>
              {payingStripe || settlementPhase === 'confirming'
                ? settlementPhase === 'confirming'
                  ? t('contributions:confirmingStatus')
                  : t('contributions:processing')
                : t('contributions:payWithStripe')}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[
            isStripeSupported ? styles.secondaryButton : styles.primaryButton,
            (!canSubmit || payingStripe || submitting) && styles.disabledButton,
          ]}
          disabled={!canSubmit || payingStripe || submitting}
          onPress={() => void handleSubmitContribution()}
          accessibilityRole="button"
          accessibilityLabel={t('contributions:submitA11y')}
        >
          <Text style={isStripeSupported ? styles.secondaryButtonText : styles.primaryButtonText}>
            {submitting
              ? t('contributions:submitting')
              : isStripeSupported
                ? t('contributions:confirmManual')
                : canSubmit
                  ? t('contributions:submit')
                  : statusLabel}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

type ViewerHandRow = {
  id: string;
  label: string;
  handNumber: number;
  status: string;
};

function findViewerHands(
  circle: BackendCircleDetail | null,
  userId?: string,
  snapshot?: BackendRoundSnapshot | null,
  t?: TFunction,
): ViewerHandRow[] {
  if (!circle || !userId) {
    return [];
  }

  const fromDetail =
    circle.viewerHands && circle.viewerHands.length > 0
      ? circle.viewerHands
      : (circle.members || []).filter((member) => member.userId === userId);

  const multi = fromDetail.length > 1;
  return fromDetail
    .map((member) => {
      const handNumber = Number(member.handNumber ?? member.hand_number ?? 1);
      const base =
        member.displayLabel ||
        member.full_name ||
        member.name;
      const handLabel =
        t?.('people:hands.handLabel', { number: handNumber }) ||
        String(handNumber);
      const label = base ? (multi ? `${base} · ${handLabel}` : base) : handLabel;
      const contribution = snapshot?.contributions?.find(
        (entry) => entry.memberId === member.id,
      );
      return {
        id: member.id,
        label,
        handNumber,
        status: String(contribution?.status || 'due').toLowerCase(),
      };
    })
    .sort((a, b) => a.handNumber - b.handNumber);
}

/** Prefer backend lifecycle messages (e.g. 409) over generic financial copy. */
function financialClientErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message.trim()) {
    return sanitizePaymentUserMessage(error, fallback);
  }
  return sanitizePaymentUserMessage(error, fallback);
}

function findRecipient(
  circle: BackendCircleDetail | null,
  snapshot: BackendRoundSnapshot | null,
) {
  const recipientId =
    snapshot?.currentRoundSummary?.recipientMemberId ??
    snapshot?.roundWorkspace?.currentRecipientMemberId ??
    circle?.currentRoundSummary?.recipientMemberId;
  return (circle?.members || []).find((member) => member.id === recipientId);
}

function memberName(member: BackendCircleMember | undefined, fallback: string) {
  return member?.full_name || member?.name || fallback;
}

function formatRound(round?: number) {
  return typeof round === 'number' && Number.isFinite(round) ? String(round) : '-';
}

function frequencyLabel(value: string, t: TFunction) {
  const normalized = value.toLowerCase().replace(/[-_\s]/g, '');
  const key =
    normalized === 'biweekly'
      ? 'biweekly'
      : normalized === 'monthly'
        ? 'monthly'
        : 'weekly';
  return t(`createCircle:frequency.options.${key}`);
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  settlementBanner: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  settlementBannerText: {
    color: colors.primaryDark,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  handRow: {
    borderColor: colors.cardBorder,
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  handRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  handRowSettled: {
    opacity: 0.72,
  },
  handTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  handMeta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  handHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingBottom: 34,
    paddingHorizontal: spacing.screenX,
    paddingTop: 22,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 18,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  kicker: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    color: colors.textStrong,
    fontSize: 30,
    fontWeight: '900',
    marginTop: 2,
  },
  amountCard: {
    backgroundColor: colors.primary,
    borderRadius: 30,
    padding: 22,
  },
  cardLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  amountLabel: {
    color: '#ddd6fe',
    fontSize: 13,
    fontWeight: '900',
  },
  amountText: {
    color: '#ffffff',
    fontSize: 46,
    fontWeight: '900',
    marginTop: 8,
  },
  amountBody: {
    color: '#ede9fe',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 5,
  },
  cardBody: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 5,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    padding: spacing.card,
  },
  iconBox: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  reviewCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 16,
    padding: spacing.card,
  },
  reviewTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  reviewRow: {
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
    paddingVertical: 13,
  },
  reviewLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  reviewValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    height: 56,
    justifyContent: 'center',
    marginTop: 32,
    width: '100%',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: colors.primary,
    borderRadius: radii.control,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    marginTop: 16,
    width: '100%',
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.55,
  },
  unavailableText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 14,
  },
  statusCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    margin: spacing.screenX,
    padding: spacing.card,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 12,
  },
  statusText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
});
