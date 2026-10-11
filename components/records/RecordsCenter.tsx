/**
 * Records tab of the circle workspace: formal records and proof.
 *
 * Overview, Contributions, Payouts, Rounds and Documents. Records only shows and proves; it
 * never creates, confirms, rejects or reverses anything. Reviewing a payment happens in the
 * Round tab, which the organizer reaches with "Review in Round".
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  DEFAULT_RECORDS_SEGMENT,
  RECORDS_SEGMENTS,
  type RecordsSegment,
} from '@/lib/records/recordsPresentation';

import { RecordDetailSheet } from './RecordDetailSheet';
import { RecordsListPanel } from './RecordsListPanel';
import { RecordsOverviewPanel } from './RecordsOverviewPanel';
import { StatementDocumentsSection } from './StatementDocumentsSection';
import { rs } from './recordsStyles';
import type { OpenRecord } from './recordTypes';

type Props = {
  circleId: string;
  token: string;
  circleName?: string;
  isOrganizer: boolean;
  /** Switches the workspace to the Round tab, where payments are confirmed or rejected. */
  onReviewInRound?: () => void;
};

export function RecordsCenter({
  circleId,
  token,
  circleName,
  isOrganizer,
  onReviewInRound,
}: Props) {
  const { t } = useTranslation('records');
  const [segment, setSegment] = useState<RecordsSegment>(DEFAULT_RECORDS_SEGMENT);
  const [openRecord, setOpenRecord] = useState<OpenRecord | null>(null);

  const reviewInRound = onReviewInRound
    ? () => {
        setOpenRecord(null);
        onReviewInRound();
      }
    : undefined;

  return (
    <View style={rs.root}>
      <View style={rs.pageHeader}>
        <Text style={rs.pageTitle}>{t('title')}</Text>
        {circleName ? (
          <Text style={rs.pageCircleName} numberOfLines={1}>
            {circleName}
          </Text>
        ) : null}
        <Text style={rs.pageDisclaimer}>{t('disclaimer')}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={rs.segmentStrip}
        accessibilityRole="tablist"
      >
        {RECORDS_SEGMENTS.map((id) => {
          const active = segment === id;
          const label = t(`segments.${id}`);
          return (
            <Pressable
              key={id}
              style={[rs.segmentPill, active && rs.segmentPillActive]}
              onPress={() => setSegment(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
            >
              <Text
                style={[rs.segmentPillLabel, active && rs.segmentPillLabelActive]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {segment === 'overview' ? (
        <RecordsOverviewPanel
          circleId={circleId}
          token={token}
          onOpenRecord={setOpenRecord}
          onReviewInRound={reviewInRound}
        />
      ) : null}
      {segment === 'contributions' ? (
        <RecordsListPanel kind="contribution" circleId={circleId} token={token} onOpenRecord={setOpenRecord} />
      ) : null}
      {segment === 'payouts' ? (
        <RecordsListPanel kind="payout" circleId={circleId} token={token} onOpenRecord={setOpenRecord} />
      ) : null}
      {segment === 'rounds' ? (
        <RecordsListPanel kind="round" circleId={circleId} token={token} onOpenRecord={setOpenRecord} />
      ) : null}
      {segment === 'documents' ? (
        <StatementDocumentsSection
          circleId={circleId}
          token={token}
          circleName={circleName}
          isOrganizer={isOrganizer}
        />
      ) : null}

      <RecordDetailSheet
        record={openRecord}
        circleId={circleId}
        token={token}
        isOrganizer={isOrganizer}
        onClose={() => setOpenRecord(null)}
        onOpenRecord={setOpenRecord}
        onReviewInRound={reviewInRound}
      />
    </View>
  );
}
