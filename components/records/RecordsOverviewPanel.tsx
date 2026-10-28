/**
 * Records overview: circle totals, the current round, what needs the organizer's review and
 * the viewer's own records. Every number is computed by the backend.
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  getRecordsOverview,
  type RecordBrief,
  type RecordsOverview,
} from '@/lib/api';
import {
  contributionStatusKey,
  contributionTone,
  formatCents,
  roundDisplayStatus,
  roundTone,
} from '@/lib/records/recordsPresentation';
import { colors } from '@/lib/shared/theme';
import { formatDisplayDate } from '@/lib/shared/statementPresentation';

import { RecordStatusChip } from './RecordStatusChip';
import { rs } from './recordsStyles';
import { useRecordsLoad } from './useRecordsLoad';
import type { OpenRecord } from './recordTypes';

type Props = {
  circleId: string;
  token: string;
  onOpenRecord: (record: OpenRecord) => void;
  onReviewInRound?: () => void;
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={rs.metric} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={rs.metricLabel}>{label}</Text>
      <Text style={rs.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export function RecordsOverviewPanel({ circleId, token, onOpenRecord, onReviewInRound }: Props) {
  const { t, i18n } = useTranslation('records');
  const language = i18n.resolvedLanguage || i18n.language;
  const { data, loading, failed, reload } = useRecordsLoad<RecordsOverview>(
    () => getRecordsOverview(token, circleId),
    [token, circleId],
  );

  if (loading) {
    return (
      <View style={rs.stateCard}>
        <ActivityIndicator color={colors.primary} />
        <Text style={rs.stateTitle}>{t('list.loading')}</Text>
      </View>
    );
  }
  if (failed || !data) {
    return (
      <View style={rs.stateCard}>
        <Text style={rs.stateTitle}>{t('list.loadError')}</Text>
        <Pressable
          style={rs.primaryBtn}
          onPress={reload}
          accessibilityRole="button"
          accessibilityLabel={t('list.retry')}
        >
          <Text style={rs.primaryBtnText}>{t('list.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const { totals, currentRound, yourRecords, needsVerification } = data;
  const briefRow = (label: string, brief: RecordBrief | null, last = false) => {
    if (!brief) {
      return (
        <View style={[rs.linkRow, last && rs.rowLast]} key={label}>
          <Text style={rs.rowTitle}>{label}</Text>
          <Text style={rs.rowMeta}>{t('overview.nothingYet')}</Text>
        </View>
      );
    }
    const key = contributionStatusKey(brief.status);
    return (
      <Pressable
        key={label}
        style={[rs.linkRow, last && rs.rowLast]}
        onPress={() => onOpenRecord({ kind: 'contribution', reference: brief.reference })}
        accessibilityRole="button"
        accessibilityLabel={t('overview.openRecordA11y', { reference: brief.reference })}
      >
        <View style={rs.rowMain}>
          <Text style={rs.rowTitle}>{label}</Text>
          <Text style={rs.rowMeta}>
            {t('overview.roundNumber', { number: brief.round })} · {formatCents(brief.expectedCents, language)}
          </Text>
          <Text style={rs.rowReference}>{brief.reference}</Text>
        </View>
        <RecordStatusChip
          label={t(`status.contribution.${key}`)}
          tone={contributionTone(brief.status)}
        />
        <FontAwesome name="angle-right" size={20} color={colors.subtle} />
      </Pressable>
    );
  };

  return (
    <View style={rs.root}>
      {needsVerification && needsVerification.count > 0 ? (
        <View style={rs.noticeCard}>
          <Text style={rs.noticeText}>
            {t('overview.needsReview', { count: needsVerification.count })}
          </Text>
          {onReviewInRound ? (
            <Pressable
              style={rs.primaryBtn}
              onPress={onReviewInRound}
              accessibilityRole="button"
              accessibilityLabel={t('overview.reviewInRoundA11y')}
            >
              <Text style={rs.primaryBtnText}>{t('overview.reviewInRound')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : needsVerification ? (
        <Text style={rs.calmText}>{t('overview.needsReviewNone')}</Text>
      ) : null}

      <View style={rs.panel}>
        <Text style={rs.panelTitle}>{t('overview.totalsTitle')}</Text>
        <View style={rs.metricGrid}>
          <Metric label={t('overview.expected')} value={formatCents(totals.expectedCents, language)} />
          <Metric label={t('overview.confirmed')} value={formatCents(totals.confirmedCents, language)} />
          <Metric label={t('overview.remainingDue')} value={formatCents(totals.remainingDueCents, language)} />
          <Metric label={t('overview.paidOut')} value={formatCents(totals.paidOutCents, language)} />
        </View>
      </View>

      {currentRound ? (
        <Pressable
          style={rs.panel}
          onPress={() => onOpenRecord({ kind: 'round', reference: currentRound.reference })}
          accessibilityRole="button"
          accessibilityLabel={t('overview.openRecordA11y', { reference: currentRound.reference })}
        >
          <Text style={rs.sectionLabel}>{t('overview.currentRound')}</Text>
          <View style={[rs.row, rs.rowLast]}>
            <View style={rs.rowMain}>
              <Text style={rs.rowTitle}>
                {t('overview.roundNumber', { number: currentRound.number })}
              </Text>
              {currentRound.dueDate ? (
                <Text style={rs.rowMeta}>
                  {t('overview.dueOn', { date: formatDisplayDate(currentRound.dueDate, language) })}
                </Text>
              ) : null}
              <Text style={rs.rowReference}>{currentRound.reference}</Text>
            </View>
            <RecordStatusChip
              label={t(`status.round.${roundDisplayStatus(currentRound.status)}`)}
              tone={roundTone(currentRound.status)}
            />
            <FontAwesome name="angle-right" size={20} color={colors.subtle} />
          </View>
        </Pressable>
      ) : null}

      {yourRecords ? (
        <View style={rs.panel}>
          <Text style={rs.panelTitle}>{t('overview.yourRecords')}</Text>
          {briefRow(t('overview.nextContribution'), yourRecords.nextContribution)}
          {briefRow(t('overview.lastConfirmed'), yourRecords.lastConfirmed, true)}
        </View>
      ) : null}
    </View>
  );
}
