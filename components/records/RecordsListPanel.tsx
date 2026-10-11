/**
 * One list for contributions, payouts or rounds: status filter, newest round first, and
 * "Show more" paging. Rows show the formal record number so a record can be quoted exactly.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import {
  getContributionRecords,
  getPayoutRecords,
  getRoundRecords,
  type ContributionRecord,
  type PayoutRecord,
  type RecordsPage,
  type RoundRecord,
} from '@/lib/api';
import {
  CONTRIBUTION_STATUS_FILTERS,
  PAYOUT_STATUS_FILTERS,
  RECORDS_PAGE_SIZE,
  ROUND_STATUS_FILTERS,
  appendRecords,
  contributionStatusKey,
  contributionTone,
  formatCents,
  groupByRound,
  payoutDisplayStatus,
  payoutTone,
  positionLabel,
  roundDisplayStatus,
  roundTone,
} from '@/lib/records/recordsPresentation';
import { formatDisplayDate } from '@/lib/shared/statementPresentation';
import { colors } from '@/lib/shared/theme';

import { RecordStatusChip } from './RecordStatusChip';
import { rs } from './recordsStyles';
import type { OpenRecord, RecordKind } from './recordTypes';

type AnyRecord = ContributionRecord | PayoutRecord | RoundRecord;

type Props = {
  kind: RecordKind;
  circleId: string;
  token: string;
  onOpenRecord: (record: OpenRecord) => void;
};

function fetchPage(
  kind: RecordKind,
  token: string,
  circleId: string,
  status: string | null,
  offset: number,
): Promise<RecordsPage<AnyRecord>> {
  const query = { status: status || undefined, limit: RECORDS_PAGE_SIZE, offset };
  if (kind === 'contribution') return getContributionRecords(token, circleId, query);
  if (kind === 'payout') return getPayoutRecords(token, circleId, query);
  return getRoundRecords(token, circleId, query);
}

function filtersFor(kind: RecordKind): readonly string[] {
  if (kind === 'contribution') return CONTRIBUTION_STATUS_FILTERS;
  if (kind === 'payout') return PAYOUT_STATUS_FILTERS;
  return ROUND_STATUS_FILTERS;
}

function filterLabel(kind: RecordKind, value: string, t: TFunction): string {
  if (kind === 'contribution') {
    return t(`status.contribution.${contributionStatusKey(value)}`);
  }
  if (kind === 'payout') return t(`status.payout.${payoutDisplayStatus(value)}`);
  return t(`status.round.${roundDisplayStatus(value)}`);
}

export function RecordsListPanel({ kind, circleId, token, onOpenRecord }: Props) {
  const { t, i18n } = useTranslation('records');
  const language = i18n.resolvedLanguage || i18n.language;
  const [status, setStatus] = useState<string | null>(null);
  const [rows, setRows] = useState<AnyRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const ticket = useRef(0);

  const loadFirst = useCallback(() => {
    const mine = ++ticket.current;
    setLoading(true);
    setFailed(false);
    fetchPage(kind, token, circleId, status, 0).then(
      (page) => {
        if (ticket.current !== mine) return;
        setRows(page.records);
        setHasMore(page.hasMore);
        setLoading(false);
      },
      () => {
        if (ticket.current !== mine) return;
        setRows([]);
        setHasMore(false);
        setFailed(true);
        setLoading(false);
      },
    );
  }, [kind, token, circleId, status]);

  useEffect(() => {
    loadFirst();
    return () => {
      ticket.current += 1;
    };
  }, [loadFirst]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    const mine = ticket.current;
    setLoadingMore(true);
    fetchPage(kind, token, circleId, status, rows.length).then(
      (page) => {
        if (ticket.current !== mine) return;
        setRows((current) => appendRecords(current, page.records));
        setHasMore(page.hasMore);
        setLoadingMore(false);
      },
      () => {
        if (ticket.current !== mine) return;
        setFailed(true);
        setLoadingMore(false);
      },
    );
  };

  const positionText = (number: number) => t('position', { number });
  const memberFallback = t('memberFallback');
  const open = (record: AnyRecord) => onOpenRecord({ kind, reference: record.reference });
  const a11y = (record: AnyRecord) =>
    t('list.openRecordA11y', { reference: record.reference });

  const renderContribution = (record: ContributionRecord) => (
    <Pressable
      key={record.reference}
      style={rs.row}
      onPress={() => open(record)}
      accessibilityRole="button"
      accessibilityLabel={a11y(record)}
    >
      <View style={rs.rowMain}>
        <Text style={rs.rowTitle} numberOfLines={1}>
          {positionLabel(record.member, positionText, memberFallback)}
        </Text>
        <Text style={rs.rowReference}>{record.reference}</Text>
      </View>
      <View style={rs.rowRight}>
        <Text style={rs.rowAmount}>{formatCents(record.amount.expectedCents, language)}</Text>
        <RecordStatusChip
          label={t(`status.contribution.${contributionStatusKey(record.status)}`)}
          tone={contributionTone(record.status)}
        />
      </View>
    </Pressable>
  );

  const renderPayout = (record: PayoutRecord) => {
    const display = payoutDisplayStatus(record.status);
    const dateLine =
      display === 'released' && record.paidAt
        ? t('row.releasedOn', { date: formatDisplayDate(record.paidAt, language) })
        : record.scheduledDate
          ? t('row.scheduledOn', { date: formatDisplayDate(record.scheduledDate, language) })
          : null;
    return (
      <Pressable
        key={record.reference}
        style={rs.row}
        onPress={() => open(record)}
        accessibilityRole="button"
        accessibilityLabel={a11y(record)}
      >
        <View style={rs.rowMain}>
          <Text style={rs.rowTitle}>{t('overview.roundNumber', { number: record.round.number })}</Text>
          <Text style={rs.rowMeta} numberOfLines={1}>
            {t('row.recipient', {
              name: positionLabel(record.recipient, positionText, memberFallback),
            })}
          </Text>
          {dateLine ? <Text style={rs.rowMeta}>{dateLine}</Text> : null}
          <Text style={rs.rowReference}>{record.reference}</Text>
        </View>
        <View style={rs.rowRight}>
          <Text style={rs.rowAmount}>{formatCents(record.amount.cents, language)}</Text>
          <RecordStatusChip
            label={t(`status.payout.${display}`)}
            tone={payoutTone(record.status)}
          />
        </View>
      </Pressable>
    );
  };

  const renderRound = (record: RoundRecord) => {
    const confirmed = record.contributionCounts.byStatus?.confirmed ?? 0;
    return (
      <Pressable
        key={record.reference}
        style={rs.row}
        onPress={() => open(record)}
        accessibilityRole="button"
        accessibilityLabel={a11y(record)}
      >
        <View style={rs.rowMain}>
          <Text style={rs.rowTitle}>{t('overview.roundNumber', { number: record.round.number })}</Text>
          <Text style={rs.rowMeta} numberOfLines={1}>
            {t('row.recipient', {
              name: positionLabel(record.recipient, positionText, memberFallback),
            })}
          </Text>
          <Text style={rs.rowMeta}>
            {t('row.confirmedOf', { confirmed, total: record.contributionCounts.total })}
            {record.round.dueDate
              ? ` · ${t('row.dueOn', { date: formatDisplayDate(record.round.dueDate, language) })}`
              : ''}
          </Text>
          <Text style={rs.rowReference}>{record.reference}</Text>
        </View>
        <View style={rs.rowRight}>
          <Text style={rs.rowAmount}>{formatCents(record.totals.expectedPotCents, language)}</Text>
          <RecordStatusChip
            label={t(`status.round.${roundDisplayStatus(record.round.status)}`)}
            tone={roundTone(record.round.status)}
          />
        </View>
      </Pressable>
    );
  };

  const emptyKey =
    kind === 'contribution'
      ? 'list.emptyContributions'
      : kind === 'payout'
        ? 'list.emptyPayouts'
        : 'list.emptyRounds';

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View style={rs.stateCard}>
        <ActivityIndicator color={colors.primary} />
        <Text style={rs.stateTitle}>{t('list.loading')}</Text>
      </View>
    );
  } else if (failed && rows.length === 0) {
    body = (
      <View style={rs.stateCard}>
        <Text style={rs.stateTitle}>{t('list.loadError')}</Text>
        <Pressable
          style={rs.primaryBtn}
          onPress={loadFirst}
          accessibilityRole="button"
          accessibilityLabel={t('list.retry')}
        >
          <Text style={rs.primaryBtnText}>{t('list.retry')}</Text>
        </Pressable>
      </View>
    );
  } else if (rows.length === 0) {
    body = (
      <View style={rs.stateCard}>
        <Text style={rs.stateBody}>
          {t(status ? 'list.emptyFiltered' : emptyKey)}
        </Text>
      </View>
    );
  } else if (kind === 'contribution') {
    body = (
      <View>
        {groupByRound(rows as ContributionRecord[]).map((group) => (
          <View key={group.round}>
            <Text style={rs.roundHeading}>{t('list.roundHeading', { number: group.round })}</Text>
            {group.rows.map(renderContribution)}
          </View>
        ))}
      </View>
    );
  } else {
    const sorted = [...rows].sort((a, b) => b.round.number - a.round.number);
    body = (
      <View>
        {kind === 'payout'
          ? (sorted as PayoutRecord[]).map(renderPayout)
          : (sorted as RoundRecord[]).map(renderRound)}
      </View>
    );
  }

  return (
    <View style={rs.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={rs.filterStrip}
        accessibilityRole="tablist"
      >
        {[null, ...filtersFor(kind)].map((value) => {
          const active = status === value;
          const label = value === null ? t('list.all') : filterLabel(kind, value, t);
          return (
            <Pressable
              key={value ?? 'all'}
              style={[rs.filterChip, active && rs.filterChipActive]}
              onPress={() => setStatus(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t('list.filterA11y', { status: label })}
            >
              <Text style={[rs.filterChipText, active && rs.filterChipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading || rows.length === 0 ? (
        body
      ) : (
      <View style={rs.panel}>
        {body}
        {hasMore ? (
          <Pressable
            style={rs.secondaryBtn}
            onPress={loadMore}
            disabled={loadingMore}
            accessibilityRole="button"
            accessibilityState={{ busy: loadingMore, disabled: loadingMore }}
            accessibilityLabel={t('list.loadMore')}
          >
            {loadingMore ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={rs.secondaryBtnText}>{t('list.loadMore')}</Text>
            )}
          </Pressable>
        ) : null}
        {failed ? <Text style={rs.calmText}>{t('list.loadError')}</Text> : null}
      </View>
      )}
    </View>
  );
}
