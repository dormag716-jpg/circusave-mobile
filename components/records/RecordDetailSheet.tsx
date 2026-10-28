/**
 * One formal record: its number, authoritative details, verification and its own history.
 * Read-only. Confirm, reject and undo stay in the Round tab; the organizer gets a link there.
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  downloadRecordPdf,
  getContributionRecord,
  getPayoutRecord,
  getRoundRecord,
  type ContributionRecord,
  type PayoutRecord,
  type RecordHistoryItem,
  type RoundRecord,
} from '@/lib/api';
import {
  actorKey,
  contributionNeedsReview,
  contributionStatusKey,
  contributionTone,
  formatCents,
  historyEventKey,
  payoutDisplayStatus,
  payoutTone,
  positionLabel,
  roundDisplayStatus,
  roundTone,
  verificationKey,
} from '@/lib/records/recordsPresentation';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/shared/statementPresentation';
import { colors } from '@/lib/shared/theme';

import { RecordStatusChip } from './RecordStatusChip';
import { rs } from './recordsStyles';
import { saveAndSharePdf } from './saveAndSharePdf';
import { useRecordsLoad } from './useRecordsLoad';
import type { OpenRecord, RecordKind } from './recordTypes';

type Props = {
  record: OpenRecord | null;
  circleId: string;
  token: string;
  isOrganizer: boolean;
  onClose: () => void;
  onOpenRecord: (record: OpenRecord) => void;
  /** Organizer shortcut to the Round tab, where payments are confirmed or rejected. */
  onReviewInRound?: () => void;
};

type AnyRecord = ContributionRecord | PayoutRecord | RoundRecord;

function Line({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={rs.metaLine}>
      <Text style={rs.metaLabel}>{label}</Text>
      <Text style={rs.metaValue} selectable>
        {value}
      </Text>
    </View>
  );
}

const HISTORY_PREVIEW = 4;

/** A round's history lists only round-level events; contribution events belong to a member. */
const ROUND_LEVEL_EVENTS = new Set([
  'roundStarted',
  'roundClosed',
  'payoutReleased',
  'cycleCompleted',
]);

function History({
  items,
  t,
  language,
  method,
}: {
  items: RecordHistoryItem[] | undefined;
  t: TFunction;
  language: string;
  method: (value: string | null | undefined) => string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = !items || expanded ? items : items.slice(0, HISTORY_PREVIEW);
  return (
    <View style={rs.panel}>
      <Text style={rs.panelTitle}>{t('history.title')}</Text>
      {!items || items.length === 0 ? (
        <Text style={rs.calmText}>{t('history.empty')}</Text>
      ) : (
        (shown ?? []).map((item) => {
          const role = actorKey(item.actor);
          const actor = item.actor?.displayName || t(`history.actor.${role}`);
          const amount = formatCents(item.amountCents, language);
          return (
            <View key={item.id} style={rs.historyItem}>
              <Text style={rs.historyTitle}>
                {t(`history.event.${historyEventKey(item.type)}`)}
                {amount ? ` · ${amount}` : ''}
              </Text>
              <Text style={rs.historyMeta}>
                {t('history.by', { actor })}
                {item.at ? ` · ${formatDisplayDateTime(item.at, language)}` : ''}
              </Text>
              {item.paymentMethod ? (
                <Text style={rs.historyMeta}>{method(item.paymentMethod)}</Text>
              ) : null}
              {item.paymentReference ? (
                <Text style={rs.historyMeta} selectable>
                  {t('detail.reference')}: {item.paymentReference}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
      {items && items.length > HISTORY_PREVIEW ? (
        <Pressable
          style={rs.secondaryBtn}
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? t('history.showLess') : t('history.showAll', { count: items.length })
          }
        >
          <Text style={rs.secondaryBtnText}>
            {expanded ? t('history.showLess') : t('history.showAll', { count: items.length })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function RecordDetailSheet({
  record,
  circleId,
  token,
  isOrganizer,
  onClose,
  onOpenRecord,
  onReviewInRound,
}: Props) {
  const { t, i18n } = useTranslation(['records', 'contributions']);
  const language = i18n.resolvedLanguage || i18n.language;
  const kind: RecordKind = record?.kind ?? 'contribution';

  const { data, loading, failed, reload } = useRecordsLoad<AnyRecord | null>(
    async () => {
      if (!record) return null;
      if (record.kind === 'contribution') return getContributionRecord(token, circleId, record.reference);
      if (record.kind === 'payout') return getPayoutRecord(token, circleId, record.reference);
      return getRoundRecord(token, circleId, record.reference);
    },
    [token, circleId, record?.kind, record?.reference],
  );

  // The document is generated from the open record and shared with the normal system share
  // sheet. Reads only: nothing about the record changes.
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  useEffect(() => {
    setDownloadFailed(false);
  }, [record?.reference]);

  const downloadDocument = async () => {
    if (!record || downloading) return;
    setDownloading(true);
    setDownloadFailed(false);
    try {
      const pdf = await downloadRecordPdf(token, circleId, record.kind, record.reference);
      await saveAndSharePdf(pdf.bytes, pdf.filename, {
        dialogTitle: t('records:document.shareTitle'),
        savedTitle: t('records:document.savedTitle'),
        savedBody: t('records:document.savedBody', { filename: pdf.filename }),
      });
    } catch {
      setDownloadFailed(true);
    } finally {
      setDownloading(false);
    }
  };

  const positionText = (number: number) => t('records:position', { number });
  const label = (position: Parameters<typeof positionLabel>[0]) =>
    positionLabel(position, positionText, t('records:memberFallback'));
  const method = (value: string | null | undefined) =>
    value
      ? t(`contributions:paymentSetup.methods.${value}`, { defaultValue: value })
      : null;
  const date = (value: string | null | undefined) =>
    value ? formatDisplayDate(value, language) : null;
  const dateTime = (value: string | null | undefined) =>
    value ? formatDisplayDateTime(value, language) : null;

  const link = (labelText: string, target: OpenRecord | null, trailing?: ReactNode) =>
    target ? (
      <Pressable
        key={labelText + target.reference}
        style={rs.linkRow}
        onPress={() => onOpenRecord(target)}
        accessibilityRole="button"
        accessibilityLabel={t('records:overview.openRecordA11y', { reference: target.reference })}
      >
        <View style={rs.rowMain}>
          <Text style={rs.rowTitle}>{labelText}</Text>
          <Text style={rs.rowReference}>{target.reference}</Text>
        </View>
        {trailing}
        <FontAwesome name="angle-right" size={20} color={colors.subtle} />
      </Pressable>
    ) : null;

  const renderContribution = (c: ContributionRecord) => {
    const key = verificationKey(c.verification);
    const reviewable = isOrganizer && contributionNeedsReview(c.status);
    return (
      <>
        <View style={rs.panel}>
          <Text style={rs.panelTitle}>{t('records:detail.detailsTitle')}</Text>
          <Line label={t('records:detail.round')} value={t('records:overview.roundNumber', { number: c.round.number })} />
          <Line label={t('records:detail.member')} value={label(c.member)} />
          <Line label={t('records:detail.dueDate')} value={date(c.round.dueDate)} />
          <Line label={t('records:detail.expected')} value={formatCents(c.amount.expectedCents, language)} />
          <Line label={t('records:detail.netPaid')} value={formatCents(c.amount.netPaidCents, language)} />
          {c.amount.refundedCents > 0 ? (
            <Line label={t('records:detail.refunded')} value={formatCents(c.amount.refundedCents, language)} />
          ) : null}
          <Line label={t('records:detail.remainingDue')} value={formatCents(c.amount.remainingDueCents, language)} />
          <Line label={t('records:detail.method')} value={method(c.paymentMethod)} />
          <Line label={t('records:detail.reference')} value={c.paymentReference} />
          <Line label={t('records:detail.note')} value={c.note} />
        </View>

        <View style={rs.panel}>
          <Text style={rs.panelTitle}>{t('records:verification.title')}</Text>
          <View style={rs.row}>
            <Text style={[rs.rowTitle, rs.rowMain]}>{t(`records:verification.${key}`)}</Text>
          </View>
          <Line label={t('records:verification.verifiedOn')} value={dateTime(c.verification.verifiedAt)} />
          {key === 'rejected' ? (
            <>
              <Line label={t('records:verification.rejectedOn')} value={dateTime(c.verification.rejectedAt)} />
              <Line label={t('records:verification.reason')} value={c.verification.rejectionReason} />
            </>
          ) : null}
          {reviewable && onReviewInRound ? (
            <Pressable
              style={rs.primaryBtn}
              onPress={onReviewInRound}
              accessibilityRole="button"
              accessibilityLabel={t('records:detail.reviewInRound')}
            >
              <Text style={rs.primaryBtnText}>{t('records:detail.reviewInRound')}</Text>
            </Pressable>
          ) : null}
        </View>

        {c.relatedPayoutReference || c.round.reference ? (
          <View style={rs.panel}>
            <Text style={rs.panelTitle}>{t('records:detail.relatedTitle')}</Text>
            {link(t('records:detail.relatedRound'), { kind: 'round', reference: c.round.reference })}
            {link(
              t('records:detail.relatedPayout'),
              c.relatedPayoutReference
                ? { kind: 'payout', reference: c.relatedPayoutReference }
                : null,
            )}
          </View>
        ) : null}

        <History items={c.history} t={t} language={language} method={method} />
      </>
    );
  };

  const renderPayout = (p: PayoutRecord) => {
    return (
      <>
        <View style={rs.panel}>
          <Text style={rs.panelTitle}>{t('records:detail.detailsTitle')}</Text>
          <Line label={t('records:detail.round')} value={t('records:overview.roundNumber', { number: p.round.number })} />
          <Line label={t('records:detail.recipient')} value={label(p.recipient)} />
          <Line
            label={t(p.amount.isExpected ? 'records:detail.expected' : 'records:detail.amount')}
            value={formatCents(p.amount.cents, language)}
          />
          <Line label={t('records:detail.scheduledDate')} value={date(p.scheduledDate)} />
          <Line label={t('records:detail.released')} value={dateTime(p.paidAt)} />
          <Line label={t('records:detail.note')} value={p.note} />
          {p.detailLevel === 'summary' ? (
            <Text style={rs.calmText}>{t('records:detail.summaryOnly')}</Text>
          ) : null}
        </View>
        <View style={rs.panel}>
          <Text style={rs.panelTitle}>{t('records:detail.relatedTitle')}</Text>
          {link(t('records:detail.relatedRound'), {
            kind: 'round',
            reference: p.round.reference,
          })}
        </View>
        {p.detailLevel === 'full' ? (
          <History items={p.history} t={t} language={language} method={method} />
        ) : null}
      </>
    );
  };

  const renderRound = (r: RoundRecord) => {
    const confirmed = r.contributionCounts.byStatus?.confirmed ?? 0;
    return (
      <>
        <View style={rs.panel}>
          <Text style={rs.panelTitle}>{t('records:detail.detailsTitle')}</Text>
          <Line label={t('records:detail.round')} value={t('records:overview.roundNumber', { number: r.round.number })} />
          <Line label={t('records:detail.recipient')} value={label(r.recipient)} />
          <Line label={t('records:detail.dueDate')} value={date(r.round.dueDate)} />
          <Line label={t('records:detail.opened')} value={dateTime(r.round.openedAt)} />
          <Line label={t('records:detail.closed')} value={dateTime(r.round.closedAt)} />
          <Line label={t('records:detail.expectedPot')} value={formatCents(r.totals.expectedPotCents, language)} />
          <Line label={t('records:detail.funded')} value={formatCents(r.totals.recognizedFundingCents, language)} />
          <Line label={t('records:detail.remainingDue')} value={formatCents(r.totals.remainingDueCents, language)} />
          <Line
            label={t('records:detail.contributionsTitle')}
            value={t('records:row.confirmedOf', { confirmed, total: r.contributionCounts.total })}
          />
        </View>

        {r.contributions.length > 0 ? (
          <View style={rs.panel}>
            <Text style={rs.panelTitle}>{t('records:detail.contributionsTitle')}</Text>
            {r.contributions.map((row) =>
              link(
                label(row.member),
                { kind: 'contribution', reference: row.reference },
                <RecordStatusChip
                  label={t(`records:status.contribution.${contributionStatusKey(row.status)}`)}
                  tone={contributionTone(row.status)}
                />,
              ),
            )}
          </View>
        ) : null}

        <View style={rs.panel}>
          <Text style={rs.panelTitle}>{t('records:detail.relatedTitle')}</Text>
          {link(t('records:detail.relatedPayout'), {
            kind: 'payout',
            reference: r.payout.reference,
          })}
        </View>

        <History
          items={r.history?.filter((item) => ROUND_LEVEL_EVENTS.has(historyEventKey(item.type)))}
          t={t}
          language={language}
          method={method}
        />
      </>
    );
  };

  const chip = (): ReactNode => {
    if (!data) return null;
    if (data.recordType === 'contribution') {
      return (
        <RecordStatusChip
          label={t(`records:status.contribution.${contributionStatusKey(data.status)}`)}
          tone={contributionTone(data.status)}
        />
      );
    }
    if (data.recordType === 'payout') {
      return (
        <RecordStatusChip
          label={t(`records:status.payout.${payoutDisplayStatus(data.status)}`)}
          tone={payoutTone(data.status)}
        />
      );
    }
    return (
      <RecordStatusChip
        label={t(`records:status.round.${roundDisplayStatus(data.round.status)}`)}
        tone={roundTone(data.round.status)}
      />
    );
  };

  return (
    <Modal
      visible={record !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={rs.modalRoot} edges={['top', 'left', 'right', 'bottom']}>
        <View style={rs.modalHeader}>
          <Pressable
            onPress={onClose}
            style={rs.modalClose}
            accessibilityRole="button"
            accessibilityLabel={t('records:detail.close')}
          >
            <FontAwesome name="close" size={18} color={colors.textStrong} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={rs.modalKicker}>{t('records:title')}</Text>
            <Text style={rs.modalTitle} numberOfLines={1}>
              {t(`records:detail.kind.${kind}`)}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={[rs.stateCard, { margin: 16 }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={rs.stateTitle}>{t('records:detail.loading')}</Text>
          </View>
        ) : failed || !data ? (
          <View style={[rs.stateCard, { margin: 16 }]}>
            <Text style={rs.stateTitle}>{t('records:detail.loadError')}</Text>
            <Pressable
              style={rs.primaryBtn}
              onPress={reload}
              accessibilityRole="button"
              accessibilityLabel={t('records:detail.retry')}
            >
              <Text style={rs.primaryBtnText}>{t('records:detail.retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={rs.modalScroll} showsVerticalScrollIndicator={false}>
            <View style={rs.referenceCard}>
              <Text style={rs.referenceLabel}>{t('records:detail.recordNumber')}</Text>
              <Text style={rs.referenceValue} selectable>
                {data.reference}
              </Text>
              {chip()}
            </View>
            {data.recordType === 'contribution'
              ? renderContribution(data)
              : data.recordType === 'payout'
                ? renderPayout(data)
                : renderRound(data)}
          </ScrollView>
        )}

        {data && !loading && !failed ? (
          <View style={rs.modalFooter}>
            {downloadFailed ? (
              <Text style={[rs.calmText, { marginBottom: 8, textAlign: 'center' }]}>
                {t('records:detail.downloadError')}
              </Text>
            ) : null}
            <Pressable
              style={[rs.primaryBtn, downloading && { opacity: 0.6 }]}
              onPress={() => void downloadDocument()}
              disabled={downloading}
              accessibilityRole="button"
              accessibilityLabel={t('records:detail.download')}
              accessibilityState={{ busy: downloading, disabled: downloading }}
            >
              {downloading ? (
                <>
                  <ActivityIndicator color={colors.onColor} />
                  <Text style={rs.primaryBtnText}>{t('records:detail.downloadPreparing')}</Text>
                </>
              ) : (
                <>
                  <FontAwesome name="download" size={14} color={colors.onColor} />
                  <Text style={rs.primaryBtnText}>{t('records:detail.download')}</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
