import FontAwesome from '@expo/vector-icons/FontAwesome';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { router, useFocusEffect } from 'expo-router';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { getActivity, getCircleDetail } from '@/lib/api';
import { shouldLoadActivity } from '@/lib/activityAuthGate';
import {
  activityExportEntries,
  activityExportFilename,
  activityFetchLimit,
  activityNeedsMemberLookup,
  activityProvenanceKind,
  activityRequestParams,
  buildActivityCsv,
  buildActivityReportHtml,
  canBeginActivityExport,
  isActivityExportPartial,
  mergeActivityItems,
  normalizeActivityResponse,
  presentActivityFeed,
  resolveActivityMemberName,
  type ActivityTypeFilter,
} from '@/lib/activityFeed';
import {
  shouldShowActivityListError,
  shouldUseSilentActivityRefresh,
} from '@/lib/activityPaint';
import { useAuthSession } from '@/lib/authContext';
import { copyText } from '@/lib/clipboard';
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

type IconName = ComponentProps<typeof FontAwesome>['name'];

export default function ActivityScreen() {
  const { t, i18n } = useTranslation(['activity', 'financialErrors']);
  const language = i18n.resolvedLanguage || i18n.language;
  const { session, status } = useAuthSession();
  const { hasCapability } = useEntitlements();
  const [typeFilter, setTypeFilter] = useState<ActivityTypeFilter>('all');
  const [circleFilter, setCircleFilter] = useState<string | null>(null);
  const [entries, setEntries] = useState<BackendActivity[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [backendHasMore, setBackendHasMore] = useState<boolean | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [lastPageCount, setLastPageCount] = useState(0);
  const requestGeneration = useRef(createRequestGeneration());
  const hasLastKnownStateRef = useRef(false);
  const entriesRef = useRef<BackendActivity[]>([]);
  const memberMapRef = useRef<Record<string, string>>({});
  const nextCursorRef = useRef<string | null>(null);
  const token = session?.session.token;
  const hasFullActivityHistory = hasCapability('fullActivityHistory');
  const requestedLimit = activityFetchLimit(hasFullActivityHistory);
  entriesRef.current = entries;
  memberMapRef.current = memberMap;
  nextCursorRef.current = nextCursor;

  const loadMemberNames = useCallback(
    async (
      items: BackendActivity[],
      accessToken: string,
      generation: number,
      known: Record<string, string>,
      revalidate?: boolean,
    ) => {
      const circleIds = Array.from(
        new Set(
          items
            .filter((entry) => activityNeedsMemberLookup(entry, known))
            .map((entry) => String(entry.circleId || '').trim())
            .filter(Boolean),
        ),
      );
      if (circleIds.length === 0) return known;

      const getOptions = revalidate ? { revalidate: true } : undefined;
      const details = await Promise.all(
        circleIds.map((id) =>
          getCircleDetail(accessToken, id, getOptions).catch(() => null),
        ),
      );
      if (!requestGeneration.current.isCurrent(generation)) {
        return known;
      }

      const nextMap = { ...known };
      for (const detail of details) {
        if (!detail?.members) continue;
        for (const member of detail.members) {
          const name =
            member.full_name || member.name || t('activity:unknownMember');
          nextMap[member.id] = name;
          if (member.userId) {
            nextMap[member.userId] = name;
          }
        }
      }
      return nextMap;
    },
    [t],
  );

  const loadActivity = useCallback(
    async (options?: {
      silent?: boolean;
      revalidate?: boolean;
      append?: boolean;
    }) => {
      const generation = requestGeneration.current.next();
      const accessToken = String(token ?? '').trim();
      if (!shouldLoadActivity({ status, token: accessToken })) {
        if (requestGeneration.current.isCurrent(generation)) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
        return;
      }

      const firstPaint = !hasLastKnownStateRef.current;
      if (!options?.silent && firstPaint && !options?.append) {
        setLoading(true);
      }
      if (requestGeneration.current.isCurrent(generation) && !options?.append) {
        setError(null);
      }

      try {
        const params = activityRequestParams({
          hasFullHistory: hasFullActivityHistory,
          append: options?.append,
          loadedCount: entriesRef.current.length,
          cursor: options?.append ? nextCursorRef.current : null,
        });
        const response = await getActivity(accessToken, {
          revalidate: options?.revalidate,
          limit: params.limit,
          cursor: params.cursor,
        });
        if (!requestGeneration.current.isCurrent(generation)) {
          return;
        }

        const page = normalizeActivityResponse(response);
        hasLastKnownStateRef.current = true;
        setLastPageCount(page.items.length);
        setLoading(false);

        let nextItems = page.items;
        if (options?.append) {
          nextItems = mergeActivityItems(entriesRef.current, page.items);
          const gained = nextItems.length - entriesRef.current.length;
          setBackendHasMore(gained > 0 ? page.hasMore : false);
          setNextCursor(gained > 0 ? page.nextCursor : null);
        } else {
          setBackendHasMore(page.hasMore);
          setNextCursor(page.nextCursor);
        }
        setEntries(nextItems);

        const nextMap = await loadMemberNames(
          nextItems,
          accessToken,
          generation,
          options?.append ? memberMapRef.current : {},
          options?.revalidate,
        );
        if (!requestGeneration.current.isCurrent(generation)) {
          return;
        }
        setMemberMap(nextMap);
      } catch (loadError) {
        logClientError('Unable to load activity', loadError);
        if (!requestGeneration.current.isCurrent(generation)) {
          return;
        }
        setError(t('financialErrors:loadActivity'));
        if (shouldReplaceFinancialStateOnError(hasLastKnownStateRef.current)) {
          setEntries([]);
          setMemberMap({});
          setBackendHasMore(null);
          setNextCursor(null);
          setLastPageCount(0);
        }
      } finally {
        if (requestGeneration.current.isCurrent(generation)) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [status, token, t, hasFullActivityHistory, loadMemberNames],
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

  const feed = useMemo(
    () =>
      presentActivityFeed({
        items: entries,
        typeFilter,
        circleId: circleFilter,
        hasFullHistory: hasFullActivityHistory,
        backendHasMore,
        requestedLimit,
        lastPageCount,
      }),
    [
      entries,
      typeFilter,
      circleFilter,
      hasFullActivityHistory,
      backendHasMore,
      requestedLimit,
      lastPageCount,
    ],
  );

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !feed.showLoadMore) return;
    setLoadingMore(true);
    void loadActivity({ silent: true, append: true });
  }, [feed.showLoadMore, loadActivity, loadingMore]);

  const exportRows = useMemo(
    () =>
      activityExportEntries({
        items: entries,
        typeFilter,
        circleId: circleFilter,
      }),
    [entries, typeFilter, circleFilter],
  );

  const beginExport = useCallback(() => {
    if (!hasFullActivityHistory) {
      router.push('/subscription');
      return false;
    }
    if (
      !canBeginActivityExport({
        hasFullHistory: hasFullActivityHistory,
        lockHeld: exportingRef.current,
        rowCount: exportRows.length,
      })
    ) {
      return false;
    }
    exportingRef.current = true;
    setExporting(true);
    return true;
  }, [exportRows.length, hasFullActivityHistory]);

  const endExport = useCallback(() => {
    exportingRef.current = false;
    setExporting(false);
  }, []);

  const presentExportRow = useCallback(
    (entry: BackendActivity) => {
      const memberName =
        resolveActivityMemberName(entry, memberMap) ||
        t('activity:unknownMember');
      const sentence = activityEventSentence(entry, t, {
        name: memberName,
        round: entry.round,
      });
      return {
        date: formatDateTime(entry.createdAt, language),
        event: sentence,
        member: memberName,
        circle: entry.circleName || '',
        round: entry.round == null ? '' : String(entry.round),
        amount:
          entry.amount == null
            ? ''
            : formatCurrency(entry.amount, language, 'USD', 2),
      };
    },
    [language, memberMap, t],
  );

  const handleExportCsv = useCallback(async () => {
    if (!beginExport()) return;
    const headers = [
      t('activity:csv.date'),
      t('activity:csv.event'),
      t('activity:csv.member'),
      t('activity:csv.circle'),
      t('activity:csv.round'),
      t('activity:csv.amount'),
    ];
    const rows = exportRows.map((entry) => {
      const presented = presentExportRow(entry);
      return [
        presented.date,
        presented.event,
        presented.member,
        presented.circle,
        presented.round,
        presented.amount,
      ];
    });
    const csv = buildActivityCsv(headers, rows);

    try {
      const filename = activityExportFilename();
      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true });
      file.write(`\uFEFF${csv}`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: t('activity:exportDialogTitle'),
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        await copyText(csv);
        Alert.alert(
          t('activity:exportCopiedTitle'),
          t('activity:exportCopiedBody'),
        );
      }
    } catch (exportError) {
      logClientError('Unable to export activity', exportError);
      try {
        await copyText(csv);
        Alert.alert(
          t('activity:exportCopiedTitle'),
          t('activity:exportCopiedBody'),
        );
      } catch {
        Alert.alert(
          t('activity:exportFailedTitle'),
          t('activity:exportFailedBody'),
        );
      }
    } finally {
      endExport();
    }
  }, [beginExport, endExport, exportRows, presentExportRow, t]);

  const handleExportPdf = useCallback(async () => {
    if (!beginExport()) return;
    const circleName = circleFilter
      ? feed.circles.find((circle) => circle.id === circleFilter)?.name ||
        t('activity:filters.allCircles')
      : t('activity:filters.allCircles');
    const generatedAt = new Intl.DateTimeFormat(language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date());
    const html = buildActivityReportHtml(
      {
        brand: t('activity:report.brand'),
        title: t('activity:report.title'),
        circleLabel: t('activity:report.circle'),
        circleName,
        scopeLabel: t('activity:report.scope'),
        scopeValue: `${t(`activity:filters.${typeFilter}`)}. ${
          isActivityExportPartial(backendHasMore)
            ? t('activity:report.partialScope')
            : t('activity:report.completeScope')
        }`,
        generatedLabel: t('activity:report.generated'),
        generatedAt,
        summaryTitle: t('activity:summary.contributed'),
        contributedLabel: t('activity:summary.contributed'),
        contributed: formatCurrency(feed.summary.contributed, language, 'USD', 2),
        receivedLabel: t('activity:summary.received'),
        received: formatCurrency(feed.summary.received, language, 'USD', 2),
        reviewLabel: t('activity:summary.review'),
        review: String(feed.summary.pendingReview),
        dateHeader: t('activity:csv.date'),
        eventHeader: t('activity:csv.event'),
        memberHeader: t('activity:csv.member'),
        circleHeader: t('activity:csv.circle'),
        roundHeader: t('activity:csv.round'),
        amountHeader: t('activity:csv.amount'),
        empty: t('activity:report.empty'),
        informational: t('activity:report.informational'),
        recordsNote: t('activity:report.recordsNote'),
        footer: t('activity:report.footer'),
      },
      exportRows.map(presentExportRow),
    );

    try {
      const printed = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(printed.uri, {
          mimeType: 'application/pdf',
          dialogTitle: t('activity:exportPdfDialogTitle'),
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(
          t('activity:exportPdfUnavailableTitle'),
          t('activity:exportPdfUnavailableBody'),
        );
      }
    } catch (exportError) {
      logClientError('Unable to export activity report', exportError);
      Alert.alert(
        t('activity:exportFailedTitle'),
        t('activity:exportFailedBody'),
      );
    } finally {
      endExport();
    }
  }, [
    beginExport,
    backendHasMore,
    circleFilter,
    endExport,
    exportRows,
    feed.circles,
    feed.summary,
    language,
    presentExportRow,
    t,
    typeFilter,
  ]);

  const sections = feed.sections.map((section) => ({
    key: section.key,
    bucket: section.bucket,
    title:
      section.bucket === 'today'
        ? t('activity:groups.today')
        : section.bucket === 'yesterday'
          ? t('activity:groups.yesterday')
          : formatDateTime(section.key, language),
    data: section.entries,
  }));

  const showSummary =
    feed.summary.contributed > 0 ||
    feed.summary.received > 0 ||
    feed.summary.pendingReview > 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <SectionList
        sections={sections}
        keyExtractor={(item, index) =>
          item.id || `${item.type || 'activity'}:${item.createdAt || index}`
        }
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
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
              {hasFullActivityHistory ? (
                <Text style={styles.eyebrow}>{t('activity:eyebrow')}</Text>
              ) : null}
              <Text style={styles.title}>{t('activity:title')}</Text>
              <Text style={styles.subtitle}>{t('activity:subtitle')}</Text>
            </View>

            {showSummary ? (
              <View style={styles.summaryRow}>
                {feed.summary.contributed > 0 ? (
                  <SummaryChip
                    label={t('activity:summary.contributed')}
                    value={formatCurrency(
                      feed.summary.contributed,
                      language,
                      'USD',
                      2,
                    )}
                  />
                ) : null}
                {feed.summary.received > 0 ? (
                  <SummaryChip
                    label={t('activity:summary.received')}
                    value={formatCurrency(
                      feed.summary.received,
                      language,
                      'USD',
                      2,
                    )}
                    tone="success"
                  />
                ) : null}
                {feed.summary.pendingReview > 0 ? (
                  <SummaryChip
                    label={t('activity:summary.review')}
                    value={String(feed.summary.pendingReview)}
                    tone="warning"
                  />
                ) : null}
              </View>
            ) : null}

            <View style={styles.filterRow}>
              {(
                [
                  'all',
                  'contributions',
                  'payouts',
                  'reviews',
                ] as ActivityTypeFilter[]
              ).map((id) => (
                <FilterPill
                  key={id}
                  label={t(`activity:filters.${id}`)}
                  active={typeFilter === id}
                  onPress={() => setTypeFilter(id)}
                />
              ))}
            </View>

            {feed.circles.length > 1 ? (
              <View style={styles.filterRow}>
                <FilterPill
                  label={t('activity:filters.allCircles')}
                  active={!circleFilter}
                  onPress={() => setCircleFilter(null)}
                />
                {feed.circles.map((circle) => (
                  <FilterPill
                    key={circle.id}
                    label={circle.name}
                    active={circleFilter === circle.id}
                    onPress={() => setCircleFilter(circle.id)}
                  />
                ))}
              </View>
            ) : null}

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
          ) : feed.emptyFilter ? (
            <View style={styles.emptyState}>
              <FontAwesome name="filter" size={48} color={colors.muted} />
              <Text style={styles.emptyTitle}>
                {t('activity:emptyFilterTitle')}
              </Text>
              <Text style={styles.emptyText}>
                {t('activity:emptyFilterBody')}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <FontAwesome name="clock-o" size={60} color={colors.muted} />
              <Text style={styles.emptyTitle}>{t('activity:emptyTitle')}</Text>
              <Text style={styles.emptyText}>{t('activity:emptyBody')}</Text>
            </View>
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View
            style={[
              styles.rowShell,
              index === 0 && styles.rowShellFirst,
              index === section.data.length - 1 && styles.rowShellLast,
            ]}
          >
            <ActivityCard entry={item} memberMap={memberMap} />
            {index < section.data.length - 1 ? (
              <View style={styles.divider} />
            ) : null}
          </View>
        )}
        ListFooterComponent={
          feed.visible.length > 0 ? (
            <View style={styles.footer}>
              {feed.showUpgrade ? (
                <View style={styles.upgradeBox}>
                  <FontAwesome
                    name="diamond"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.upgradeTitle}>
                    {t('activity:unlockTitle')}
                  </Text>
                  <Text style={styles.upgradeBody}>
                    {t('activity:unlockBody')}
                  </Text>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => router.push('/subscription')}
                    accessibilityRole="button"
                    accessibilityLabel={t('activity:upgrade')}
                  >
                    <Text style={styles.primaryButtonText}>
                      {t('activity:upgrade')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {feed.showLoadMore ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={handleLoadMore}
                  disabled={loadingMore}
                  accessibilityRole="button"
                  accessibilityLabel={t('activity:loadMoreA11y')}
                >
                  {loadingMore ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={styles.secondaryButtonText}>
                      {t('activity:loadMore')}
                    </Text>
                  )}
                </Pressable>
              ) : null}

              {feed.showExport ? (
                <>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => void handleExportPdf()}
                    disabled={exporting}
                    accessibilityRole="button"
                    accessibilityLabel={t('activity:exportPdfA11y')}
                  >
                    {exporting ? (
                      <ActivityIndicator color={colors.onColor} />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {t('activity:exportPdf')}
                      </Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => void handleExportCsv()}
                    disabled={exporting}
                    accessibilityRole="button"
                    accessibilityLabel={t('activity:exportCsvA11y')}
                  >
                    {exporting ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <>
                        <FontAwesome
                          name="download"
                          size={14}
                          color={colors.primary}
                        />
                        <Text style={styles.secondaryButtonText}>
                          {t('activity:exportCsv')}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function ActivityCard({
  entry,
  memberMap,
}: {
  entry: BackendActivity;
  memberMap: Record<string, string>;
}) {
  const { t, i18n } = useTranslation('activity');
  const language = i18n.resolvedLanguage || i18n.language;
  const type = String(entry.type || '').toLowerCase();
  const isContribution = type.includes('contribution');
  const isPayout = type.includes('payout');
  const isRejected = type.includes('rejected') || type.includes('missed');
  const isReview = type.includes('review');

  let color = colors.primary;
  let iconName: IconName = 'book';
  if (isRejected) {
    color = colors.danger;
    iconName = 'times';
  } else if (isReview) {
    color = colors.warning;
    iconName = 'flag';
  } else if (isContribution) {
    color = colors.primary;
    iconName = 'arrow-up';
  } else if (isPayout) {
    color = colors.success;
    iconName = 'arrow-down';
  }

  const memberName = resolveActivityMemberName(entry, memberMap);
  const sentence = activityEventSentence(entry, t, {
    name: memberName || undefined,
    round: entry.round,
  });
  const provenance = activityProvenanceKind(entry);
  const amountLabel =
    entry.amount !== null
      ? formatCurrency(entry.amount, language, 'USD', 2)
      : '';
  const dateLabel = formatDateTime(entry.createdAt, language);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => {
        if (entry.circleId) {
          router.push(circleWorkspaceHref(entry.circleId, 'records'));
        }
      }}
      disabled={!entry.circleId}
      accessibilityRole="button"
      accessibilityLabel={t('activity:rowA11y', {
        event: sentence,
        amount: amountLabel || t('activity:unknownEvent'),
        date: dateLabel,
      })}
      accessibilityHint={
        entry.circleName
          ? t('activity:openRecordsA11y', { circle: entry.circleName })
          : undefined
      }
    >
      <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
        <FontAwesome name={iconName} size={18} color={color} />
      </View>

      <View style={styles.details}>
        <Text style={styles.description}>{sentence}</Text>
        <Text style={styles.activityMeta}>
          {entry.round
            ? t('activity:meta', {
                circle: entry.circleName,
                round: entry.round,
              })
            : entry.circleName}
        </Text>
        {provenance ? (
          <Text style={styles.provenance}>
            {t(`activity:provenance.${provenance}`)}
          </Text>
        ) : null}
      </View>

      <View style={styles.amountColumn}>
        {amountLabel ? (
          <Text style={[styles.amount, { color }]}>{amountLabel}</Text>
        ) : null}
        <Text style={styles.date}>{dateLabel}</Text>
      </View>
    </Pressable>
  );
}

function SummaryChip({
  label,
  value,
  tone = 'primary',
}: {
  label: string;
  value: string;
  tone?: 'primary' | 'success' | 'warning';
}) {
  const valueColor =
    tone === 'success'
      ? colors.successText
      : tone === 'warning'
        ? colors.warningText
        : colors.primaryDark;
  return (
    <View style={styles.summaryChip}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
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
    marginBottom: 20,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 6,
    textTransform: 'uppercase',
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
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  summaryChip: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 104,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryValue: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
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
  sectionHeader: {
    backgroundColor: colors.background,
    paddingBottom: 8,
    paddingTop: 8,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  rowShell: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
  },
  rowShellFirst: {
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    paddingTop: 4,
  },
  rowShellLast: {
    borderBottomLeftRadius: radii.card,
    borderBottomRightRadius: radii.card,
    marginBottom: 12,
    paddingBottom: 4,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: 16,
  },
  divider: {
    backgroundColor: colors.surfaceMuted,
    height: 1,
    marginLeft: 60,
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
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: '800',
  },
  activityMeta: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  provenance: {
    color: colors.subtle,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  amountColumn: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  amount: {
    fontSize: 16,
    fontWeight: '900',
  },
  date: {
    color: colors.subtle,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
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
  footer: {
    gap: 10,
    marginTop: 8,
    paddingBottom: 8,
  },
  upgradeBox: {
    alignItems: 'center',
    backgroundColor: colors.premiumLavenderBadge,
    borderColor: colors.premiumLavender,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 16,
  },
  upgradeTitle: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 8,
    textAlign: 'center',
  },
  upgradeBody: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    minHeight: 48,
    justifyContent: 'center',
    width: '100%',
  },
  primaryButtonText: {
    color: colors.onColor,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 54,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.7,
  },
});
