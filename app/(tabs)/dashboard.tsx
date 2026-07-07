import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getCircleDetail,
  getCircles,
  getDashboardSummary,
  type BackendCircleDetail,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { useMarket } from '@/lib/market';
import {
  circleWorkspaceHref,
  createCircleHref,
  myCirclesHref,
} from '@/lib/navigation';
import { isOrganizer } from '@/lib/permissions';
import { colors, radii, shadows, spacing } from '@/lib/theme';
import type { BackendCircleSummary, DashboardSummary } from '@/lib/types';

type IconName = ComponentProps<typeof FontAwesome>['name'];

export default function DashboardScreen() {
  const { session } = useAuthSession();
  const { t } = useMarket();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [circles, setCircles] = useState<BackendCircleSummary[]>([]);
  const [firstCircleDetail, setFirstCircleDetail] =
    useState<BackendCircleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const token = session?.session.token;
  const displayName = session?.user.name ?? 'Member';
  const firstName = displayName.split(' ')[0] || 'Member';
  const activeCircles = circles.filter((circle) => circle.status === 'active');
  const firstCircle = activeCircles[0];
  const userIsOrganizer = isOrganizer(firstCircle?.userRole);
  const progress = firstCircle?.currentRoundProgress?.percentConfirmed;
  const currentRoundNumber = firstCircle?.currentRound;
  const recipientName = getCurrentRecipientName(firstCircleDetail);
  const totalRounds = firstCircleDetail?.members?.length;
  const viewerMember = firstCircleDetail?.members.find((m) => m.userId === session?.user.id);
  const isViewerRecipient = viewerMember && firstCircleDetail?.currentRoundSummary?.recipientMemberId === viewerMember.id;

  const dueDateStr = firstCircleDetail?.currentRoundSummary?.dueDate;
  let formattedDueDate = '';
  if (dueDateStr) {
    // Try to parse YYYY-MM-DD
    const parts = dueDateStr.split('-');
    if (parts.length >= 3) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (m >= 1 && m <= 12 && !isNaN(d)) {
        formattedDueDate = `${months[m - 1]} ${d}`;
      } else {
        formattedDueDate = dueDateStr;
      }
    } else {
      formattedDueDate = dueDateStr; // Fallback to raw API string
    }
  }

  async function loadDashboard() {
    if (!token) {
      setError('Your session is missing an access token. Sign in again.');
      setSummary(null);
      setCircles([]);
      setFirstCircleDetail(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextCircles] = await Promise.all([
        getDashboardSummary(token),
        getCircles(token),
      ]);
      const nextActiveCircles = nextCircles.filter(
        (circle) => circle.status === 'active',
      );
      const nextFirstCircle = nextActiveCircles[0];

      setSummary(nextSummary);
      setCircles(nextCircles);
      setFirstCircleDetail(
        nextFirstCircle ? await getCircleDetail(token, nextFirstCircle.id) : null,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load your dashboard.',
      );
      setSummary(null);
      setCircles([]);
      setFirstCircleDetail(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, [token]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.greeting}>
          <View style={styles.welcomeRow}>
            <Text style={styles.welcome}>
              {getGreeting()}, {firstName} 👋
            </Text>
            <View
              style={[
                styles.roleBadge,
                userIsOrganizer
                  ? styles.organizerBadge
                  : styles.memberBadge,
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
            snapToInterval={Dimensions.get('window').width - spacing.screenX * 2 + 16}
            decelerationRate="fast"
            contentContainerStyle={styles.heroCarouselContainer}
          >
            {activeCircles.map((circle) => {
              const potTotal = circle.contributionAmount * circle.memberCount;
              return (
                <View key={circle.id} style={styles.carouselHeroCard}>
                  <Text style={styles.heroSub}>{circle.name}</Text>
                  <Text style={styles.heroLabel}>In the Pot</Text>
                  <Text style={styles.heroAmount}>
                    {formatMoney(potTotal)}
                  </Text>
                  <View style={styles.heroFooterRow}>
                    <Text style={styles.heroFooterText}>
                      Contribution: {formatMoney(circle.contributionAmount)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>No active {t('circles').toLowerCase()}</Text>
            <Text style={styles.heroSub}>Create or join a {t('circle').toLowerCase()} to get started</Text>
          </View>
        )}

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
            detail={userIsOrganizer ? `You manage these ${t('circles').toLowerCase()}` : undefined}
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

          {firstCircle ? (
            <Pressable
              style={({ pressed }) => [
                styles.circleCard,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push(circleWorkspaceHref(firstCircle.id))}
              accessibilityRole="button"
              accessibilityLabel={`Open ${firstCircle.name}`}
            >
              <View style={styles.circleHeader}>
                <Text style={styles.circleName}>{firstCircle.name}</Text>
                <View style={styles.progressRing}>
                  <Text style={styles.progressText}>
                    {formatProgress(progress)}
                  </Text>
                </View>
              </View>
              <Text style={styles.circleMeta}>
                {capitalize(firstCircle.frequency)} • Round{' '}
                {formatRound(currentRoundNumber)}{totalRounds ? ` of ${totalRounds}` : ''}
              </Text>
                {isViewerRecipient ? (
                  <View style={{ alignItems: 'flex-start' }}>
                    <Text style={[styles.recipient, { color: colors.success, fontWeight: '900' }]}>
                      ✨ It's your turn this round
                    </Text>
                    {formattedDueDate ? (
                      <Text style={[styles.circleMeta, { marginTop: 2, color: colors.success }]}>
                        Payout: {formattedDueDate}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <View style={{ alignItems: 'flex-start' }}>
                    <Text style={styles.recipient}>
                      Next: {recipientName ?? 'Unavailable'}
                    </Text>
                    {formattedDueDate ? (
                      <Text style={[styles.circleMeta, { marginTop: 2 }]}>
                        Payout: {formattedDueDate}
                      </Text>
                    ) : null}
                  </View>
                )}
              {userIsOrganizer ? (
                <Text style={styles.manageLabel}>Manage as Organizer</Text>
              ) : null}
            </Pressable>
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
    return 'â€”';
  }

  const payoutTime = Date.parse(payoutDate);
  if (!Number.isFinite(payoutTime)) {
    return 'â€”';
  }

  const days = Math.max(
    0,
    Math.ceil((payoutTime - Date.now()) / (24 * 60 * 60 * 1000)),
  );
  return days === 0 ? 'Today' : `In ${days} ${days === 1 ? 'day' : 'days'}`;
}

function getCurrentRecipientName(circle: BackendCircleDetail | null) {
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
    : 'â€”';
}

function formatRound(round?: number) {
  return typeof round === 'number' && Number.isFinite(round) ? round : 'â€”';
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
  },
  heroFooterText: {
    color: '#ffffff',
    fontSize: 15,
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
  heroLoader: {
    marginVertical: 17,
  },
  heroSub: {
    color: '#C4B5FD',
    fontSize: 15,
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


