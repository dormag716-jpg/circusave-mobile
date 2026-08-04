/**
 * Circle Records statement center.
 * Financial values come only from backend list/snapshot/PDF endpoints.
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ApiError,
  downloadMemberStatementPdfForHand,
  downloadMemberStatementPdfForUser,
  downloadStatementDocumentPdf,
  getMemberStatementSnapshotForHand,
  getMemberStatementSnapshotForUser,
  getMemberStatementsIndex,
  getStatementDocuments,
  type BackendCircleMember,
  type BackendLedgerEntry,
  type BackendWalletSnapshot,
  type MemberStatementIndexRow,
  type MemberStatementSnapshot,
  type MemberStatementsIndex,
  type StatementDocumentSummary,
  type StatementPeriodInput,
} from '@/lib/api';
import { getInitials } from '@/lib/initials';
import {
  ledgerEventLabel,
  walletStatusLabel,
  walletTransactionLabel,
} from '@/lib/i18n/financial-presentation';
import {
  formatCurrency,
  formatRelativeDate,
} from '@/lib/i18n/formatters';
import { colors, radii, spacing } from '@/lib/theme';
import {
  displayMoney,
  formatDisplayDate,
  formatDisplayDateTime,
  humanizeEventType,
  humanizeStatementLabel,
  humanizeStatus,
  memberContextLabel as buildMemberContextLabel,
  nextContributionDue,
  nextScheduledPayout,
  shortStatementId,
} from '@/lib/statementPresentation';

type RecordsSegment = 'circle' | 'statements' | 'documents';

type Props = {
  circleId: string;
  token: string;
  members: BackendCircleMember[];
  ledgerEntries: BackendLedgerEntry[];
  isPremium: boolean;
  circleName?: string;
  wallet?: BackendWalletSnapshot;
};

type SubjectTarget =
  | { kind: 'user'; userId: string; displayName: string }
  | { kind: 'hand'; handId: string; displayName: string };

type StatementLedgerPreviewEntry = MemberStatementSnapshot['ledger'][number];

function memberContextLabel(
  row: MemberStatementIndexRow,
  unclaimed: boolean,
): string {
  return buildMemberContextLabel({
    handCount: row.handCount,
    roleSummary: row.roleSummary,
    membershipStatus: row.membershipStatus,
    unclaimed,
  });
}

function formatRelativeDays(value?: string | null): string {
  if (!value) return '\u2014';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '\u2014';
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return formatDisplayDate(value);
}

function ledgerIconColor(entry: BackendLedgerEntry): string {
  const t = String(entry.event_type || entry.type || '');
  if (t.includes('payout')) return colors.success;
  if (t.includes('missed') || t.includes('rejected')) return colors.danger;
  if (t.includes('confirmed') || t.includes('submitted')) return colors.primary;
  return colors.muted;
}

function ledgerAmountLabel(entry: BackendLedgerEntry, language: string): string {
  if (typeof entry.amount !== 'number') return '';
  const sign = entry.amount < 0 ? '-' : '';
  return `${sign}${formatCurrency(Math.abs(entry.amount), language, 'USD', 2)}`;
}

function dedupeById<T extends { id: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const entry of entries) {
    const id = String(entry.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(entry);
  }
  return unique;
}

function ledgerRenderKey(
  entry: Pick<BackendLedgerEntry, 'id' | 'created_at' | 'at'>,
  index: number,
): string {
  return `${entry.id}:${entry.created_at || entry.at || 'no-time'}:${index}`;
}

function statementLedgerRenderKey(
  entry: Pick<StatementLedgerPreviewEntry, 'id' | 'at' | 'reference'>,
  index: number,
): string {
  return `${entry.id}:${entry.at || entry.reference || 'no-time'}:${index}`;
}

function entryMemberName(
  entry: BackendLedgerEntry,
  members: BackendCircleMember[],
): string {
  const memberId = String(entry.memberId || entry.metadata?.member_id || '').trim();
  if (!memberId) return '';
  const match = members.find((m) => m.id === memberId || m.userId === memberId);
  return String(match?.full_name || match?.name || '').trim();
}

async function saveAndSharePdf(
  bytes: Uint8Array,
  filename: string,
): Promise<{ uri: string; filename: string }> {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(bytes);
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share CircuSave Member Circle Statement',
      UTI: 'com.adobe.pdf',
    });
  } else {
    Alert.alert(
      'Statement saved',
      `PDF saved on device as ${filename}. Sharing is not available on this device.`,
    );
  }
  return { uri: file.uri, filename };
}

function friendlyError(message: string): string {
  const trimmed = String(message || '').trim();
  if (!trimmed) return 'Something went wrong. Please try again.';
  if (trimmed.length > 160) return 'Something went wrong. Please try again.';
  return trimmed;
}

export function RecordsStatementCenter({
  circleId,
  token,
  members,
  ledgerEntries,
  isPremium,
  circleName,
  wallet,
}: Props) {
  const [segment, setSegment] = useState<RecordsSegment>('statements');
  const [index, setIndex] = useState<MemberStatementsIndex | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);

  const [periodMode, setPeriodMode] = useState<'full_circle' | 'custom'>('full_circle');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<MemberStatementSnapshot | null>(null);
  const [activeSubject, setActiveSubject] = useState<SubjectTarget | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [documents, setDocuments] = useState<StatementDocumentSummary[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [sharingDocId, setSharingDocId] = useState<string | null>(null);

  const resolvedCircleName =
    index?.circle.name || circleName || 'this circle';

  const periodInput: StatementPeriodInput = useMemo(() => {
    if (periodMode === 'custom') {
      return { period: 'custom', from: periodFrom.trim(), to: periodTo.trim() };
    }
    return { period: 'full_circle' };
  }, [periodMode, periodFrom, periodTo]);

  const loadIndex = useCallback(async () => {
    if (!token || !circleId) return;
    setIndexLoading(true);
    setIndexError(null);
    try {
      const payload = await getMemberStatementsIndex(token, circleId);
      setIndex(payload);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not load member statements.';
      setIndexError(message);
      setIndex(null);
    } finally {
      setIndexLoading(false);
    }
  }, [token, circleId]);

  const loadDocuments = useCallback(async () => {
    if (!token || !circleId) return;
    setDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const payload = await getStatementDocuments(token, circleId);
      setDocuments(payload.documents || []);
    } catch (err) {
      setDocumentsError(
        err instanceof Error ? err.message : 'Could not load statement documents.',
      );
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
    }
  }, [token, circleId]);

  useEffect(() => {
    if (segment === 'statements') {
      void loadIndex();
    }
    if (segment === 'documents') {
      void loadDocuments();
    }
  }, [segment, loadIndex, loadDocuments]);

  const openPreview = async (subject: SubjectTarget) => {
    if (periodMode === 'custom' && (!periodFrom.trim() || !periodTo.trim())) {
      Alert.alert(
        'Date range required',
        'Enter both from and to dates (YYYY-MM-DD) for a custom statement period.',
      );
      return;
    }
    setActiveSubject(subject);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setSnapshot(null);
    try {
      const data =
        subject.kind === 'user'
          ? await getMemberStatementSnapshotForUser(
              token,
              circleId,
              subject.userId,
              periodInput,
            )
          : await getMemberStatementSnapshotForHand(
              token,
              circleId,
              subject.handId,
              periodInput,
            );
      setSnapshot(data);
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : 'Could not load statement preview.',
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadSharePdf = async () => {
    if (!activeSubject) return;
    setPdfLoading(true);
    try {
      const pdf =
        activeSubject.kind === 'user'
          ? await downloadMemberStatementPdfForUser(
              token,
              circleId,
              activeSubject.userId,
              periodInput,
            )
          : await downloadMemberStatementPdfForHand(
              token,
              circleId,
              activeSubject.handId,
              periodInput,
            );
      await saveAndSharePdf(pdf.bytes, pdf.filename);
      void loadDocuments();
    } catch (err) {
      Alert.alert(
        'PDF unavailable',
        err instanceof Error ? err.message : 'Could not download the statement PDF.',
      );
    } finally {
      setPdfLoading(false);
    }
  };

  const reShareDocument = async (doc: StatementDocumentSummary) => {
    setSharingDocId(doc.id);
    try {
      const pdf = await downloadStatementDocumentPdf(token, circleId, doc.id);
      await saveAndSharePdf(pdf.bytes, pdf.filename);
    } catch (err) {
      Alert.alert(
        'Share failed',
        err instanceof Error ? err.message : 'Could not download this document.',
      );
    } finally {
      setSharingDocId(null);
    }
  };

  const segments = [
    { id: 'circle' as const, label: 'Circle Overview' },
    { id: 'statements' as const, label: 'Member Statements' },
    { id: 'documents' as const, label: 'Documents' },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Records</Text>
        <Text style={styles.pageCircleName} numberOfLines={1}>
          {resolvedCircleName === 'this circle' ? 'Circle' : resolvedCircleName}
        </Text>
        <Text style={styles.pageSubtitle}>
          Statements, activity, and circle documents
        </Text>
        <Text style={styles.pageDisclaimer}>
          Statements are for CircuSave activity tracking only and are not bank, tax,
          legal, or income documents.
        </Text>
      </View>

      <View
        style={styles.segmentControl}
        accessibilityRole="tablist"
      >
        {segments.map((item) => {
          const active = segment === item.id;
          return (
            <Pressable
              key={item.id}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
              onPress={() => setSegment(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
            >
              <Text
                style={[styles.segmentLabel, active && styles.segmentLabelActive]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {segment === 'circle' ? (
        <CircleRecordsPanel
          entries={ledgerEntries}
          members={members}
          isPremium={isPremium}
          wallet={wallet}
        />
      ) : null}

      {segment === 'statements' ? (
        <MemberStatementsPanel
          circleName={
            resolvedCircleName === 'this circle'
              ? 'this circle'
              : resolvedCircleName
          }
          index={index}
          loading={indexLoading}
          error={indexError}
          onRetry={() => void loadIndex()}
          periodMode={periodMode}
          periodFrom={periodFrom}
          periodTo={periodTo}
          onPeriodMode={setPeriodMode}
          onPeriodFrom={setPeriodFrom}
          onPeriodTo={setPeriodTo}
          onOpenPreview={(row) => {
            if (row.userId) {
              void openPreview({
                kind: 'user',
                userId: row.userId,
                displayName: row.displayName,
              });
            } else if (row.handId) {
              void openPreview({
                kind: 'hand',
                handId: row.handId,
                displayName: row.displayName,
              });
            }
          }}
        />
      ) : null}

      {segment === 'documents' ? (
        <DocumentsPanel
          documents={documents}
          loading={documentsLoading}
          error={documentsError}
          sharingDocId={sharingDocId}
          onRefresh={() => void loadDocuments()}
          onShare={(doc) => void reShareDocument(doc)}
          onGoStatements={() => setSegment('statements')}
        />
      ) : null}

      <Modal
        visible={previewOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <SafeAreaView style={styles.modalRoot} edges={['top', 'left', 'right', 'bottom']}>
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => setPreviewOpen(false)}
              style={styles.modalClose}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
            >
              <FontAwesome name="close" size={18} color={colors.textStrong} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.modalKicker}>Member Activity Statement</Text>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {activeSubject?.displayName || 'Member'}
              </Text>
              <Text style={styles.modalSubtitle} numberOfLines={1}>
                {resolvedCircleName === 'this circle' ? 'Circle' : resolvedCircleName}
              </Text>
            </View>
          </View>

          {previewLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.stateTitle}>Loading statement</Text>
              <Text style={styles.stateBody}>
                Preparing a permission-filtered preview for this circle.
              </Text>
            </View>
          ) : previewError ? (
            <View style={styles.stateCard}>
              <View style={styles.stateIconWrap}>
                <FontAwesome name="exclamation" size={18} color={colors.warning} />
              </View>
              <Text style={styles.stateTitle}>Could not load preview</Text>
              <Text style={styles.stateBody}>{friendlyError(previewError)}</Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => activeSubject && void openPreview(activeSubject)}
                accessibilityRole="button"
                accessibilityLabel="Retry loading statement"
              >
                <Text style={styles.primaryBtnText}>Try again</Text>
              </Pressable>
            </View>
          ) : snapshot ? (
            <>
              <ScrollView
                contentContainerStyle={styles.previewScroll}
                showsVerticalScrollIndicator={false}
              >
                <PreviewBody snapshot={snapshot} />
              </ScrollView>
              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.primaryBtn, pdfLoading && styles.btnDisabled]}
                  onPress={() => void downloadSharePdf()}
                  disabled={pdfLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Download PDF"
                  accessibilityState={{ busy: pdfLoading, disabled: pdfLoading }}
                >
                  {pdfLoading ? (
                    <ActivityIndicator color={colors.onColor} />
                  ) : (
                    <>
                      <FontAwesome name="download" size={14} color={colors.onColor} />
                      <Text style={styles.primaryBtnText}>Download PDF</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, pdfLoading && styles.btnDisabled]}
                  onPress={() => void downloadSharePdf()}
                  disabled={pdfLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Share PDF"
                  accessibilityState={{ busy: pdfLoading, disabled: pdfLoading }}
                >
                  <FontAwesome name="share" size={14} color={colors.primary} />
                  <Text style={styles.secondaryBtnText}>Share PDF</Text>
                </Pressable>
                <Text style={styles.footerHint}>
                  PDF uses the same backend snapshot shown above.
                </Text>
              </View>
            </>
          ) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function CircleRecordsPanel({
  entries,
  members,
  isPremium,
  wallet,
}: {
  entries: BackendLedgerEntry[];
  members: BackendCircleMember[];
  isPremium: boolean;
  wallet?: BackendWalletSnapshot;
}) {
  const { t, i18n } = useTranslation(['ledger', 'wallet']);
  const language = i18n.resolvedLanguage || i18n.language;
  const uniqueEntries = useMemo(() => dedupeById(entries), [entries]);
  const visibleEntries = isPremium ? uniqueEntries : uniqueEntries.slice(0, 10);
  const hasMore = !isPremium && uniqueEntries.length > 10;

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.iconBubble}>
          <FontAwesome name="line-chart" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle}>Circle activity</Text>
          <Text style={styles.panelSub}>
            {t('ledger:eventCount', { count: uniqueEntries.length })}
          </Text>
        </View>
      </View>

      {uniqueEntries.length === 0 ? (
        <View style={styles.emptyBlock}>
          <View style={styles.emptyIcon}>
            <FontAwesome name="book" size={22} color={colors.subtle} />
          </View>
          <Text style={styles.emptyTitle}>{t('ledger:empty')}</Text>
          <Text style={styles.emptyBody}>
            Contribution and payout activity for this circle will appear here.
          </Text>
        </View>
      ) : (
        visibleEntries.map((entry, index) => (
          <View key={ledgerRenderKey(entry, index)}>
            <View style={styles.ledgerRow}>
              <View
                style={[
                  styles.ledgerIcon,
                  { backgroundColor: `${ledgerIconColor(entry)}18` },
                ]}
              >
                <FontAwesome name="circle" size={9} color={ledgerIconColor(entry)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{ledgerEventLabel(entry, t)}</Text>
                <Text style={styles.rowMeta}>
                  {entryMemberName(entry, members)}
                  {entryMemberName(entry, members) ? ' \u00B7 ' : ''}
                  {t('ledger:round', { round: entry.round || '\u2014' })}
                  {' \u00B7 '}
                  {entry.created_at || entry.at
                    ? formatRelativeDate(
                        entry.created_at || entry.at || '',
                        language,
                      )
                    : '\u2014'}
                </Text>
              </View>
              {typeof entry.amount === 'number' ? (
                <Text style={[styles.rowAmount, { color: ledgerIconColor(entry) }]}>
                  {ledgerAmountLabel(entry, language)}
                </Text>
              ) : null}
            </View>
            {index < visibleEntries.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))
      )}

      {hasMore ? (
        <View style={styles.upgradeBox}>
          <FontAwesome name="lock" size={18} color={colors.primary} />
          <Text style={styles.upgradeTitle}>{t('ledger:upgradeTitle')}</Text>
          <Text style={styles.upgradeBody}>
            {t('ledger:upgradeBody', { count: entries.length - 10 })}
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push('/subscription')}
          >
            <Text style={styles.primaryBtnText}>{t('ledger:upgradeAction')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.panelHeader, { marginTop: 12 }]}>
        <View style={styles.iconBubble}>
          <FontAwesome name="credit-card" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle}>{t('wallet:history')}</Text>
          <Text style={styles.panelSub}>{t('wallet:title')}</Text>
        </View>
      </View>
      {!wallet?.txns?.length ? (
        <View style={styles.emptyBlock}>
          <View style={styles.emptyIcon}>
            <FontAwesome name="exchange" size={22} color={colors.subtle} />
          </View>
          <Text style={styles.emptyTitle}>{t('wallet:empty')}</Text>
        </View>
      ) : (
        wallet.txns.map((transaction, index) => {
          const amount =
            typeof transaction.amount === 'number'
              ? transaction.amount
              : typeof transaction.amountCents === 'number'
                ? transaction.amountCents / 100
                : null;
          const type = walletTransactionLabel(transaction, t);
          const status = walletStatusLabel(transaction.status, t);
          return (
            <View
              key={transaction.id || `transaction-${index}`}
              style={styles.ledgerRow}
              accessibilityLabel={t('wallet:transactionA11y', {
                type,
                status,
                amount:
                  amount == null
                    ? t('wallet:rowUnavailable')
                    : formatCurrency(amount, language, 'USD', 2),
              })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{type}</Text>
                <Text style={styles.rowMeta}>{status}</Text>
              </View>
              <Text style={styles.rowAmount}>
                {amount == null
                  ? '\u2014'
                  : formatCurrency(amount, language, 'USD', 2)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}

function MemberStatementsPanel({
  circleName,
  index,
  loading,
  error,
  onRetry,
  periodMode,
  periodFrom,
  periodTo,
  onPeriodMode,
  onPeriodFrom,
  onPeriodTo,
  onOpenPreview,
}: {
  circleName: string;
  index: MemberStatementsIndex | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  periodMode: 'full_circle' | 'custom';
  periodFrom: string;
  periodTo: string;
  onPeriodMode: (mode: 'full_circle' | 'custom') => void;
  onPeriodFrom: (value: string) => void;
  onPeriodTo: (value: string) => void;
  onOpenPreview: (row: MemberStatementIndexRow) => void;
}) {
  const customIncomplete =
    periodMode === 'custom' && (!periodFrom.trim() || !periodTo.trim());

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.panelTitle}>Member Statements</Text>
          <Text style={styles.panelSub}>
            View contribution and payout activity for members of {circleName}.
            {'\n'}
            Each statement is limited to this circle.
          </Text>
          <Text style={styles.panelHint}>
            One row per connected member. Each hand remains a separate financial
            position in the statement.
          </Text>
        </View>
        <Pressable
          onPress={onRetry}
          style={styles.refreshBtn}
          accessibilityRole="button"
          accessibilityLabel="Refresh member statements"
        >
          <FontAwesome name="refresh" size={14} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.periodCard}>
        <Text style={styles.periodLabel}>Period</Text>
        <View style={styles.periodToggleRow}>
          <Pressable
            style={[
              styles.periodToggle,
              periodMode === 'full_circle' && styles.periodToggleActive,
            ]}
            onPress={() => onPeriodMode('full_circle')}
            accessibilityRole="button"
            accessibilityState={{ selected: periodMode === 'full_circle' }}
            accessibilityLabel="Full circle period"
          >
            <Text
              style={[
                styles.periodToggleText,
                periodMode === 'full_circle' && styles.periodToggleTextActive,
              ]}
            >
              Full circle
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.periodToggle,
              periodMode === 'custom' && styles.periodToggleActive,
            ]}
            onPress={() => onPeriodMode('custom')}
            accessibilityRole="button"
            accessibilityState={{ selected: periodMode === 'custom' }}
            accessibilityLabel="Custom range period"
          >
            <Text
              style={[
                styles.periodToggleText,
                periodMode === 'custom' && styles.periodToggleTextActive,
              ]}
            >
              Custom range
            </Text>
          </Pressable>
        </View>
        {periodMode === 'full_circle' ? (
          <Text style={styles.periodHelper}>
            Includes all available activity in this circle.
          </Text>
        ) : (
          <>
            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>From</Text>
                <TextInput
                  value={periodFrom}
                  onChangeText={onPeriodFrom}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.subtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="numbers-and-punctuation"
                  style={styles.dateInput}
                  accessibilityLabel="Period from date"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>To</Text>
                <TextInput
                  value={periodTo}
                  onChangeText={onPeriodTo}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.subtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="numbers-and-punctuation"
                  style={styles.dateInput}
                  accessibilityLabel="Period to date"
                />
              </View>
            </View>
            {customIncomplete ? (
              <Text style={styles.periodWarning}>
                Enter both from and to dates to open a statement.
              </Text>
            ) : (
              <Text style={styles.periodHelper}>
                Filters activity in this circle to the selected dates.
              </Text>
            )}
          </>
        )}
      </View>

      {loading ? (
        <View style={styles.stateCardCompact}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateTitle}>Loading members</Text>
          <Text style={styles.stateBody}>Fetching statement subjects for this circle.</Text>
          <View style={styles.skeletonList}>
            <View style={styles.skeletonRow} />
            <View style={styles.skeletonRow} />
            <View style={[styles.skeletonRow, { width: '78%' }]} />
          </View>
        </View>
      ) : error ? (
        <View style={styles.stateCardCompact}>
          <View style={styles.stateIconWrap}>
            <FontAwesome name="exclamation" size={16} color={colors.warning} />
          </View>
          <Text style={styles.stateTitle}>Could not load members</Text>
          <Text style={styles.stateBody}>{friendlyError(error)}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry loading members"
          >
            <Text style={styles.primaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : !index || (index.members.length === 0 && index.unclaimedHands.length === 0) ? (
        <View style={styles.emptyBlock}>
          <View style={styles.emptyIcon}>
            <FontAwesome name="users" size={22} color={colors.subtle} />
          </View>
          <Text style={styles.emptyTitle}>No members to show yet</Text>
          <Text style={styles.emptyBody}>
            Connected members of this circle will appear here when memberships are
            available.
          </Text>
        </View>
      ) : (
        <View style={styles.memberList}>
          {index.members.map((row) => (
            <MemberRow key={row.subjectKey} row={row} onPress={() => onOpenPreview(row)} />
          ))}

          {index.unclaimedHands.length > 0 ? (
            <View style={styles.unclaimedSection}>
              <Text style={styles.unclaimedTitle}>Unclaimed hands</Text>
              <Text style={styles.unclaimedSub}>
                Planned hands that have not yet been connected to a member.
              </Text>
              {index.unclaimedHands.map((row) => (
                <MemberRow
                  key={row.subjectKey}
                  row={row}
                  onPress={() => onOpenPreview(row)}
                  unclaimed
                />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function MemberRow({
  row,
  onPress,
  unclaimed,
}: {
  row: MemberStatementIndexRow;
  onPress: () => void;
  unclaimed?: boolean;
}) {
  const initials = getInitials(row.displayName);
  const contextLabel = memberContextLabel(row, Boolean(unclaimed));
  return (
    <Pressable
      style={[styles.memberRow, unclaimed && styles.memberRowUnclaimed]}
      onPress={onPress}
      disabled={!row.canRequestStatement}
      accessibilityRole="button"
      accessibilityLabel={`Open statement for ${row.displayName}`}
      accessibilityHint="Opens the statement preview"
      accessibilityState={{ disabled: !row.canRequestStatement }}
    >
      <View style={[styles.avatar, unclaimed && styles.avatarUnclaimed]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.memberBody}>
        <View style={styles.memberHeadingRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.memberName} numberOfLines={1}>
              {row.displayName}
            </Text>
            <Text style={styles.rowMeta}>{contextLabel}</Text>
          </View>
          <View style={styles.rowChevron}>
            <FontAwesome name="chevron-right" size={13} color={colors.subtle} />
          </View>
        </View>
        <View style={styles.totalsList}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Contributed</Text>
            <Text style={styles.totalValue}>
              {displayMoney(row.totals.contributedDisplay)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Received</Text>
            <Text style={styles.totalValue}>
              {displayMoney(row.totals.receivedDisplay)}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function DocumentsPanel({
  documents,
  loading,
  error,
  sharingDocId,
  onRefresh,
  onShare,
  onGoStatements,
}: {
  documents: StatementDocumentSummary[];
  loading: boolean;
  error: string | null;
  sharingDocId: string | null;
  onRefresh: () => void;
  onShare: (doc: StatementDocumentSummary) => void;
  onGoStatements: () => void;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle}>Documents</Text>
          <Text style={styles.panelSub}>
            Previously generated statements for this circle. Re-download from the
            frozen snapshot.
          </Text>
        </View>
        <Pressable
          onPress={onRefresh}
          style={styles.refreshBtn}
          accessibilityRole="button"
          accessibilityLabel="Refresh documents"
        >
          <FontAwesome name="refresh" size={14} color={colors.primary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.stateCardCompact}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateTitle}>Loading documents</Text>
        </View>
      ) : error ? (
        <View style={styles.stateCardCompact}>
          <Text style={styles.stateTitle}>Could not load documents</Text>
          <Text style={styles.stateBody}>{friendlyError(error)}</Text>
          <Pressable style={styles.primaryBtn} onPress={onRefresh}>
            <Text style={styles.primaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : documents.length === 0 ? (
        <View style={styles.emptyBlock}>
          <View style={styles.emptyIcon}>
            <FontAwesome name="folder-open-o" size={22} color={colors.subtle} />
          </View>
          <Text style={styles.emptyTitle}>No documents yet</Text>
          <Text style={styles.emptyBody}>
            When you download a Member Circle Statement PDF, CircuSave stores a
            permission-filtered snapshot so you can re-download it later.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={onGoStatements}>
            <Text style={styles.primaryBtnText}>Open Member Statements</Text>
          </Pressable>
        </View>
      ) : (
        documents.map((doc) => (
          <View key={doc.id} style={styles.docRow}>
            <View style={styles.docIcon}>
              <FontAwesome name="file-pdf-o" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.memberName} numberOfLines={1}>
                {doc.memberDisplayName || 'Member'}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={2}>
                {doc.period?.label || 'Unavailable'}
                {' \u00B7 '}
                {formatRelativeDays(doc.generatedAt)}
              </Text>
              <Text style={styles.docReference} numberOfLines={1}>
                {doc.statementReference}
              </Text>
            </View>
            <Pressable
              style={[
                styles.docShareBtn,
                sharingDocId === doc.id && styles.btnDisabled,
              ]}
              onPress={() => onShare(doc)}
              disabled={sharingDocId === doc.id}
              accessibilityRole="button"
              accessibilityLabel={`Share statement for ${doc.memberDisplayName || 'member'}`}
            >
              {sharingDocId === doc.id ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <FontAwesome name="share" size={14} color={colors.primary} />
              )}
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

function ExpandableSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.expandCard}>
      <Pressable
        style={styles.expandHeader}
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
      >
        <Text style={styles.expandTitle}>{title}</Text>
        <FontAwesome
          name={open ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={colors.muted}
        />
      </Pressable>
      {open ? <View style={styles.expandBody}>{children}</View> : null}
    </View>
  );
}

function PreviewBody({ snapshot }: { snapshot: MemberStatementSnapshot }) {
  const uniqueLedgerEntries = useMemo(
    () => dedupeById(snapshot.ledger || []),
    [snapshot.ledger],
  );

  const memberName = snapshot.member.displayName || 'Member';
  const circleLabel = snapshot.circle.name || 'Circle';
  const periodLabel = snapshot.period.label || 'Unavailable';
  const handCount = snapshot.circleParticipation.memberHandCount;
  const statementId = shortStatementId(snapshot.statementReference);

  const allReceivedPayouts = useMemo(
    () =>
      snapshot.hands.flatMap((hand) =>
        (hand.payouts.received || []).map((payout) => ({
          ...payout,
          handLabel: hand.displayLabel,
        })),
      ),
    [snapshot.hands],
  );

  return (
    <View style={styles.previewRoot}>
      <View style={styles.previewHero}>
        <Text style={styles.previewBrand}>CircuSave</Text>
        <Text style={styles.previewTitle}>Member Activity Statement</Text>
        <Text style={styles.previewMember}>{memberName}</Text>
        <Text style={styles.previewMetaLine}>{circleLabel}</Text>
        <Text style={styles.previewDisclaimer}>
          {snapshot.verification.disclaimer ||
            'For CircuSave activity tracking only. Not a bank, tax, legal, or income document.'}
        </Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryCardTitle}>Summary</Text>
        <View style={styles.summaryMetrics}>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryMetricLabel}>Contributed</Text>
            <Text style={styles.summaryMetricValue}>
              {displayMoney(snapshot.memberTotals.totalContributedDisplay)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryMetricLabel}>Received</Text>
            <Text style={styles.summaryMetricValue}>
              {displayMoney(snapshot.memberTotals.totalReceivedDisplay)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryMetric}>
            {/* Outstanding = remainingObligations* presentation label only */}
            <Text style={styles.summaryMetricLabel}>Outstanding</Text>
            <Text style={styles.summaryMetricValue}>
              {displayMoney(snapshot.memberTotals.remainingObligationsDisplay)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.metaCard}>
        <MetaLine label="Circle" value={circleLabel} />
        <MetaLine label="Member" value={memberName} />
        <MetaLine label="Statement period" value={periodLabel} />
        <MetaLine
          label="Membership status"
          value={humanizeStatus(snapshot.member.membershipStatus)}
        />
        <MetaLine
          label="Hands"
          value={`${handCount} hand${handCount === 1 ? '' : 's'}`}
          last
        />
      </View>

      <Text style={styles.sectionLabel}>Hands</Text>
      <Text style={styles.sectionHint}>
        Each hand is a separate financial position. Positions are never merged.
      </Text>
      {snapshot.hands.map((hand, handIndex) => {
        const nextDue = nextContributionDue(hand.contributions.byRound);
        const nextPayout = nextScheduledPayout(hand.payouts.scheduled);
        return (
          <View key={hand.handId} style={styles.handCard}>
            <View style={styles.handHeader}>
              <Text style={styles.handTitle} numberOfLines={2}>
                Hand {hand.handNumber || handIndex + 1}
              </Text>
              <View style={styles.positionBadge}>
                <Text style={styles.positionBadgeText}>
                  Payout position{' '}
                  {hand.payoutPosition === 'Unavailable'
                    ? '\u2014'
                    : String(hand.payoutPosition)}
                </Text>
              </View>
            </View>
            {hand.displayLabel ? (
              <Text style={styles.rowMeta} numberOfLines={1}>
                {hand.displayLabel}
              </Text>
            ) : null}
            {!hand.isParticipating ? (
              <Text style={styles.rowMeta}>Not participating</Text>
            ) : null}

            <View style={styles.handMetrics}>
              <Metric
                label="Confirmed contributions"
                value={displayMoney(hand.contributions.confirmedDisplay)}
              />
              <Metric
                label="Pending contributions"
                value={displayMoney(hand.contributions.pendingDisplay)}
              />
              <Metric label="Missed" value={displayMoney(hand.contributions.missedDisplay)} />
              <Metric
                label="Rejected"
                value={displayMoney(hand.contributions.rejectedDisplay)}
              />
              <Metric
                label="Payouts received"
                value={displayMoney(hand.payouts.receivedDisplay)}
              />
              <Metric
                label="Outstanding"
                value={displayMoney(hand.remainingObligationsDisplay)}
              />
            </View>

            {nextPayout ? (
              <Text style={styles.nextLine}>
                Next scheduled payout: Round {nextPayout.roundNumber}
                {' \u00B7 '}
                {displayMoney(nextPayout.amountDisplay)}
                {nextPayout.dueDate
                  ? ` \u00B7 ${formatDisplayDate(nextPayout.dueDate)}`
                  : ''}
              </Text>
            ) : null}
            {nextDue ? (
              <Text style={styles.nextLine}>
                Next contribution due: Round {nextDue.roundNumber}
                {' \u00B7 '}
                {displayMoney(nextDue.expectedDisplay)}
                {nextDue.dueDate ? ` \u00B7 ${formatDisplayDate(nextDue.dueDate)}` : ''}
              </Text>
            ) : null}

            {(hand.contributions.byRound || []).length > 0 ? (
              <>
                <Text style={styles.miniLabel}>Contribution history</Text>
                {hand.contributions.byRound.map((r) => (
                  <View key={r.contributionId} style={styles.roundRow}>
                    <Text style={styles.roundTitle}>Round {r.roundNumber}</Text>
                    <Text style={styles.roundMeta}>
                      {humanizeStatus(r.status)}
                    </Text>
                    <Text style={styles.roundAmount}>
                      {displayMoney(r.paidDisplay)}
                      {r.status !== 'confirmed'
                        ? ` of ${displayMoney(r.expectedDisplay)}`
                        : ''}
                    </Text>
                    <Text style={styles.roundMeta}>
                      {formatDisplayDate(
                        r.confirmedAt || r.submittedAt || r.dueDate,
                      )}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        );
      })}

      <Text style={styles.sectionLabel}>Payout history</Text>
      {allReceivedPayouts.length === 0 ? (
        <View style={styles.emptyInline}>
          <Text style={styles.emptyTitle}>No payouts received yet</Text>
          <Text style={styles.emptyBody}>
            Payouts for this member in this circle will appear here when posted.
          </Text>
        </View>
      ) : (
        allReceivedPayouts.map((payout) => (
          <View key={payout.payoutId} style={styles.roundRow}>
            <Text style={styles.roundTitle}>
              {payout.roundNumber != null
                ? `Round ${payout.roundNumber}`
                : 'Payout'}
            </Text>
            <Text style={styles.roundMeta}>
              {humanizeStatus(payout.status)}
              {' \u00B7 '}
              {payout.handLabel}
            </Text>
            <Text style={styles.roundAmount}>
              {displayMoney(payout.amountDisplay)}
            </Text>
            <Text style={styles.roundMeta}>
              {formatDisplayDate(payout.paidAt)}
            </Text>
          </View>
        ))
      )}

      <ExpandableSection title="Activity details">
        {uniqueLedgerEntries.length === 0 ? (
          <Text style={styles.sectionHint}>
            No related activity for this period.
          </Text>
        ) : (
          uniqueLedgerEntries.slice(0, 50).map((entry, index) => (
            <View
              key={statementLedgerRenderKey(entry, index)}
              style={styles.ledgerPreviewRow}
            >
              <Text style={styles.rowTitle}>
                {humanizeEventType(entry.eventType)}
              </Text>
              <Text style={styles.rowMeta}>
                {formatDisplayDateTime(entry.at)}
                {entry.roundNumber != null ? ` \u00B7 Round ${entry.roundNumber}` : ''}
                {' \u00B7 '}
                {displayMoney(entry.amountDisplay)}
              </Text>
            </View>
          ))
        )}
      </ExpandableSection>

      <ExpandableSection title="Statement verification">
        <Text style={styles.sectionHint}>
          Statement ID: {statementId}
        </Text>
        <Text style={styles.sectionHint}>
          Generated: {formatDisplayDateTime(snapshot.generatedAt)}
        </Text>
        <Text style={styles.sectionHint}>
          Source: {snapshot.verification.dataSource || 'backend_snapshot'}
        </Text>
        {snapshot.verification.contentFingerprint ? (
          <Text style={styles.sectionHint}>
            Fingerprint: {snapshot.verification.contentFingerprint}
          </Text>
        ) : null}
        <Text style={styles.sectionHint}>
          Full reference: {snapshot.statementReference || 'Unavailable'}
        </Text>
        <Text style={styles.sectionHint}>
          {snapshot.verification.footerText ||
            'Verified against CircuSave backend records for this circle.'}
        </Text>
      </ExpandableSection>
    </View>
  );
}

function MetaLine({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.metaLine, last && styles.metaLineLast]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
  },
  pageHeader: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 4,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.textStrong,
    letterSpacing: -0.4,
  },
  pageCircleName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primaryDark,
    marginTop: 2,
  },
  pageSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 20,
  },
  pageDisclaimer: {
    fontSize: 11,
    color: colors.subtle,
    marginTop: 10,
    lineHeight: 16,
  },
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 4,
    gap: 2,
  },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  segmentItemActive: {
    backgroundColor: colors.card,
    shadowColor: colors.textStrong,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textAlign: 'center',
  },
  segmentLabelActive: {
    color: colors.textStrong,
  },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    gap: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textStrong,
    letterSpacing: -0.2,
  },
  panelSub: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 19,
  },
  panelHint: {
    fontSize: 12,
    color: colors.subtle,
    marginTop: 8,
    lineHeight: 17,
  },
  periodCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 10,
  },
  periodLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textStrong,
    letterSpacing: 0.2,
  },
  periodToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  periodToggle: {
    flex: 1,
    minHeight: 42,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodToggleActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  periodToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  periodToggleTextActive: {
    color: colors.primaryDark,
  },
  periodHelper: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  periodWarning: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: '600',
    lineHeight: 17,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 6,
  },
  dateInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textStrong,
    minHeight: 46,
  },
  memberList: {
    gap: 10,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: 48,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    backgroundColor: colors.card,
  },
  memberRowUnclaimed: {
    backgroundColor: colors.background,
    borderStyle: 'dashed',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarUnclaimed: {
    backgroundColor: colors.subtle,
  },
  avatarText: {
    color: colors.onColor,
    fontWeight: '800',
    fontSize: 13,
  },
  memberBody: {
    flex: 1,
    minWidth: 0,
  },
  memberHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  rowChevron: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
    marginRight: -4,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textStrong,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textStrong,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 16,
  },
  totalsList: {
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textStrong,
    textAlign: 'right',
  },
  unclaimedSection: {
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: 10,
  },
  unclaimedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textStrong,
  },
  unclaimedSub: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
    marginBottom: 2,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  ledgerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textStrong,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceMuted,
    marginLeft: 44,
  },
  upgradeBox: {
    marginTop: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    gap: 8,
  },
  upgradeTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.textStrong,
  },
  upgradeBody: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textStrong,
  },
  emptyBody: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  stateCard: {
    margin: spacing.screenX,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  stateCardCompact: {
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  stateIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textStrong,
    textAlign: 'center',
  },
  stateBody: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
  skeletonList: {
    width: '100%',
    gap: 8,
    marginTop: 8,
  },
  skeletonRow: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.cardBorder,
    width: '100%',
  },
  primaryBtn: {
    marginTop: 4,
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: colors.onColor,
    fontWeight: '800',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docReference: {
    fontSize: 11,
    color: colors.subtle,
    marginTop: 2,
  },
  docShareBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.screenX,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  modalClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.3,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textStrong,
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginTop: 1,
  },
  secondaryBtn: {
    minHeight: 48,
    borderRadius: radii.pill,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  secondaryBtnText: {
    color: colors.primaryDark,
    fontWeight: '800',
    fontSize: 14,
  },
  expandCard: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  expandHeader: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  expandTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textStrong,
  },
  expandBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
  },
  nextLine: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryDark,
    lineHeight: 17,
  },
  roundAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textStrong,
    marginTop: 2,
  },
  emptyInline: {
    backgroundColor: colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    gap: 6,
    marginBottom: 8,
  },
  previewScroll: {
    padding: spacing.screenX,
    paddingBottom: 40,
  },
  modalFooter: {
    padding: spacing.screenX,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.card,
    gap: 8,
  },
  footerHint: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
  previewRoot: {
    gap: 4,
  },
  previewHero: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 18,
    marginBottom: 12,
  },
  previewBrand: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  previewTitle: {
    color: colors.textStrong,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  previewMember: {
    color: colors.textStrong,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
    letterSpacing: -0.3,
  },
  previewMetaLine: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  previewDisclaimer: {
    color: colors.subtle,
    fontSize: 11,
    marginTop: 12,
    lineHeight: 16,
  },
  summaryCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  summaryCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryDark,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  summaryMetrics: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  summaryMetric: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  summaryMetricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  summaryMetricValue: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.textStrong,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.primaryBorder,
    marginVertical: 2,
  },
  summaryFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.primaryBorder,
  },
  summaryFooterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  metaCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 8,
    overflow: 'hidden',
  },
  metaLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
  },
  metaLineLast: {
    borderBottomWidth: 0,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    flex: 0.4,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textStrong,
    flex: 0.6,
    textAlign: 'right',
  },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 4,
    fontSize: 15,
    fontWeight: '900',
    color: colors.textStrong,
  },
  sectionHint: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
    marginBottom: 10,
  },
  handCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    marginBottom: 10,
  },
  handHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  handTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.textStrong,
  },
  positionBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  positionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  handMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricCell: {
    width: '47%',
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textStrong,
    marginTop: 2,
  },
  miniLabel: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  roundRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
  },
  roundTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textStrong,
  },
  roundMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 16,
  },
  ledgerPreviewRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
  },
  verificationCard: {
    marginTop: 16,
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
});
