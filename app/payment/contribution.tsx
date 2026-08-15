import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import {
  applyContributionLoadResult,
  createContributionRequestStreams,
  resolveSettlementHandStatus,
} from '@/lib/contributionRequestStreams';
import { circleWorkspaceHref } from '@/lib/navigation';
import { canShowBackendGatedAction } from '@/lib/startCircleReadiness';
import {
  nextContributionReviewExpanded,
  shouldStartContributionReviewExpanded,
} from '@/lib/contributionReview';
import {
  PaymentSessionLock,
  runStripeContributionPayment,
  sanitizePaymentUserMessage,
  shouldBlockContributionPayActions,
  shouldClearPendingSettlement,
  shouldHoldPaymentLockAfterOutcome,
} from '@/lib/stripeContributionPayment';
import { colors, radii, spacing } from '@/lib/theme';
import { DecisionSheet } from '@/components/DecisionSheet';
import { PaymentDestinationList } from '@/components/PaymentDestinationList';
import {
  buildManualContributionSubmitPayload,
  MAX_PAYMENT_REFERENCE_LENGTH,
} from '@/lib/contributionClaim';
import { buildContributionPaymentRails } from '@/lib/contributionPaymentRails';
import { contributionCopy } from '@/lib/i18n/contributionCopy';
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
  const params = useLocalSearchParams<{
    circleId?: string | string[];
    handId?: string | string[];
  }>();
  const circleId = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;
  const requestedHandId = Array.isArray(params.handId)
    ? params.handId[0]
    : params.handId;
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
  const [selectedHandId, setSelectedHandId] = useState<string | null>(
    requestedHandId ?? null,
  );
  const [reviewExpanded, setReviewExpanded] = useState<boolean>(
    shouldStartContributionReviewExpanded(),
  );
  const [meaningExpanded, setMeaningExpanded] = useState(false);
  const [selectedDestinationIndex, setSelectedDestinationIndex] = useState<
    number | null
  >(null);
  const [paymentReferenceDraft, setPaymentReferenceDraft] = useState('');
  const [confirmMarkAsSentVisible, setConfirmMarkAsSentVisible] = useState(false);
  const stripe = useStripe();
  // Synchronous lock: React state alone can allow a second tap before re-render.
  const paymentLockRef = useRef(new PaymentSessionLock());
  const requestStreams = useRef(createContributionRequestStreams());
  const hasLastKnownStateRef = useRef(false);

  const pendingHandIdRef = useRef<string | null>(null);

  const loadContribution = useCallback(
    async (options?: { silent?: boolean; revalidate?: boolean }) => {
      const loadGeneration = requestStreams.current.contributionLoad.next();
      const accessToken = String(token ?? '').trim();
      // Logout / unauthenticated: quiet no-op (no payment error, no PI).
      if (!shouldLoadAuthenticatedScreen({ status, token: accessToken })) {
        applyContributionLoadResult({
          streams: requestStreams.current,
          loadGeneration,
          apply: () => {
            setLoading(false);
          },
        });
        return null;
      }
      if (!circleId) {
        applyContributionLoadResult({
          streams: requestStreams.current,
          loadGeneration,
          apply: () => {
            setError(t('contributions:unavailableBody'));
            setLoading(false);
          },
        });
        return null;
      }

      if (!options?.silent && !hasLastKnownStateRef.current) {
        setLoading(true);
      }
      applyContributionLoadResult({
        streams: requestStreams.current,
        loadGeneration,
        apply: () => {
          setError(null);
        },
      });
      try {
        const getOptions = options?.revalidate ? { revalidate: true } : undefined;
        const [circleResponse, scheduleResponse] = await Promise.all([
          getCircleDetail(accessToken, circleId, getOptions),
          getCircleSchedule(accessToken, circleId),
        ]);
        const applied = applyContributionLoadResult({
          streams: requestStreams.current,
          loadGeneration,
          apply: () => {
            hasLastKnownStateRef.current = true;
            setCircle(circleResponse);
            setSnapshot(scheduleResponse);
          },
        });
        return applied
          ? { circle: circleResponse, snapshot: scheduleResponse }
          : null;
      } catch (loadError) {
        console.error('Unable to load contribution details', loadError);
        applyContributionLoadResult({
          streams: requestStreams.current,
          loadGeneration,
          apply: () => {
            setError(t('financialErrors:loadContribution'));
          },
        });
        return null;
      } finally {
        if (!options?.silent) {
          applyContributionLoadResult({
            streams: requestStreams.current,
            loadGeneration,
            apply: () => {
              setLoading(false);
            },
          });
        }
      }
    },
    [circleId, status, t, token],
  );

  const loadHandStatus = useCallback(async (handId: string): Promise<string> => {
    const settlementGeneration = requestStreams.current.settlementStatus.next();
    const accessToken = String(token ?? '').trim();
    if (!accessToken || !circleId) {
      return 'due';
    }
    const schedule = await getCircleSchedule(accessToken, circleId);
    const contribution = schedule.contributions?.find(
      (entry) => entry.memberId === handId,
    );
    const fetchedStatus = String(contribution?.status || 'due').toLowerCase();
    // Always return this fetch's status to the payment poller. Only the
    // latest settlement generation may write the on-screen schedule snapshot.
    return resolveSettlementHandStatus({
      streams: requestStreams.current,
      settlementGeneration,
      fetchedStatus,
      applySnapshot: () => {
        setSnapshot(schedule);
      },
    });
  }, [circleId, token]);

  useEffect(() => {
    requestStreams.current.contributionLoad.next();
    requestStreams.current.settlementStatus.next();
    hasLastKnownStateRef.current = false;
    pendingHandIdRef.current = null;
    paymentLockRef.current.release();
    setCircle(null);
    setSnapshot(null);
    setError(null);
    setLoading(true);
    setSettlementPhase(null);
    setSelectedHandId(requestedHandId ?? null);
  }, [circleId, requestedHandId]);

  useEffect(() => {
    void loadContribution();
  }, [loadContribution]);

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
  const payActionsBlocked = shouldBlockContributionPayActions({
    payingStripe,
    submitting,
    settlementPhase,
  });
  const payDisabled = !canSubmit || payActionsBlocked;
  const rails = buildContributionPaymentRails({
    paymentInstructions: circle?.paymentInstructions,
    paymentDestinations: circle?.paymentDestinations,
    stripeSupported: isStripeSupported,
  });
  const selectedDestination =
    rails.destinations.length === 1
      ? rails.destinations[0]
      : selectedDestinationIndex != null
        ? rails.destinations[selectedDestinationIndex] ?? null
        : null;

  function promptMarkContributionSent() {
    if (shouldBlockContributionPayActions({
      payingStripe,
      submitting,
      settlementPhase,
    })) {
      return;
    }
    if (payDisabled || !activeHand) {
      return;
    }
    if (rails.destinations.length > 1 && !selectedDestination) {
      Alert.alert(
        contributionCopy(t, 'markAsSent.selectDestinationTitle'),
        contributionCopy(t, 'markAsSent.selectDestinationBody'),
      );
      return;
    }

    setConfirmMarkAsSentVisible(true);
  }

  async function handleSubmitContribution() {
    if (shouldBlockContributionPayActions({
      payingStripe,
      submitting,
      settlementPhase,
    })) {
      return;
    }
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
      await submitContribution(
        accessToken,
        circle.id,
        activeHand.id,
        buildManualContributionSubmitPayload(
          selectedDestination,
          paymentReferenceDraft,
        ),
      );
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
    if (shouldBlockContributionPayActions({
      payingStripe,
      submitting,
      settlementPhase,
    })) {
      return;
    }
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
    let holdLock = false;
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

      holdLock = shouldHoldPaymentLockAfterOutcome(outcome.kind);

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
        pendingHandIdRef.current = null;
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
      pendingHandIdRef.current = frozenHandId;
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
      if (!holdLock) {
        paymentLockRef.current.release();
      }
      setPayingStripe(false);
    }
  }

  async function onPullRefresh() {
    setRefreshing(true);
    try {
      const loaded = await loadContribution({ silent: true, revalidate: true });
      const handId = pendingHandIdRef.current ?? activeHandId;
      if (loaded && handId) {
        const contribution = loaded.snapshot.contributions?.find(
          (entry) => entry.memberId === handId,
        );
        if (shouldClearPendingSettlement(String(contribution?.status || ''))) {
          pendingHandIdRef.current = null;
          setSettlementPhase(null);
          paymentLockRef.current.release();
        }
      }
    } finally {
      setRefreshing(false);
    }
  }

  if (loading && !circle) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.statusCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.statusText}>{t('contributions:loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!circle) {
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

        {error ? (
          <View style={styles.inlineErrorBanner}>
            <FontAwesome name="warning" size={14} color={colors.warning} />
            <Text style={styles.inlineErrorText}>{error}</Text>
            <Pressable
              onPress={() => void loadContribution({ silent: true })}
              accessibilityRole="button"
              accessibilityLabel={t('contributions:retry')}
            >
              <Text style={styles.inlineErrorRetry}>
                {t('contributions:retry')}
              </Text>
            </Pressable>
          </View>
        ) : null}

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
                    if (payActionsBlocked) {
                      return;
                    }
                    setSelectedHandId(hand.id);
                  }}
                  disabled={payActionsBlocked}
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
          <Pressable
            style={styles.reviewHeader}
            onPress={() =>
              setReviewExpanded((open) => nextContributionReviewExpanded(open))
            }
            accessibilityRole="button"
            accessibilityState={{ expanded: reviewExpanded }}
            accessibilityLabel={
              reviewExpanded
                ? t('contributions:collapseReview')
                : t('contributions:expandReview')
            }
          >
            <Text style={styles.reviewTitle}>
              {t('contributions:reviewPaymentDetails')}
            </Text>
            <FontAwesome
              name={reviewExpanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.subtle}
            />
          </Pressable>
          {reviewExpanded ? (
            <View>
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
          ) : null}
        </View>

        {viewerHands.length === 0 ? (
          <Text style={styles.unavailableText}>
            {t('contributions:handsUnavailable')}
          </Text>
        ) : null}

        {rails.showStripeRail ? (
          <View style={styles.railCard}>
            <Text style={styles.railTitle}>
              {contributionCopy(t, 'rails.payInTitle')}
            </Text>
            <Text style={styles.railBody}>
              {contributionCopy(t, 'rails.payInBody')}
            </Text>
            <Pressable
              style={[
                styles.primaryButton,
                styles.railAction,
                payDisabled && styles.disabledButton,
              ]}
              disabled={payDisabled}
              onPress={() => void handleStripePayment()}
              accessibilityRole="button"
              accessibilityState={{
                busy: payActionsBlocked,
                disabled: payDisabled,
              }}
              accessibilityLabel={contributionCopy(t, 'rails.payInAction')}
            >
              <Text style={styles.primaryButtonText}>
                {payingStripe || settlementPhase === 'confirming'
                  ? settlementPhase === 'confirming'
                    ? t('contributions:confirmingStatus')
                    : t('contributions:processing')
                  : contributionCopy(t, 'rails.payInAction')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {rails.showManualRail ? (
          <View style={styles.railCard}>
            <Text style={styles.railTitle}>
              {contributionCopy(t, 'rails.payOutsideTitle')}
            </Text>
            <Text style={styles.railBody}>
              {contributionCopy(t, 'rails.payOutsideBody')}
            </Text>
            {rails.hasInstructions ? (
              <View style={styles.instructionsBox}>
                <Text style={styles.instructionsTitle}>
                  {rails.destinations.length > 1
                    ? contributionCopy(t, 'markAsSent.selectDestinationTitle')
                    : contributionCopy(t, 'workspace.instructionsTitle')}
                </Text>
                {rails.destinations.length > 1 ? (
                  <View style={styles.destinationChoices}>
                    {rails.destinations.map((destination, index) => {
                      const selected = selectedDestinationIndex === index;
                      return (
                        <Pressable
                          key={`${destination.method}-${destination.destination}-${index}`}
                          style={[
                            styles.destinationChoice,
                            selected && styles.destinationChoiceSelected,
                          ]}
                          onPress={() => setSelectedDestinationIndex(index)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        >
                          <Text style={styles.destinationChoiceMethod}>
                            {contributionCopy(
                              t,
                              `paymentSetup.methods.${destination.method}`,
                            )}
                          </Text>
                          {destination.destination ? (
                            <Text style={styles.destinationChoiceHandle}>
                              {destination.destination}
                            </Text>
                          ) : null}
                          {destination.memo ? (
                            <Text style={styles.destinationChoiceMemo}>
                              {destination.memo}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <PaymentDestinationList
                    destinations={rails.destinations}
                    fallbackText={rails.instructions}
                  />
                )}
              </View>
            ) : (
              <View style={styles.instructionsBox}>
                <Text style={styles.instructionsTitle}>
                  {contributionCopy(t, 'workspace.instructionsMissingTitle')}
                </Text>
                <Text style={styles.instructionsText}>
                  {contributionCopy(t, 'workspace.instructionsMissingBody')}
                </Text>
              </View>
            )}
            <Text style={styles.railBody}>
              {contributionCopy(t, 'workspace.circuSaveDoesNotSend')}
            </Text>
            <Pressable
              style={styles.meaningHeader}
              onPress={() => setMeaningExpanded((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: meaningExpanded }}
              accessibilityLabel={
                meaningExpanded
                  ? contributionCopy(t, 'rails.collapseMeaning')
                  : contributionCopy(t, 'rails.expandMeaning')
              }
            >
              <Text style={styles.meaningTitle}>
                {contributionCopy(t, 'rails.markAsSentMeaningTitle')}
              </Text>
              <FontAwesome
                name={meaningExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.subtle}
              />
            </Pressable>
            {meaningExpanded ? (
              <Text style={styles.railBody}>
                {contributionCopy(t, 'rails.markAsSentMeaningBody')}
              </Text>
            ) : null}
            <Pressable
              style={[
                rails.showStripeRail ? styles.secondaryButton : styles.primaryButton,
                styles.railAction,
                payDisabled && styles.disabledButton,
              ]}
              disabled={payDisabled}
              onPress={promptMarkContributionSent}
              accessibilityRole="button"
              accessibilityLabel={t('contributions:submitA11y')}
            >
              <Text
                style={
                  rails.showStripeRail
                    ? styles.secondaryButtonText
                    : styles.primaryButtonText
                }
              >
                {submitting
                  ? t('contributions:submitting')
                  : contributionCopy(t, 'workspace.markAsSent')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      <DecisionSheet
        visible={confirmMarkAsSentVisible}
        onClose={() => setConfirmMarkAsSentVisible(false)}
        icon="check-circle-o"
        iconTone="primary"
        title={contributionCopy(t, 'markAsSent.confirmTitle')}
        body={contributionCopy(t, 'markAsSent.confirmBody', {
          amount: formatCurrency(
            amountPerHand,
            i18n.resolvedLanguage || i18n.language,
          ),
        })}
        primaryLabel={contributionCopy(t, 'workspace.markAsSent')}
        secondaryLabel={contributionCopy(t, 'alerts.cancel')}
        busy={submitting}
        onPrimary={() => {
          setConfirmMarkAsSentVisible(false);
          void handleSubmitContribution();
        }}
      >
        <TextInput
          value={paymentReferenceDraft}
          onChangeText={setPaymentReferenceDraft}
          placeholder={contributionCopy(t, 'markAsSent.referencePlaceholder')}
          accessibilityLabel={contributionCopy(t, 'markAsSent.referenceA11y')}
          placeholderTextColor={colors.muted}
          maxLength={MAX_PAYMENT_REFERENCE_LENGTH}
          style={styles.referenceInput}
        />
      </DecisionSheet>
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
  inlineErrorBanner: {
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inlineErrorText: {
    color: colors.warningText,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  inlineErrorRetry: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
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
    color: colors.primaryBorder,
    fontSize: 13,
    fontWeight: '900',
  },
  amountText: {
    color: colors.onColor,
    fontSize: 46,
    fontWeight: '900',
    marginTop: 8,
  },
  amountBody: {
    color: colors.primarySoft,
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
    paddingHorizontal: spacing.card,
    paddingVertical: 6,
  },
  reviewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingVertical: 10,
  },
  reviewTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
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
  railCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginTop: 16,
    paddingHorizontal: spacing.card,
    paddingVertical: 16,
  },
  railTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  railBody: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  instructionsBox: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    borderRadius: radii.control,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  instructionsTitle: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
  instructionsText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  destinationChoices: { gap: 8 },
  destinationChoice: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  destinationChoiceSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  destinationChoiceMethod: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  destinationChoiceHandle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  destinationChoiceMemo: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  referenceInput: {
    borderColor: colors.cardBorder,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.textStrong,
    fontSize: 15,
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  meaningHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 40,
  },
  meaningTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  railAction: {
    marginTop: 8,
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
    color: colors.onColor,
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
