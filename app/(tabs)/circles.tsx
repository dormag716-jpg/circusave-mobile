import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  deleteAllSetupDrafts,
  deleteCircle,
  getCircles,
  getCircleDetail,
  type BackendCircleDetail,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { buildOpenCircleCapacity } from '@/lib/circleCapacity';
import {
  circleWorkspaceHref,
  completedCirclesHref,
  createCircleHref,
} from '@/lib/navigation';
import { isOrganizer } from '@/lib/permissions';
import { colors, spacing } from '@/lib/theme';
import type { BackendCircleSummary } from '@/lib/types';
import { isSetupCircleStatus } from '@/lib/circleSummary';

type ListItem =
  | { type: 'header'; id: string; title: string; count: number }
  | { type: 'circle'; id: string; circle: BackendCircleSummary };

export default function CirclesScreen() {
  const { session } = useAuthSession();
  const [circles, setCircles] = useState<BackendCircleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [howItWorksExpanded, setHowItWorksExpanded] = useState(false);
  const [purgingSetup, setPurgingSetup] = useState(false);
  const [circleDetails, setCircleDetails] = useState<
    Record<string, BackendCircleDetail>
  >({});
  const token = session?.session.token;
  const userId = session?.user?.id;

  const activeCircles = useMemo(
    () => circles.filter((circle) => circle.status === 'active'),
    [circles],
  );
  const setupCircles = useMemo(
    () => circles.filter((circle) => isSetupCircleStatus(circle.status)),
    [circles],
  );
  const hasAnyCircles = activeCircles.length > 0 || setupCircles.length > 0;
  const openCap = useMemo(
    () =>
      buildOpenCircleCapacity({
        circles,
        organizerRoleOrTier: session?.user?.role,
        organizerOwnedOnly: true,
      }),
    [circles, session?.user?.role],
  );

  const listData = useMemo(() => {
    const items: ListItem[] = [];
    if (!hasAnyCircles) {
      return items;
    }

    if (setupCircles.length > 0) {
      items.push({
        type: 'header',
        id: 'header-setup',
        title: 'In setup',
        count: setupCircles.length,
      });
      for (const circle of setupCircles) {
        items.push({ type: 'circle', id: circle.id, circle });
      }
    }

    if (activeCircles.length > 0) {
      items.push({
        type: 'header',
        id: 'header-active',
        title: 'Active Circles',
        count: activeCircles.length,
      });
      for (const circle of activeCircles) {
        items.push({ type: 'circle', id: circle.id, circle });
      }
    }

    return items;
  }, [activeCircles, setupCircles, hasAnyCircles]);

  const loadCircles = useCallback(async () => {
    if (!token) {
      setError('Your session is missing an access token. Sign in again.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const summaries = await getCircles(token);
      setCircles(summaries);

      const detailTargets = summaries.filter(
        (c) => c.status === 'active' || isSetupCircleStatus(c.status),
      );
      const details = await Promise.all(
        detailTargets.map((c) => getCircleDetail(token, c.id).catch(() => null)),
      );

      const detailsMap: Record<string, BackendCircleDetail> = {};
      detailTargets.forEach((circle, index) => {
        const detail = details[index];
        if (detail) {
          detailsMap[circle.id] = detail;
        }
      });
      setCircleDetails(detailsMap);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load your circles.',
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void loadCircles();
    }, [loadCircles]),
  );

  const organizerSetupCircles = useMemo(
    () =>
      setupCircles.filter(
        (c) => String(c.userRole || '').toLowerCase() === 'organizer',
      ),
    [setupCircles],
  );

  function confirmPurgeAllSetup() {
    if (!token || organizerSetupCircles.length === 0 || purgingSetup) {
      return;
    }
    Alert.alert(
      'Delete all setup circles?',
      `This permanently removes ${organizerSetupCircles.length} setup/draft circle${
        organizerSetupCircles.length === 1 ? '' : 's'
      } you organize. Active and completed circles are not affected. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: () => void purgeAllSetup(),
        },
      ],
    );
  }

  async function purgeAllSetup() {
    if (!token) return;
    setPurgingSetup(true);
    try {
      const result = await deleteAllSetupDrafts(token);
      await loadCircles();
      Alert.alert(
        'Setup circles removed',
        result.deletedCount > 0
          ? `Permanently deleted ${result.deletedCount} setup circle${
              result.deletedCount === 1 ? '' : 's'
            }.`
          : 'No deletable setup circles were found (they may have already been removed).',
      );
    } catch (err) {
      Alert.alert(
        'Unable to delete setup circles',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setPurgingSetup(false);
    }
  }

  async function confirmDeleteOneSetup(circle: BackendCircleSummary) {
    if (!token) return;
    Alert.alert(
      'Delete this setup circle?',
      `“${circle.name}” will be permanently deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCircle(token, circle.id);
              await loadCircles();
            } catch (err) {
              Alert.alert(
                'Unable to delete',
                err instanceof Error ? err.message : 'Please try again.',
              );
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>My Circles</Text>
                <Text style={styles.subtitle}>
                  Your savings groups — setup and active.
                </Text>
                {!openCap.unlimited ? (
                  <Text style={styles.freePlanHint}>
                    Free plan: 1 open circle at a time
                    {openCap.usedOpenCircles > 0
                      ? ` · ${openCap.usedOpenCircles} open`
                      : ''}
                  </Text>
                ) : null}
                {organizerSetupCircles.length > 0 ? (
                  <Pressable
                    style={styles.purgeSetupBtn}
                    onPress={confirmPurgeAllSetup}
                    disabled={purgingSetup}
                    accessibilityRole="button"
                    accessibilityLabel="Delete all setup circles permanently"
                  >
                    {purgingSetup ? (
                      <ActivityIndicator color={colors.danger} size="small" />
                    ) : (
                      <Text style={styles.purgeSetupBtnText}>
                        Delete all setup ({organizerSetupCircles.length})
                      </Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                style={({ pressed }) => [{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: `${colors.primary}12`, borderRadius: 12,
                  paddingHorizontal: 12, paddingVertical: 8, marginTop: 4,
                }, pressed && { opacity: 0.7 }]}
                onPress={() => router.push('/join-circle')}
                accessibilityRole="button"
                accessibilityLabel="Join circle by code"
              >
                <FontAwesome name="key" size={13} color={colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary }}>Join by Code</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerCard}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.centerText}>Loading circles…</Text>
            </View>
          ) : error ? (
            <View style={styles.centerCard}>
              <FontAwesome name="warning" size={32} color={colors.warning} />
              <Text style={styles.emptyTitle}>Unable to load circles</Text>
              <Text style={styles.emptySubtitle}>{error}</Text>
              <Pressable
                style={styles.retryButton}
                onPress={() => void loadCircles()}
                accessibilityRole="button"
                accessibilityLabel="Retry loading circles"
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <EmptyState />
          )
        }
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{item.title}</Text>
                <Text style={styles.sectionCount}>{item.count}</Text>
              </View>
            );
          }

          return (
            <CircleCard
              circle={item.circle}
              detail={circleDetails[item.circle.id]}
              userId={userId}
              onDeleteSetup={
                isSetupCircleStatus(item.circle.status) &&
                isOrganizer(item.circle.userRole)
                  ? () => void confirmDeleteOneSetup(item.circle)
                  : undefined
              }
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        ListFooterComponent={
          <View>
            <Pressable
              style={({ pressed }) => [
                styles.completedLink,
                pressed && styles.cardPressed,
              ]}
              onPress={() => router.push(completedCirclesHref)}
              accessibilityRole="button"
              accessibilityLabel="View completed circles"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.completedLinkTitle}>Completed circles</Text>
                <Text style={styles.completedLinkSubtitle}>
                  View finished groups and restart one if you want.
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={16} color={colors.muted} />
            </Pressable>

            <View style={styles.howItWorksContainer}>
              <Pressable
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onPress={() => setHowItWorksExpanded(!howItWorksExpanded)}
                accessibilityRole="button"
              >
                <Text style={[styles.howItWorksTitle, { marginBottom: 0 }]}>
                  How joining works
                </Text>
                <FontAwesome
                  name={howItWorksExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.text}
                />
              </Pressable>

              {howItWorksExpanded ? (
                <View style={{ marginTop: 24 }}>
                  <View style={styles.stepRow}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>1</Text>
                    </View>
                    <View style={styles.stepContent}>
                      <Text style={styles.stepTitle}>
                        Get the invite link from the organizer
                      </Text>
                      <Text style={styles.stepDescription}>
                        The organizer shares a unique link to join their circle.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stepRow}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>2</Text>
                    </View>
                    <View style={styles.stepContent}>
                      <Text style={styles.stepTitle}>Open the link & Log In</Text>
                      <Text style={styles.stepDescription}>
                        Tap the link and log into your account (or sign up).
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stepRow}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>3</Text>
                    </View>
                    <View style={styles.stepContent}>
                      <Text style={styles.stepTitle}>Tap Join</Text>
                      <Text style={styles.stepDescription}>
                        You will instantly be added to the circle roster.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stepRow}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>4</Text>
                    </View>
                    <View style={styles.stepContent}>
                      <Text style={styles.stepTitle}>Access your workspace</Text>
                      <Text style={styles.stepDescription}>
                        Track contributions, see payouts, and know when it's
                        your turn!
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        }
      />

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => {
          if (openCap.atCapacity && openCap.primaryOpenCircleId) {
            router.push(circleWorkspaceHref(openCap.primaryOpenCircleId));
            return;
          }
          if (openCap.atCapacity) {
            router.push(createCircleHref);
            return;
          }
          router.push(createCircleHref);
        }}
        accessibilityRole="button"
        accessibilityLabel={
          openCap.atCapacity
            ? 'Continue your open circle'
            : 'Create circle'
        }
      >
        <FontAwesome
          name={openCap.atCapacity ? 'arrow-right' : 'plus'}
          size={28}
          color="#ffffff"
        />
      </Pressable>
    </SafeAreaView>
  );
}

function CircleCard({
  circle,
  detail,
  userId,
  onDeleteSetup,
}: {
  circle: BackendCircleSummary;
  detail?: BackendCircleDetail;
  userId?: string;
  onDeleteSetup?: () => void;
}) {
  const userIsOrganizer = isOrganizer(circle.userRole);
  const isSetup = isSetupCircleStatus(circle.status);
  const progress = circle.currentRoundProgress?.percentConfirmed ?? 0;

  const totalRounds = detail?.members?.length ?? circle.memberCount;
  const viewerPosition =
    detail && userId ? getViewerPosition(detail, userId) : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push(circleWorkspaceHref(circle.id))}
      accessibilityRole="button"
      accessibilityLabel={
        isSetup ? `Continue setup for ${circle.name}` : `Open ${circle.name}`
      }
    >
      <View style={styles.cardHeader}>
        <View style={styles.circleInfo}>
          <View style={styles.circleTitleRow}>
            <Text style={styles.circleName}>{circle.name}</Text>
            {isSetup ? (
              <View style={styles.setupTag}>
                <Text style={styles.setupTagText}>Setup</Text>
              </View>
            ) : null}
            {userIsOrganizer ? (
              <View style={styles.organizerTag}>
                <Text style={styles.organizerTagText}>Organizer</Text>
              </View>
            ) : null}
          </View>
          {isSetup ? (
            <>
              <Text style={styles.circleMeta}>
                {capitalize(circle.status)} • {circle.memberCount}{' '}
                {circle.memberCount === 1 ? 'member' : 'members'} •{' '}
                {formatMoney(circle.contributionAmount)}
              </Text>
              {onDeleteSetup ? (
                <Pressable
                  style={styles.cardDeleteBtn}
                  onPress={onDeleteSetup}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete setup circle ${circle.name}`}
                >
                  <FontAwesome name="trash-o" size={14} color={colors.danger} />
                  <Text style={styles.cardDeleteBtnText}>Delete permanently</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.circleMeta}>
                {capitalize(circle.frequency)} • Round {circle.currentRound} of{' '}
                {totalRounds}
              </Text>
              {viewerPosition ? (
                <Text
                  style={{
                    color: colors.success,
                    fontSize: 13,
                    fontWeight: '800',
                    marginTop: 4,
                  }}
                >
                  Your position: #{viewerPosition}
                </Text>
              ) : null}
            </>
          )}
        </View>
        {!isSetup ? (
          <View style={{ alignItems: 'center' }}>
            <View style={styles.progressRing}>
              <Text style={styles.progressText}>{progress}%</Text>
            </View>
            <Text
              style={{
                color: colors.muted,
                fontSize: 11,
                fontWeight: '800',
                marginTop: 6,
              }}
            >
              {circle.currentRoundProgress?.confirmedCount ?? 0} of {totalRounds}{' '}
              confirmed
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.detail}>
          <Text style={styles.detailLabel}>Contribution</Text>
          <Text style={styles.detailValue}>
            {formatMoney(circle.contributionAmount)}
          </Text>
        </View>
        <View style={styles.detail}>
          <Text style={styles.detailLabel}>Members</Text>
          <Text style={styles.detailValue}>{circle.memberCount}</Text>
        </View>
      </View>

      <View style={styles.openButton}>
        <Text style={styles.openButtonText}>
          {isSetup ? 'Continue setup' : 'Open Circle'}
        </Text>
        <FontAwesome name="arrow-right" size={18} color="#ffffff" />
      </View>
    </Pressable>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <FontAwesome name="users" size={80} color={colors.muted} />
      <Text style={styles.emptyTitle}>No circles yet</Text>
      <Text style={styles.emptySubtitle}>
        Create a savings group or join one with an invite link.
      </Text>
    </View>
  );
}

function getViewerPosition(detail: BackendCircleDetail, userId: string) {
  const ordered = [...detail.members].sort((a, b) => {
    const posA = detail.turnOrder.indexOf(a.id);
    const posB = detail.turnOrder.indexOf(b.id);
    const nA = posA === -1 ? 9999 : posA;
    const nB = posB === -1 ? 9999 : posB;
    return nA - nB;
  });
  const viewer = ordered.find((m) => m.userId === userId);
  return viewer ? ordered.indexOf(viewer) + 1 : null;
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function capitalize(value: string) {
  if (value === 'biweekly') return 'Bi-weekly';
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 120,
    paddingHorizontal: spacing.screenX,
    paddingTop: 20,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    color: colors.textStrong,
    fontSize: 34,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 4,
  },
  freePlanHint: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  purgeSetupBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  purgeSetupBtnText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  cardDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  cardDeleteBtnText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    marginTop: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  sectionCount: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
  },
  cardPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.985 }],
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  circleInfo: {
    flex: 1,
    paddingRight: 16,
  },
  circleTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  circleName: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  organizerTag: {
    backgroundColor: colors.success,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  organizerTagText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  setupTag: {
    backgroundColor: colors.warningSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  setupTagText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '900',
  },
  circleMeta: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 4,
  },
  progressRing: {
    alignItems: 'center',
    borderColor: colors.primary,
    borderRadius: 39,
    borderWidth: 7,
    height: 78,
    justifyContent: 'center',
    width: 78,
  },
  progressText: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 40,
    marginTop: 28,
  },
  detail: {
    flex: 1,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  detailValue: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 4,
  },
  openButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 28,
    minHeight: 58,
  },
  openButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
  centerCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
  },
  centerText: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 12,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  fab: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 34,
    bottom: 24,
    elevation: 8,
    height: 68,
    justifyContent: 'center',
    position: 'absolute',
    right: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    width: 68,
  },
  fabPressed: {
    transform: [{ scale: 0.95 }],
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 32,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: colors.muted,
    fontSize: 17,
    marginTop: 12,
    textAlign: 'center',
  },
  completedLink: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    padding: 18,
  },
  completedLinkTitle: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: '900',
  },
  completedLinkSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  howItWorksContainer: {
    marginTop: 24,
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  howItWorksTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textStrong,
    marginBottom: 20,
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepNumberText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textStrong,
  },
  stepDescription: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 20,
  },
});
