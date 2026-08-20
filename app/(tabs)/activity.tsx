import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { getActivity, getCircleDetail } from '@/lib/api';
import { shouldLoadActivity } from '@/lib/activityAuthGate';
import {
  shouldShowActivityListError,
  shouldUseSilentActivityRefresh,
} from '@/lib/activityPaint';
import { useAuthSession } from '@/lib/authContext';
import { logClientError } from '@/lib/errorLogging';
import {
  createRequestGeneration,
  shouldReplaceFinancialStateOnError,
  shouldShowBlockingLoadState,
} from '@/lib/requestGeneration';
import { useEntitlements } from '@/lib/entitlementsContext';
import { activityEventSentence } from '@/lib/i18n/financial-presentation';
import { formatCurrency, formatDateTime } from '@/lib/i18n/formatters';
import { circleWorkspaceHref } from '@/lib/navigation';
import { colors, radii, spacing } from '@/lib/theme';
import type { BackendActivity } from '@/lib/types';

type ActivityFilter = 'all' | 'contributions' | 'payouts';

export default function ActivityScreen() {
  const { t } = useTranslation(['activity', 'financialErrors']);
  const { session, status } = useAuthSession();
  const { hasCapability } = useEntitlements();
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>('all');
  const [entries, setEntries] = useState<BackendActivity[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(createRequestGeneration());
  const hasLastKnownStateRef = useRef(false);
  const token = session?.session.token;
  // Entitlements only — never session.user.role for Premium unlock.
  const hasFullActivityHistory = hasCapability('fullActivityHistory');

  const loadActivity = useCallback(
    async (options?: { silent?: boolean; revalidate?: boolean }) => {
      const generation = requestGeneration.current.next();
      const accessToken = String(token ?? '').trim();
      // Logout / unauthenticated transition: quiet no-op (not a user-facing error).
      if (!shouldLoadActivity({ status, token: accessToken })) {
        if (requestGeneration.current.isCurrent(generation)) {
          setLoading(false);
          setRefreshing(false);
        }
        return;
      }

      const firstPaint = !hasLastKnownStateRef.current;
      if (!options?.silent && firstPaint) {
        setLoading(true);
      }
      if (requestGeneration.current.isCurrent(generation)) {
        setError(null);
      }

      try {
        const getOptions = options?.revalidate ? { revalidate: true } : undefined;
        const response = await getActivity(accessToken, getOptions);
        if (!requestGeneration.current.isCurrent(generation)) {
          return;
        }

        hasLastKnownStateRef.current = true;
        setEntries(response.items);
        setLoading(false);

        const circleIds = Array.from(
          new Set(response.items.map((entry) => entry.circleId).filter(Boolean)),
        );
        const details = await Promise.all(
          circleIds.map((id) =>
            getCircleDetail(accessToken, id, getOptions).catch(() => null),
          ),
        );
        if (!requestGeneration.current.isCurrent(generation)) {
          return;
        }

        const newMemberMap: Record<string, string> = {};
        for (const detail of details) {
          if (detail && detail.members) {
            for (const member of detail.members) {
              const name =
                member.full_name ||
                member.name ||
                t('activity:unknownMember');
              newMemberMap[member.id] = name;
              if (member.userId) {
                newMemberMap[member.userId] = name;
              }
            }
          }
        }
        setMemberMap(newMemberMap);
      } catch (loadError) {
        logClientError('Unable to load activity', loadError);
        if (!requestGeneration.current.isCurrent(generation)) {
          return;
        }
        setError(t('financialErrors:loadActivity'));
        if (shouldReplaceFinancialStateOnError(hasLastKnownStateRef.current)) {
          setEntries([]);
          setMemberMap({});
        }
      } finally {
        if (requestGeneration.current.isCurrent(generation)) {
          setLoading(false);
        }
      }
    },
    [status, token, t],
  );

  useFocusEffect(
    useCallback(() => {
      void loadActivity({
        silent: shouldUseSilentActivityRefresh(hasLastKnownStateRef.current),
      });
    }, [loadActivity]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadActivity({ silent: true, revalidate: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadActivity]);

  let visibleEntries = entries.filter((entry) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'contributions') {
      return entry.type.includes('contribution');
    }
    return entry.type.includes('payout');
  });

  const hasMore = !hasFullActivityHistory && visibleEntries.length > 10;
  if (!hasFullActivityHistory) {
    visibleEntries = visibleEntries.slice(0, 10);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <FlatList
        data={visibleEntries}
        keyExtractor={(item, index) =>
          item.id || `${item.type || 'activity'}:${item.createdAt || index}`
        }
        contentContainerStyle={[styles.content, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.title}>{t('activity:title')}</Text>
              <Text style={styles.subtitle}>{t('activity:subtitle')}</Text>
            </View>

            <View style={styles.filterRow}>
              <FilterPill
                label={t('activity:filters.all')}
                active={activeFilter === 'all'}
                onPress={() => setActiveFilter('all')}
              />
              <FilterPill
                label={t('activity:filters.contributions')}
                active={activeFilter === 'contributions'}
                onPress={() => setActiveFilter('contributions')}
              />
              <FilterPill
                label={t('activity:filters.payouts')}
                active={activeFilter === 'payouts'}
                onPress={() => setActiveFilter('payouts')}
              />
            </View>

            {shouldShowActivityListError({
              error,
              entryCount: entries.length,
            }) ? (
              <View style={styles.inlineErrorBanner}>
                <FontAwesome name="warning" size={14} color={colors.warning} />
                <Text style={styles.inlineErrorText}>{error}</Text>
                <Pressable
                  onPress={() =>
                    void loadActivity({ silent: true, revalidate: true })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={t('activity:retryA11y')}
                >
                  <Text style={styles.inlineErrorRetry}>
                    {t('activity:retry')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            
            {visibleEntries.length > 0 && (
              <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, marginTop: 16, paddingTop: 8 }} />
            )}
          </>
        }
        ListEmptyComponent={
          shouldShowBlockingLoadState(
            loading && !refreshing,
            hasLastKnownStateRef.current || entries.length > 0,
          ) ? (
            <View style={styles.statusCard}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.statusText}>{t('activity:loading')}</Text>
            </View>
          ) : error ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>
                {t('activity:unavailableTitle')}
              </Text>
              <Text style={styles.statusText}>{error}</Text>
              <Pressable
                style={styles.retryButton}
                onPress={() =>
                  void loadActivity({
                    silent: shouldUseSilentActivityRefresh(
                      hasLastKnownStateRef.current,
                    ),
                    revalidate: true,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={t('activity:retryA11y')}
              >
                <Text style={styles.retryButtonText}>{t('activity:retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <FontAwesome name="clock-o" size={60} color={colors.muted} />
              <Text style={styles.emptyTitle}>{t('activity:emptyTitle')}</Text>
              <Text style={styles.emptyText}>
                {t('activity:emptyBody')}
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <View style={{ backgroundColor: colors.card, paddingHorizontal: 16 }}>
            <ActivityCard entry={item} memberMap={memberMap} />
            {index < visibleEntries.length - 1 ? (
              <View style={{ height: 1, backgroundColor: colors.surfaceMuted, marginLeft: 60 }} />
            ) : null}
          </View>
        )}
        ListFooterComponent={
          visibleEntries.length > 0 ? (
            <View style={{ backgroundColor: colors.card, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, overflow: 'hidden', paddingBottom: 8 }}>
              {hasMore ? (
                <View style={{ padding: 16, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.surfaceMuted, alignItems: 'center' }}>
                  <FontAwesome name="lock" size={24} color={colors.primary} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textStrong, textAlign: 'center' }}>
                    {t('activity:unlockTitle')}
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 4, marginBottom: 12 }}>
                    {t('activity:unlockBody')}
                  </Text>
                  <Pressable
                    style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, width: '100%', alignItems: 'center' }}
                    onPress={() => router.push('/subscription')}
                  >
                    <Text style={{ color: colors.onColor, fontSize: 15, fontWeight: '800' }}>
                      {t('activity:upgrade')}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={{ padding: 16, borderTopWidth: 1, borderTopColor: colors.surfaceMuted, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                  onPress={() =>
                    Alert.alert(
                      t('activity:exportUnavailableTitle'),
                      t('activity:exportUnavailableBody'),
                    )
                  }
                >
                  <FontAwesome name="download" size={14} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '800' }}>
                    {t('activity:export')}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function ActivityCard({ entry, memberMap }: { entry: BackendActivity; memberMap: Record<string, string> }) {
  const { t, i18n } = useTranslation('activity');
  const language = i18n.resolvedLanguage || i18n.language;
  const isContribution = entry.type.includes('contribution');
  const isPayout = entry.type.includes('payout');
  
  let color = colors.primary;
  let iconName: React.ComponentProps<typeof FontAwesome>['name'] = 'book';
  let prefix = '';

  if (isContribution) {
    color = colors.muted;
    iconName = 'arrow-up';
    prefix = '-';
  } else if (isPayout) {
    color = colors.success;
    iconName = 'arrow-down';
    prefix = '+';
  }

  const memberName = getResolvedMemberName(entry, memberMap);
  const sentence = activityEventSentence(entry, t, {
    name: memberName || undefined,
    round: entry.round,
  });

  return (
    <Pressable
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
        pressed && { opacity: 0.7 },
      ]}
      onPress={() => {
        if (entry.circleId) {
          router.push(circleWorkspaceHref(entry.circleId));
        }
      }}
      disabled={!entry.circleId}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${color}15`, justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
        <FontAwesome name={iconName} size={18} color={color} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textStrong }}>
          {sentence}
        </Text>
        <Text style={{ fontSize: 14, color: colors.muted, marginTop: 2 }}>
          {entry.round
            ? t('activity:meta', {
                circle: entry.circleName,
                round: entry.round,
              })
            : entry.circleName}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
        {entry.amount !== null ? (
          <Text style={{ fontSize: 16, fontWeight: '900', color }}>
            {prefix}
            {formatCurrency(entry.amount, language, 'USD', 2)}
          </Text>
        ) : null}
        <Text style={{ fontSize: 12, color: colors.subtle, marginTop: 2, fontWeight: '600' }}>
          {formatDateTime(entry.createdAt, language)}
        </Text>
      </View>
    </Pressable>
  );
}

function getResolvedMemberName(entry: BackendActivity, memberMap: Record<string, string>): string {
  const metadata = (entry.metadata || {}) as any;
  const rawMemberId = String(
    entry.memberId ||
    metadata.member_id ||
    metadata.memberId ||
    metadata.recipient_member_id ||
    metadata.recipientMemberId ||
    ''
  ).trim();

  const metadataName = String(
    metadata.member_name || 
    metadata.memberName || 
    metadata.recipient_name || 
    metadata.recipientName || 
    ''
  ).trim();

  if (metadataName) return metadataName;
  if (rawMemberId && memberMap[rawMemberId]) return memberMap[rawMemberId];
  return '';
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.filterPill, active && styles.activeFilterPill]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.filterText, active && styles.activeFilterText]}>
        {label}
      </Text>
    </Pressable>
  );
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
  header: {
    marginBottom: 24,
  },
  title: {
    color: colors.textStrong,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 4,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  inlineErrorBanner: {
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
    borderRadius: 14,
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
  filterPill: {
    backgroundColor: colors.card,
    borderColor: colors.primaryBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  activeFilterPill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  activeFilterText: {
    color: colors.onColor,
  },
  statusCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.card,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  statusText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 48,
  },
  retryButtonText: {
    color: colors.onColor,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 24,
  },
  emptyText: {
    color: colors.muted,
    lineHeight: 22,
    marginTop: 12,
    textAlign: 'center',
  },
  feed: {
    gap: 12,
  },
  activityCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 18,
  },
  iconContainer: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginRight: 16,
    width: 44,
  },
  details: {
    flex: 1,
  },
  description: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  activityMeta: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  message: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
  date: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 5,
  },
  amount: {
    fontSize: 18,
    fontWeight: '900',
    marginLeft: 12,
  },
  exportButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginTop: 30,
    minHeight: 54,
    justifyContent: 'center',
  },
  exportButtonText: {
    color: colors.primary,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
});
