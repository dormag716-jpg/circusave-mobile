import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, type ComponentProps } from 'react';
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

import {
  getCircleDetail,
  getCircleSchedule,
  getCircles,
  getDashboardSummary,
  type BackendCircleDetail,
  type BackendRoundSnapshot,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { useMarket } from '@/lib/market';
import {
  circleWorkspaceHref,
  contributionHref,
  createCircleHref,
  myCirclesHref,
} from '@/lib/navigation';
import { isOrganizer } from '@/lib/permissions';
import { colors, radii, shadows, spacing } from '@/lib/theme';
import type { BackendCircleSummary, DashboardSummary } from '@/lib/types';

type IconName = ComponentProps<typeof FontAwesome>['name'];

const PERSONAL_DUE_STATUSES = new Set(['due', 'missed', 'rejected']);
const REVIEW_STATUSES = new Set(['submitted', 'late']);
const DETAIL_LIMIT = 5;

export default function DashboardScreen() {
  const { session } = useAuthSession();
  const { t } = useMarket();
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
  const token = session?.session.token;
  const userId = session?.user.id;
  const displayName = session?.user.name ?? 'Member';
  const firstName = displayName.split(' ')[0] || 'Member';

  const activeCircles = useMemo(
    () => circles.filter((circle) => circle.status === 'active'),
    [circles],
  );

  const userIsOrganizer = useMemo(
    () => activeCircles.some((circle) => isOrganizer(circle.userRole)),
    [activeCircles],
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

  const firstCircle = activeCircles[0];
  const firstDetail = firstCircle ? circleDetails[firstCircle.id] : null;
  const recipientName = getCurrentRecipientName(firstDetail);

  const loadDashboard = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) {
        setError('Your session is missing an access token. Sign in again.');
        setSummary(null);
        setCircles([]);
        setCircleDetails({});
        setCircleSchedules({});
        setLoading(false);
        return;
      }

      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const [nextSummary, nextCircles] = await Promise.all([
          getDashboardSummary(token),
          getCircles(token),
        ]);
        const nextActiveCircles = nextCircles.filter(
          (circle) => circle.status === 'active',
        );
        const toLoad = nextActiveCircles.slice(0, DETAIL_LIMIT);

        const [details, schedules] = await Promise.all([
          Promise.all(
            toLoad.map((c) => getCircleDetail(token, c.id).catch(() => null)),
          ),
          Promise.all(
            toLoad.map((c) =>
              getCircleSchedule(token, c.id).catch(() => null),
            ),
          ),
        ]);

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
        });

        setSummary(nextSummary);
        setCircles(nextCircles);
        setCircleDetails(detailsMap);
        setCircleSchedules(schedulesMap);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Unable to load your dashboard.',
        );
        setSummary(null);
        setCircles([]);
        setCircleDetails({});
        setCircleSchedules({});
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadDashboard({ silent: true });
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
              {getGreeting()}, {firstName} 👋
            </Text>
            <View
              style={[
                styles.roleBadge,
                userIsOrganizer ? styles.organizerBadge : styles.memberBadge,
              ]}
            >
              <Text style={styles.roleBadgeText}>
                {userIsOrganizer ? 'Organizer' : 'Member'}
              </Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            {userIsOrganizer
              ? `Here's what's happening with the ${t('circles').toLowerCase()} you manage`
              : `Here's what's happening with your ${t('circles').toLowerCase()}`}
          </Text>
        </View>

        {activeCircles.length > 0 ? (
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
              return (
                <Pressable
                  key={circle.id}
                  style={({ pressed }) => [
                    styles.carouselHeroCard,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => router.push(circleWorkspaceHref(circle.id))}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${circle.name}`}
                >
                  <Text style={styles.heroSub}>{circle.name}</Text>
                  <Text style={styles.heroLabel}>In the Pot</Text>
                  <Text style={styles.heroAmount}>{formatMoney(potTotal)}</Text>
                  <View style={styles.heroFooterRow}>
                    <Text style={styles.heroFooterText}>
                      Contribution: {formatMoney(circle.contributionAmount)}
                    </Text>
                    <Text style={styles.heroTapHint}>Tap to open</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>
              No active {t('circles').toLowerCase()}
            </Text>
            <Text style={styles.heroSub}>
              Create or join a {t('circle').toLowerCase()} to get started
            </Text>
          </View>
        )}

        {personalDueCount > 0 && firstDueCircle ? (
          <View style={[styles.payDueCard, { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={[styles.actionCardHeader, { marginBottom: 4 }]}>
                <FontAwesome name="exclamation-circle" size={18} color={colors.primaryDark} />
                <Text style={styles.payDueTitle}>Contribution Due</Text>
              </View>
              <Text style={[styles.payDueSubtitle, { marginTop: 0 }]}>
                Next payment for {firstDueCircle.name} is ready.
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
              accessibilityLabel="Pay your part"
            >
              <Text style={styles.payDueButtonText}>Pay Now</Text>
              <FontAwesome name="arrow-right" size={12} color="#ffffff" />
            </Pressable>
          </View>
        ) : null}

        {reviewCount > 0 && firstReviewTarget ? (
          <View style={[styles.reviewCard, { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={[styles.actionCardHeader, { marginBottom: 4 }]}>
                <FontAwesome name="check-circle" size={18} color="#B45309" />
                <Text style={styles.reviewTitle}>Payments to review</Text>
              </View>
              <Text style={[styles.reviewSubtitle, { marginTop: 0 }]}>
                {reviewCount === 1
                  ? `1 payment waiting in ${firstReviewTarget.circle.name}`
                  : `${reviewCount} payments waiting for review`}
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
              accessibilityLabel="Review payments"
            >
              <Text style={styles.reviewButtonText}>Review</Text>
              <FontAwesome name="arrow-right" size={12} color="#ffffff" />
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>Dashboard data unavailable</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
            <Pressable
              style={styles.retryButton}
              onPress={() => void loadDashboard()}
              accessibilityRole="button"
              accessibilityLabel="Retry dashboard"
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <StatCard
            icon="clock-o"
            value={getNextPayoutLabel(summary?.upcomingPayout?.payoutDate)}
            label={recipientName ? `${recipientName} receives` : 'Next Payout'}
            color={colors.success}
          />
          <StatCard
            icon="users"
            value={String(summary?.activeCircles ?? activeCircles.length)}
            label={`Active ${t('circles')}`}
            color={colors.primary}
            detail={
              userIsOrganizer
                ? `You manage these ${t('circles').toLowerCase()}`
                : undefined
            }
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active {t('circles')}</Text>
            <Pressable
              onPress={() => router.push(myCirclesHref)}
              accessibilityRole="button"
              accessibilityLabel={`See all active ${t('circles').toLowerCase()}`}
            >
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>

          {activeCircles.length > 0 ? (
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
                const formattedDueDate = formatShortDueDate(
                  detail?.currentRoundSummary?.dueDate,
                );
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
                    accessibilityLabel={`Open ${circle.name}`}
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
                      {capitalize(circle.frequency)} • Round{' '}
                      {formatRound(currentRoundNumber)}
                      {totalRounds ? ` of ${totalRounds}` : ''}
                    </Text>
                    {isViewerRecipient ? (
                      <View style={{ alignItems: 'flex-start' }}>
                        <Text
                          style={[
                            styles.recipient,
                            { color: colors.success, fontWeight: '900' },
                          ]}
                        >
                          ✨ It's your turn this round
                        </Text>
                        {formattedDueDate ? (
                          <Text
                            style={[
                              styles.circleMeta,
                              { marginTop: 2, color: colors.success },
                            ]}
                          >
                            Payout: {formattedDueDate}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <View style={{ alignItems: 'flex-start' }}>
                        <Text style={styles.recipient}>
                          Next: {circleRecipientName ?? 'Unavailable'}
                        </Text>
                        {formattedDueDate ? (
                          <Text style={[styles.circleMeta, { marginTop: 2 }]}>
                            Payout: {formattedDueDate}
                          </Text>
                        ) : null}
                      </View>
                    )}
                    {circleIsOrganizer ? (
                      <Text style={styles.manageLabel}>Manage as Organizer</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <FontAwesome name="users" size={28} color={colors.muted} />
              <Text style={styles.emptyTitle}>No active circles yet</Text>
              <Text style={styles.emptyText}>
                Create your first savings circle to get started.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.pressed,
            ]}
            onPress={() => router.push(createCircleHref)}
            accessibilityRole="button"
            accessibilityLabel="Create new circle"
          >
            <FontAwesome name="plus" size={20} color="#ffffff" />
            <Text style={styles.actionText}>New Circle</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.secondaryAction,
              pressed && styles.pressed,
            ]}
            onPress={() => router.push('/(tabs)/activity')}
            accessibilityRole="button"
            accessibilityLabel="Open recent activity"
          >
            <FontAwesome name="list" size={20} color={colors.primary} />
            <Text style={styles.secondaryActionText}>Recent Activity</Text>
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
    const viewerMemberId =
      schedule.roundWorkspace?.viewerMemberId ??
      detail?.members.find((member) => member.userId === userId)?.id ??
      null;

    const currentRound =
      schedule.roundWorkspace?.currentRoundNumber ?? schedule.currentRound;

    const contributionsForRound = schedule.contributions.filter(
      (contribution) => contribution.round === currentRound,
    );

    if (viewerMemberId) {
      const viewerContribution = contributionsForRound.find(
        (contribution) => contribution.memberId === viewerMemberId,
      );
      const status = String(viewerContribution?.status ?? '')
        .trim()
        .toLowerCase();

      if (!viewerContribution || PERSONAL_DUE_STATUSES.has(status)) {
        personalDueCircles.push(circle);
      }
    }

    const canReview =
      schedule.roundWorkspace?.viewerPermissions?.canApproveContributions ===
        true || isOrganizer(circle.userRole);

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
}: {
  icon: IconName;
  value: string;
  label: string;
  color: string;
  detail?: string;
}) {
  return (
    <View style={styles.statCard}>
      <FontAwesome name={icon} size={28} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {detail ? <Text style={styles.statDetail}>{detail}</Text> : null}
    </View>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getNextPayoutLabel(payoutDate?: string) {
  if (!payoutDate) {
    return '—';
  }

  const payoutTime = Date.parse(payoutDate);
  if (!Number.isFinite(payoutTime)) {
    return '—';
  }

  const days = Math.max(
    0,
    Math.ceil((payoutTime - Date.now()) / (24 * 60 * 60 * 1000)),
  );
  return days === 0 ? 'Today' : `In ${days} ${days === 1 ? 'day' : 'days'}`;
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

function formatShortDueDate(dueDateStr?: string | null) {
  if (!dueDateStr) {
    return '';
  }

  const parts = dueDateStr.split('-');
  if (parts.length >= 3) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (m >= 1 && m <= 12 && !Number.isNaN(d)) {
      return `${months[m - 1]} ${d}`;
    }
  }

  return dueDateStr;
}

function formatProgress(progress?: number) {
  return typeof progress === 'number' && Number.isFinite(progress)
    ? `${Math.max(0, Math.min(100, Math.round(progress)))}%`
    : '—';
}

function formatRound(round?: number) {
  return typeof round === 'number' && Number.isFinite(round) ? round : '—';
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
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
    backgroundColor: colors.success,
  },
  memberBadge: {
    backgroundColor: '#3B82F6',
  },
  roleBadgeText: {
    color: '#ffffff',
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
    alignItems: 'center',
    gap: 6,
  },
  heroFooterText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  heroTapHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
  },
  heroLabel: {
    color: '#E0D4FF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  heroAmount: {
    color: '#ffffff',
    fontSize: 48,
    fontWeight: '900',
    marginVertical: 8,
  },
  heroSub: {
    color: '#C4B5FD',
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
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  reviewCard: {
    backgroundColor: colors.warningSoft,
    borderColor: '#FCD34D',
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18,
  },
  reviewTitle: {
    color: '#92400E',
    fontSize: 17,
    fontWeight: '900',
  },
  reviewSubtitle: {
    color: '#78350F',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  reviewButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#D97706',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  reviewButtonText: {
    color: '#ffffff',
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
    color: '#ffffff',
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
