import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  getCircleDetail,
  getCircleSchedule,
  getCircles,
  getDashboardSummary,
  type BackendCircleDetail,
  type BackendRoundSnapshot,
} from '@/lib/api';
import { shouldLoadAuthenticatedScreen } from '@/lib/activityAuthGate';
import { useAuthSession } from '@/lib/authContext';
import { formatCurrency, formatShortDate } from '@/lib/i18n/formatters';
import {
  formatPayoutDateWithRelative,
  presentDashboardClockPayout,
  resolveCircleRoundPayoutDate,
  resolveDashboardClockPayout,
} from '@/lib/dashboardPayoutDates';
import {
  circleWorkspaceHref,
  contributionHref,
  createCircleHref,
  joinCircleHref,
  myCirclesHref,
} from '@/lib/navigation';
import { isOrganizer } from '@/lib/permissions';
import { colors, radii, shadows, spacing } from '@/lib/theme';
import type { BackendCircleSummary, DashboardSummary } from '@/lib/types';
import {
  isActiveCircleStatus,
  isSetupCircleStatus,
} from '@/lib/circleSummary';
import { seedCircleWorkspaceCache } from '@/lib/circleWorkspaceCache';
import {
  shouldReserveDashboardActionSlot,
  shouldShowDashboardEmptyCircles,
  shouldShowDashboardSkeleton,
  shouldUseSilentDashboardRefresh,
} from '@/lib/dashboardPaint';
import {
  createRequestGeneration,
  shouldReplaceFinancialStateOnError,
} from '@/lib/requestGeneration';
import { canShowBackendGatedAction } from '@/lib/startCircleReadiness';

type IconName = ComponentProps<typeof FontAwesome>['name'];

const PERSONAL_DUE_STATUSES = new Set(['due', 'missed', 'rejected']);
const REVIEW_STATUSES = new Set(['submitted', 'late']);
const DETAIL_LIMIT = 5;

export default function DashboardScreen() {
  const { session, status } = useAuthSession();
  const { t, i18n } = useTranslation('dashboard');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [circles, setCircles] = useState<BackendCircleSummary[]>([]);
  const [circleDetails, setCircleDetails] = useState<
    Record<string, BackendCircleDetail>
  >({});
  const [circleSchedules, setCircleSchedules] = useState<
    Record<string, BackendRoundSnapshot>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailsReady, setDetailsReady] = useState(false);
  const requestGeneration = useRef(createRequestGeneration());
  const hasLastKnownStateRef = useRef(false);
  const token = session?.session.token;
  const userId = session?.user.id;
  const displayName = session?.user.name ?? t('memberFallback');
  const firstName = displayName.split(' ')[0] || t('memberFallback');
  const formatMoney = useCallback(
    (amount: number) => formatCurrency(amount, i18n.resolvedLanguage || i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const formatPayoutLabel = useCallback(
    (value?: string | null) =>
      formatPayoutDateWithRelative(
        value,
        (iso) => formatShortDate(iso, i18n.resolvedLanguage || i18n.language),
        t,
      ),
    [i18n.language, i18n.resolvedLanguage, t],
  );

  const activeCircles = useMemo(
    () =>
      circles.filter((circle) =>
        isActiveCircleStatus(circle.status, circle.pot_status),
      ),
    [circles],
  );
  const setupCircles = useMemo(
    () => circles.filter((circle) => isSetupCircleStatus(circle.status)),
    [circles],
  );

  const userIsOrganizer = useMemo(
    () => [...activeCircles, ...setupCircles].some((circle) => isOrganizer(circle.userRole)),
    [activeCircles, setupCircles],
  );

  const { personalDueCircles, reviewTargets } = useMemo(
    () =>
      deriveContributionActions(
        activeCircles,
        circleDetails,
        circleSchedules,
        userId,
      ),
    [activeCircles, circleDetails, circleSchedules, userId],
  );

  const personalDueCount = personalDueCircles.length;
  const reviewCount = reviewTargets.reduce(
    (sum, target) => sum + target.count,
    0,
  );
  const firstReviewTarget = reviewTargets[0];
  const firstDueCircle = personalDueCircles[0];

  const clockPayout = useMemo(
    () =>
      resolveDashboardClockPayout({
        circles: activeCircles.map((circle) => ({
          circleId: circle.id,
          circleName: circle.name,
          currentRound: circle.currentRound,
          nextPayout: circle.nextPayout,
          schedule: circleSchedules[circle.id],
          detail: circleDetails[circle.id],
        })),
        summaryUpcoming: summary?.upcomingPayout ?? null,
      }),
    [activeCircles, circleDetails, circleSchedules, summary?.upcomingPayout],
  );
  const clockPresentation = useMemo(
    () => presentDashboardClockPayout(clockPayout, t),
    [clockPayout, t],
  );
  const hasSnapshot = summary !== null || circles.length > 0;
  const showSkeleton = shouldShowDashboardSkeleton({ loading, hasSnapshot });
  const showEmptyCircles = shouldShowDashboardEmptyCircles({
    hasSnapshot,
    activeCircleCount: activeCircles.length,
  });
  const reserveActionSlot = shouldReserveDashboardActionSlot({
    detailsReady,
    pendingContributions: summary?.pendingContributions ?? 0,
  });

  const loadDashboard = useCallback(
    async (options?: { silent?: boolean; revalidate?: boolean }) => {
      const generation = requestGeneration.current.next();
      const accessToken = String(token ?? '').trim();
      // Logout / unauthenticated: quiet no-op (not sessionMissing).
      if (!shouldLoadAuthenticatedScreen({ status, token: accessToken })) {
        if (requestGeneration.current.isCurrent(generation)) {
          setLoading(false);
          setRefreshing(false);
        }
        return;
      }

      const firstPaint = !hasLastKnownStateRef.current;
      if (!options?.silent && firstPaint) {
        setLoading(true);
        setDetailsReady(false);
      }
      if (requestGeneration.current.isCurrent(generation)) {
        setError(null);
      }

      try {
        const getOptions = options?.revalidate ? { revalidate: true } : undefined;
        const [nextSummary, nextCircles] = await Promise.all([
          getDashboardSummary(accessToken, getOptions),
          getCircles(accessToken, getOptions),
        ]);
        if (!requestGeneration.current.isCurrent(generation)) {
          return;
        }

        hasLastKnownStateRef.current = true;
        setSummary(nextSummary);
        setCircles(nextCircles);
        setLoading(false);

        const nextActiveCircles = nextCircles.filter((circle) =>
          isActiveCircleStatus(circle.status, circle.pot_status),
        );
        const toLoad = nextActiveCircles.slice(0, DETAIL_LIMIT);

        const [details, schedules] = await Promise.all([
          Promise.all(
            toLoad.map((c) =>
              getCircleDetail(accessToken, c.id, getOptions).catch(() => null),
            ),
          ),
          Promise.all(
            toLoad.map((c) =>
              getCircleSchedule(accessToken, c.id).catch(() => null),
            ),
          ),
        ]);

        if (!requestGeneration.current.isCurrent(generation)) {
          return;
        }

        const detailsMap: Record<string, BackendCircleDetail> = {};
        const schedulesMap: Record<string, BackendRoundSnapshot> = {};
        toLoad.forEach((circle, index) => {
          const detail = details[index];
          const schedule = schedules[index];
          if (detail) {
            detailsMap[circle.id] = detail;
          }
          if (schedule) {
            schedulesMap[circle.id] = schedule;
          }
          if (detail || schedule) {
            seedCircleWorkspaceCache({
              circleId: circle.id,
              detail: detail ?? null,
              schedule: schedule ?? null,
            });
          }
        });

        setCircleDetails(detailsMap);
        setCircleSchedules(schedulesMap);
        setDetailsReady(true);
      } catch {
        if (!requestGeneration.current.isCurrent(generation)) {
          return;
        }
        setError(t('loadError'));
        if (shouldReplaceFinancialStateOnError(hasLastKnownStateRef.current)) {
          setSummary(null);
          setCircles([]);
          setCircleDetails({});
          setCircleSchedules({});
          setDetailsReady(false);
        }
      } finally {
        if (requestGeneration.current.isCurrent(generation)) {
          setLoading(false);
        }
      }
    },
    [status, t, token],
  );

  useFocusEffect(
    useCallback(() => {
      void loadDashboard({
        silent: shouldUseSilentDashboardRefresh(hasLastKnownStateRef.current),
      });
    }, [loadDashboard]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadDashboard({ silent: true, revalidate: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.greeting}>
          <View style={styles.welcomeRow}>
            <Text style={styles.welcome}>
              {getGreeting(t)}, {firstName} 👋
            </Text>
            {hasSnapshot ? (
              <View
                style={[
                  styles.roleBadge,
                  userIsOrganizer ? styles.organizerBadge : styles.memberBadge,
                ]}
              >
                <Text style={styles.roleBadgeText}>
                  {userIsOrganizer ? t('organizer') : t('member')}
                </Text>
              </View>
            ) : null}
          </View>
          {hasSnapshot ? (
            <Text style={styles.subtitle}>
              {userIsOrganizer
                ? t('organizerSubtitle')
                : t('memberSubtitle')}
            </Text>
          ) : (
            <View style={styles.skeletonLine} />
          )}
        </View>

        {showSkeleton ? (
          <View
            style={styles.heroSkeleton}
            accessibilityRole="progressbar"
            accessibilityLabel={t('loadingDashboard')}
          />
        ) : activeCircles.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            pagingEnabled
            snapToInterval={
              Dimensions.get('window').width - spacing.screenX * 2 + 16
            }
            decelerationRate="fast"
            contentContainerStyle={styles.heroCarouselContainer}
          >
            {activeCircles.map((circle) => {
              const potTotal = circle.contributionAmount * circle.memberCount;
              const detail = circleDetails[circle.id];
              const schedule = circleSchedules[circle.id];
              const payoutDate = resolvePayoutDate(circle, schedule, detail);
              const payoutLabel = formatPayoutLabel(payoutDate);
              return (
                <Pressable
                  key={circle.id}
                  style={({ pressed }) => [
                    styles.carouselHeroCard,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => router.push(circleWorkspaceHref(circle.id))}
                  accessibilityRole="button"
                  accessibilityLabel={t('openCircleAccessibility', {
                    circleName: circle.name,
                    payout: payoutLabel
                      ? t('payoutAccessibility', { payout: payoutLabel })
                      : '',
                  })}
                >
                  <Text style={styles.heroSub}>{circle.name}</Text>
                  <Text style={styles.heroLabel}>{t('inPot')}</Text>
                  <Text style={styles.heroAmount}>{formatMoney(potTotal)}</Text>
                  <View style={styles.heroFooterRow}>
                    <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <Text style={styles.heroFooterText}>
                        {t('contribution', {
                          amount: formatMoney(circle.contributionAmount),
                        })}
                      </Text>
                      <Text style={styles.heroPayoutDate}>
                        {t('payoutDate', {
                          date: payoutLabel || t('notScheduled'),
                        })}
                      </Text>
                    </View>
                    <Text style={styles.heroTapHint}>{t('tapToOpen')}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : showEmptyCircles ? (
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>
              {t('noActiveCircles')}
            </Text>
            <Text style={styles.heroSub}>
              {t('noActiveDescription')}
            </Text>
          </View>
        ) : null}

        {personalDueCount > 0 && firstDueCircle ? (
          <View style={[styles.payDueCard, { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={[styles.actionCardHeader, { marginBottom: 4 }]}>
                <FontAwesome name="exclamation-circle" size={18} color={colors.primaryDark} />
                <Text style={styles.payDueTitle}>{t('contributionDue')}</Text>
              </View>
              <Text style={[styles.payDueSubtitle, { marginTop: 0 }]}>
                {t('nextPaymentReady', { circleName: firstDueCircle.name })}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.payDueButton,
                { marginTop: 0, paddingHorizontal: 14, paddingVertical: 10 },
                pressed && styles.pressed,
              ]}
              onPress={() =>
                router.push(contributionHref(firstDueCircle.id))
              }
              accessibilityRole="button"
              accessibilityLabel={t('payYourPart')}
            >
              <Text style={styles.payDueButtonText}>{t('payNow')}</Text>
              <FontAwesome name="arrow-right" size={12} color={colors.onColor} />
            </Pressable>
          </View>
        ) : null}

        {reviewCount > 0 && firstReviewTarget ? (
          <View style={[styles.reviewCard, { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={[styles.actionCardHeader, { marginBottom: 4 }]}>
                <FontAwesome name="check-circle" size={18} color={colors.warningStrong} />
                <Text style={styles.reviewTitle}>{t('paymentsToReview')}</Text>
              </View>
              <Text style={[styles.reviewSubtitle, { marginTop: 0 }]}>
                {t('paymentWaiting', {
                  count: reviewCount,
                  circleName: firstReviewTarget.circle.name,
                })}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.reviewButton,
                { marginTop: 0, paddingHorizontal: 14, paddingVertical: 10 },
                pressed && styles.pressed,
              ]}
              onPress={() =>
                router.push(
                  circleWorkspaceHref(firstReviewTarget.circle.id, 'round'),
                )
              }
              accessibilityRole="button"
              accessibilityLabel={t('reviewPayments')}
            >
              <Text style={styles.reviewButtonText}>{t('review')}</Text>
              <FontAwesome name="arrow-right" size={12} color={colors.onColor} />
            </Pressable>
          </View>
        ) : reserveActionSlot ? (
          <View
            style={styles.actionSlotReserve}
            accessibilityRole="progressbar"
            accessibilityLabel={t('checkingContributions')}
          />
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>{t('dataUnavailable')}</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
            <Pressable
              style={styles.retryButton}
              onPress={() =>
                void loadDashboard({
                  silent: shouldUseSilentDashboardRefresh(
                    hasLastKnownStateRef.current,
                  ),
                })
              }
              accessibilityRole="button"
              accessibilityLabel={t('retryDashboard')}
            >
              <Text style={styles.retryText}>{t('retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          {showSkeleton ? (
            <>
              <View style={styles.statSkeleton} />
              <View style={styles.statSkeleton} />
            </>
          ) : (
            <>
              <StatCard
                icon="clock-o"
                value={clockPresentation.value}
                label={clockPresentation.label}
                color={
                  clockPresentation.overdue ? colors.danger : colors.success
                }
                valueColor={
                  clockPresentation.overdue ? colors.danger : undefined
                }
                detail={clockPresentation.detail ?? undefined}
                detailColor={
                  clockPresentation.overdue ? colors.danger : undefined
                }
              />
              <StatCard
                icon="users"
                value={String(summary?.activeCircles ?? activeCircles.length)}
                label={t('activeCircles')}
                color={colors.primary}
                detail={
                  userIsOrganizer
                    ? t('manageCircles')
                    : undefined
                }
              />
            </>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('activeCircles')}</Text>
            <Pressable
              onPress={() => router.push(myCirclesHref)}
              accessibilityRole="button"
              accessibilityLabel={t('seeAllActive')}
            >
              <Text style={styles.seeAll}>{t('seeAll')}</Text>
            </Pressable>
          </View>

          {showSkeleton ? (
            <View style={styles.circleList}>
              <View style={styles.circleSkeleton} />
              <View style={styles.circleSkeleton} />
            </View>
          ) : activeCircles.length > 0 ? (
            <View style={styles.circleList}>
              {activeCircles.map((circle) => {
                const detail = circleDetails[circle.id];
                const progress = circle.currentRoundProgress?.percentConfirmed;
                const currentRoundNumber = circle.currentRound;
                const totalRounds = detail?.members?.length;
                const viewerMember = detail?.members.find(
                  (m) => m.userId === userId,
                );
                const isViewerRecipient =
                  viewerMember &&
                  detail?.currentRoundSummary?.recipientMemberId ===
                    viewerMember.id;
                const circleRecipientName = getCurrentRecipientName(detail);
                const schedule = circleSchedules[circle.id];
                const payoutDate = resolvePayoutDate(circle, schedule, detail);
                const formattedPayoutDate = formatPayoutLabel(payoutDate);
                const circleIsOrganizer = isOrganizer(circle.userRole);

                return (
                  <Pressable
                    key={circle.id}
                    style={({ pressed }) => [
                      styles.circleCard,
                      pressed && styles.pressed,
                    ]}
                    onPress={() =>
                      router.push(circleWorkspaceHref(circle.id))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t('openCircleAccessibility', {
                      circleName: circle.name,
                      payout: '',
                    })}
                  >
                    <View style={styles.circleHeader}>
                      <Text style={styles.circleName}>{circle.name}</Text>
                      <View style={styles.progressRing}>
                        <Text style={styles.progressText}>
                          {formatProgress(progress)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.circleMeta}>
                      {t('roundProgress', {
                        frequency: t(`frequency.${circle.frequency}`, {
                          defaultValue: circle.frequency,
                        }),
                        round: formatRound(currentRoundNumber),
                        total: totalRounds
                          ? t('roundTotal', { total: totalRounds })
                          : '',
                      })}
                    </Text>
                    {isViewerRecipient ? (
                      <View style={{ alignItems: 'flex-start', width: '100%' }}>
                        <Text
                          style={[
                            styles.recipient,
                            { color: colors.success, fontWeight: '900' },
                          ]}
                        >
                          {t('yourTurn')}
                        </Text>
                        <Text
                          style={[
                            styles.circleMeta,
                            {
                              marginTop: 2,
                              color: colors.success,
                              flexShrink: 1,
                              width: '100%',
                            },
                          ]}
                        >
                          {t('payoutDate', {
                            date: formattedPayoutDate || t('notScheduled'),
                          })}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ alignItems: 'flex-start', width: '100%' }}>
                        <Text style={styles.recipient}>
                          {t('nextRecipient', {
                            name: circleRecipientName ?? t('unavailable'),
                          })}
                        </Text>
                        <Text
                          style={[
                            styles.circleMeta,
                            {
                              marginTop: 2,
                              flexShrink: 1,
                              width: '100%',
                            },
                          ]}
                        >
                          {t('payoutDate', {
                            date: formattedPayoutDate || t('notScheduled'),
                          })}
                        </Text>
                      </View>
                    )}
                    {circleIsOrganizer ? (
                      <Text style={styles.manageLabel}>{t('manageAsOrganizer')}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : showEmptyCircles ? (
            <View style={styles.emptyCard}>
              <FontAwesome name="users" size={28} color={colors.muted} />
              <Text style={styles.emptyTitle}>{t('emptyActiveTitle')}</Text>
              <Text style={styles.emptyText}>
                {t('emptyActiveDescription')}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.pressed,
            ]}
            onPress={() => router.push(createCircleHref)}
            accessibilityRole="button"
            accessibilityLabel={t('createNewCircle')}
          >
            <FontAwesome name="plus" size={20} color={colors.onColor} />
            <Text style={styles.actionText}>{t('newCircle')}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.secondaryAction,
              pressed && styles.pressed,
            ]}
            onPress={() => router.push(joinCircleHref)}
            accessibilityRole="button"
            accessibilityLabel={t('joinWithCode')}
          >
            <FontAwesome name="key" size={18} color={colors.primary} />
            <Text style={styles.secondaryActionText}>{t('joinByCode')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function deriveContributionActions(
  activeCircles: BackendCircleSummary[],
  circleDetails: Record<string, BackendCircleDetail>,
  circleSchedules: Record<string, BackendRoundSnapshot>,
  userId?: string,
) {
  const personalDueCircles: BackendCircleSummary[] = [];
  const reviewTargets: { circle: BackendCircleSummary; count: number }[] = [];

  for (const circle of activeCircles) {
    const schedule = circleSchedules[circle.id];
    if (!schedule) {
      continue;
    }

    const detail = circleDetails[circle.id];
    const viewerMemberIds =
      schedule.roundWorkspace?.viewerMemberIds &&
      schedule.roundWorkspace.viewerMemberIds.length > 0
        ? schedule.roundWorkspace.viewerMemberIds
        : detail?.members
            .filter((member) => member.userId === userId)
            .map((member) => member.id) ??
          (schedule.roundWorkspace?.viewerMemberId
            ? [schedule.roundWorkspace.viewerMemberId]
            : []);

    const currentRound =
      schedule.roundWorkspace?.currentRoundNumber ?? schedule.currentRound;

    const contributionsForRound = schedule.contributions.filter(
      (contribution) => contribution.round === currentRound,
    );

    const perms = schedule.roundWorkspace?.viewerPermissions;
    // Backend financial flags are authoritative — never OR with local role.
    const canSubmit = canShowBackendGatedAction(perms?.canSubmitOwnContribution);
    const canReview = canShowBackendGatedAction(perms?.canApproveContributions);

    if (canSubmit && viewerMemberIds.length > 0) {
      // Due if any of the user's hands still need payment this round.
      const hasDueHand = viewerMemberIds.some((memberId) => {
        const viewerContribution = contributionsForRound.find(
          (contribution) => contribution.memberId === memberId,
        );
        const status = String(viewerContribution?.status ?? '')
          .trim()
          .toLowerCase();
        return !viewerContribution || PERSONAL_DUE_STATUSES.has(status);
      });
      if (hasDueHand) {
        personalDueCircles.push(circle);
      }
    }

    if (canReview) {
      const pendingReview = contributionsForRound.filter((contribution) =>
        REVIEW_STATUSES.has(String(contribution.status).trim().toLowerCase()),
      ).length;

      if (pendingReview > 0) {
        reviewTargets.push({ circle, count: pendingReview });
      }
    }
  }

  return { personalDueCircles, reviewTargets };
}

function StatCard({
  icon,
  value,
  label,
  color,
  detail,
  detailColor,
  valueColor,
}: {
  icon: IconName;
  value: string;
  label: string;
  color: string;
  detail?: string;
  detailColor?: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.statCard}>
      <FontAwesome name={icon} size={28} color={color} />
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
      {detail ? (
        <Text
          style={[styles.statDetail, detailColor ? { color: detailColor } : null]}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

function getGreeting(t: (key: string, options?: Record<string, unknown>) => string) {
  const hour = new Date().getHours();
  if (hour < 12) return t('greetingMorning');
  if (hour < 18) return t('greetingAfternoon');
  return t('greetingEvening');
}

/**
 * Per-circle **current/open-round payout target** (not global upcomingPayout).
 *
 * Field order: nextPayout.payoutDate → schedule current-round payoutDate →
 * currentRoundSummary.dueDate. May be overdue while upcomingPayout is later.
 */
function resolvePayoutDate(
  circle: BackendCircleSummary,
  schedule?: BackendRoundSnapshot | null,
  detail?: BackendCircleDetail | null,
): string | null {
  const roundNumber =
    schedule?.roundWorkspace?.currentRoundNumber ??
    schedule?.currentRound ??
    detail?.currentRound ??
    circle.currentRound;

  const scheduleRows = schedule?.schedule ?? [];
  const match = scheduleRows.find(
    (row) => Number(row.round) === Number(roundNumber),
  );
  const fromSchedule = match?.payoutDate || match?.payout_date;

  return resolveCircleRoundPayoutDate({
    nextPayoutDate: circle.nextPayout?.payoutDate,
    schedulePayoutDate: fromSchedule != null ? String(fromSchedule) : null,
    currentRoundDueDate: detail?.currentRoundSummary?.dueDate,
  });
}

function getCurrentRecipientName(circle: BackendCircleDetail | null | undefined) {
  const recipientMemberId = circle?.currentRoundSummary?.recipientMemberId;
  if (!recipientMemberId) {
    return null;
  }

  const recipient = circle?.members.find(
    (member) => member.id === recipientMemberId,
  );
  return recipient?.full_name || recipient?.name || null;
}

function formatProgress(progress?: number) {
  return typeof progress === 'number' && Number.isFinite(progress)
    ? `${Math.max(0, Math.min(100, Math.round(progress)))}%`
    : '—';
}

function formatRound(round?: number) {
  return typeof round === 'number' && Number.isFinite(round) ? round : '—';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 100,
    paddingHorizontal: spacing.screenX,
    paddingTop: 20,
  },
  greeting: {
    marginBottom: 28,
  },
  welcomeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  welcome: {
    color: colors.textStrong,
    fontSize: 32,
    fontWeight: '900',
  },
  roleBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  organizerBadge: {
    backgroundColor: colors.primary,
  },
  memberBadge: {
    backgroundColor: colors.primaryDark,
  },
  roleBadgeText: {
    color: colors.onColor,
    fontSize: 11,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    marginTop: 4,
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 28,
    marginBottom: 24,
    minHeight: 184,
    padding: 28,
  },
  heroSkeleton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 28,
    marginBottom: 24,
    minHeight: 184,
  },
  skeletonLine: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    height: 16,
    marginTop: 8,
    width: 220,
  },
  actionSlotReserve: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: 16,
    minHeight: 72,
  },
  statSkeleton: {
    backgroundColor: colors.card,
    borderRadius: 20,
    flex: 1,
    minHeight: 144,
  },
  circleSkeleton: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 128,
  },
  heroCarouselContainer: {
    gap: 16,
    paddingBottom: 20,
  },
  carouselHeroCard: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 28,
    marginBottom: 4,
    padding: 28,
    width: Dimensions.get('window').width - spacing.screenX * 2,
  },
  heroFooterRow: {
    borderTopColor: 'rgba(255,255,255,0.2)',
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 16,
    width: '100%',
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
  },
  heroFooterText: {
    color: colors.onColor,
    fontSize: 15,
    fontWeight: '700',
  },
  heroPayoutDate: {
    color: 'rgba(255,255,255,0.92)',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  heroTapHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
  },
  heroLabel: {
    color: colors.primaryBorder,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  heroAmount: {
    color: colors.onColor,
    fontSize: 48,
    fontWeight: '900',
    marginVertical: 8,
  },
  heroSub: {
    color: colors.primaryLight,
    fontSize: 15,
  },
  payDueCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18,
  },
  actionCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  payDueTitle: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '900',
  },
  payDueSubtitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  payDueButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  payDueButtonText: {
    color: colors.onColor,
    fontSize: 14,
    fontWeight: '900',
  },
  reviewCard: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18,
  },
  reviewTitle: {
    color: colors.warningText,
    fontSize: 17,
    fontWeight: '900',
  },
  reviewSubtitle: {
    color: colors.warningText,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  reviewButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.warningStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  reviewButtonText: {
    color: colors.onColor,
    fontSize: 14,
    fontWeight: '900',
  },
  errorCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    padding: 16,
  },
  errorCopy: {
    flex: 1,
  },
  errorTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  errorText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  retryButton: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  retryText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    ...shadows.small,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 20,
    flex: 1,
    minHeight: 144,
    padding: 20,
  },
  statValue: {
    color: colors.textStrong,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  statDetail: {
    color: colors.success,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  seeAll: {
    color: colors.primary,
    fontWeight: '700',
  },
  circleList: {
    gap: 16,
  },
  circleCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  circleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  circleName: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
    paddingRight: 12,
  },
  progressRing: {
    alignItems: 'center',
    borderColor: colors.primary,
    borderRadius: 30,
    borderWidth: 6,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  progressText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
  },
  circleMeta: {
    color: colors.muted,
    marginTop: 8,
  },
  recipient: {
    color: colors.text,
    fontWeight: '700',
    marginTop: 4,
  },
  manageLabel: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 10,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 28,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 14,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: 12,
  },
  actionText: {
    color: colors.onColor,
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryAction: {
    backgroundColor: colors.card,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  secondaryActionText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
});
