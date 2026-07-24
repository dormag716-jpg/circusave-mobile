/**
 * Circle Records statement center.
 * Financial values come only from backend list/snapshot/PDF endpoints.
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  type MemberStatementIndexRow,
  type MemberStatementSnapshot,
  type MemberStatementsIndex,
  type StatementDocumentSummary,
  type StatementPeriodInput,
} from '@/lib/api';
import { getInitials } from '@/lib/initials';
import { colors, radii, spacing } from '@/lib/theme';

type RecordsSegment = 'circle' | 'statements' | 'documents';

type Props = {
  circleId: string;
  token: string;
  members: BackendCircleMember[];
  ledgerEntries: BackendLedgerEntry[];
  isPremium: boolean;
  circleName?: string;
};

type SubjectTarget =
  | { kind: 'user'; userId: string; displayName: string }
  | { kind: 'hand'; handId: string; displayName: string };

type StatementLedgerPreviewEntry = MemberStatementSnapshot['ledger'][number];

function displayMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  if (value === 'Unavailable') return 'Unavailable';
  if (typeof value === 'string') return value;
  return 'Unavailable';
}

function formatRelativeDays(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function ledgerTitle(entry: BackendLedgerEntry): string {
  const type = String(entry.event_type || entry.type || 'activity').replace(/_/g, ' ');
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function ledgerIconColor(entry: BackendLedgerEntry): string {
  const t = String(entry.event_type || entry.type || '');
  if (t.includes('payout')) return colors.success;
  if (t.includes('missed') || t.includes('rejected')) return colors.danger;
  if (t.includes('confirmed') || t.includes('submitted')) return colors.primary;
  return colors.muted;
}

function ledgerAmountLabel(entry: BackendLedgerEntry): string {
  if (typeof entry.amount !== 'number') return '';
  const sign = entry.amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(entry.amount).toFixed(2)}`;
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

export function RecordsStatementCenter({
  circleId,
  token,
  members,
  ledgerEntries,
  isPremium,
  circleName,
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
      // Refresh server-backed Documents list after successful generation.
      void loadDocuments();
      if (segment !== 'documents') {
        // Soft nudge only via state; user can open Documents tab.
      }
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

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <Text style={styles.heroKicker}>AI SUSU · STATEMENT CENTER</Text>
        <Text style={styles.heroTitle}>Records</Text>
        <Text style={styles.heroSub}>
          {circleName || 'Circle'} · Backend-verified member statements
        </Text>
        <Text style={styles.heroDisclaimer}>
          Not a bank statement, tax document, legal certification, or proof of income.
        </Text>
      </View>

      <View style={styles.segmentRow}>
        {(
          [
            { id: 'circle' as const, label: 'Circle Records', icon: 'list' as const },
            { id: 'statements' as const, label: 'Member Statements', icon: 'file-text-o' as const },
            { id: 'documents' as const, label: 'Documents', icon: 'folder-o' as const },
          ] as const
        ).map((item) => {
          const active = segment === item.id;
          return (
            <Pressable
              key={item.id}
              style={[styles.segmentChip, active && styles.segmentChipActive]}
              onPress={() => setSegment(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <FontAwesome
                name={item.icon}
                size={12}
                color={active ? '#fff' : colors.primary}
              />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
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
        />
      ) : null}

      {segment === 'statements' ? (
        <MemberStatementsPanel
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
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => setPreviewOpen(false)}
              style={styles.modalClose}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
            >
              <FontAwesome name="close" size={18} color={colors.textStrong} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalKicker}>STATEMENT PREVIEW</Text>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {activeSubject?.displayName || 'Member'}
              </Text>
            </View>
          </View>

          {previewLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.mutedCenter}>Loading backend snapshot…</Text>
            </View>
          ) : previewError ? (
            <View style={styles.centered}>
              <FontAwesome name="warning" size={28} color={colors.warning} />
              <Text style={styles.errorText}>{previewError}</Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => activeSubject && void openPreview(activeSubject)}
              >
                <Text style={styles.primaryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : snapshot ? (
            <>
              <ScrollView contentContainerStyle={styles.previewScroll}>
                <PreviewBody snapshot={snapshot} />
              </ScrollView>
              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.primaryBtn, pdfLoading && styles.btnDisabled]}
                  onPress={() => void downloadSharePdf()}
                  disabled={pdfLoading}
                >
                  {pdfLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <FontAwesome name="download" size={14} color="#fff" />
                      <Text style={styles.primaryBtnText}>Download & share PDF</Text>
                    </>
                  )}
                </Pressable>
                <Text style={styles.footerHint}>
                  PDF is generated by the backend from this permission-filtered snapshot.
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function CircleRecordsPanel({
  entries,
  members,
  isPremium,
}: {
  entries: BackendLedgerEntry[];
  members: BackendCircleMember[];
  isPremium: boolean;
}) {
  const uniqueEntries = useMemo(() => dedupeById(entries), [entries]);
  const visibleEntries = isPremium ? uniqueEntries : uniqueEntries.slice(0, 10);
  const hasMore = !isPremium && uniqueEntries.length > 10;

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.iconBubble}>
          <FontAwesome name="line-chart" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle}>Circle activity</Text>
          <Text style={styles.panelSub}>
            {uniqueEntries.length} ledger event{uniqueEntries.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      {uniqueEntries.length === 0 ? (
        <View style={styles.emptyBlock}>
          <FontAwesome name="book" size={28} color={colors.subtle} />
          <Text style={styles.emptyTitle}>No activity yet</Text>
        </View>
      ) : (
        visibleEntries.map((entry, index) => (
          <View key={ledgerRenderKey(entry, index)}>
            <View style={styles.ledgerRow}>
              <View
                style={[
                  styles.ledgerIcon,
                  { backgroundColor: `${ledgerIconColor(entry)}22` },
                ]}
              >
                <FontAwesome name="circle" size={10} color={ledgerIconColor(entry)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{ledgerTitle(entry)}</Text>
                <Text style={styles.rowMeta}>
                  {entryMemberName(entry, members)}
                  {entryMemberName(entry, members) ? ' · ' : ''}
                  Round {entry.round || '—'} ·{' '}
                  {formatRelativeDays(entry.created_at || entry.at)}
                </Text>
              </View>
              {typeof entry.amount === 'number' ? (
                <Text style={[styles.rowAmount, { color: ledgerIconColor(entry) }]}>
                  {ledgerAmountLabel(entry)}
                </Text>
              ) : null}
            </View>
            {index < visibleEntries.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))
      )}

      {hasMore ? (
        <View style={styles.upgradeBox}>
          <FontAwesome name="lock" size={20} color={colors.primary} />
          <Text style={styles.upgradeTitle}>Unlock full history</Text>
          <Text style={styles.upgradeBody}>
            {entries.length - 10} more activities are hidden on free tier.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push('/subscription')}
          >
            <Text style={styles.primaryBtnText}>Upgrade to Premium</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function MemberStatementsPanel({
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
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.iconBubble}>
          <FontAwesome name="file-text-o" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle}>Member statements</Text>
          <Text style={styles.panelSub}>
            One row per connected member · hands stay separate on the statement
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
        <Text style={styles.periodLabel}>Statement period</Text>
        <View style={styles.periodToggleRow}>
          <Pressable
            style={[
              styles.periodToggle,
              periodMode === 'full_circle' && styles.periodToggleActive,
            ]}
            onPress={() => onPeriodMode('full_circle')}
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
        {periodMode === 'custom' ? (
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateLabel}>From</Text>
              <TextInput
                value={periodFrom}
                onChangeText={onPeriodFrom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.subtle}
                autoCapitalize="none"
                style={styles.dateInput}
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
                style={styles.dateInput}
              />
            </View>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mutedCenter}>Loading members from backend…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <FontAwesome name="warning" size={24} color={colors.warning} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.primaryBtn} onPress={onRetry}>
            <Text style={styles.primaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : !index || (index.members.length === 0 && index.unclaimedHands.length === 0) ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>No statement subjects yet</Text>
          <Text style={styles.emptyBody}>
            Connected members will appear here once memberships are available.
          </Text>
        </View>
      ) : (
        <>
          {index.members.map((row) => (
            <MemberRow key={row.subjectKey} row={row} onPress={() => onOpenPreview(row)} />
          ))}

          {index.unclaimedHands.length > 0 ? (
            <View style={styles.unclaimedSection}>
              <Text style={styles.unclaimedTitle}>Unclaimed planned hands</Text>
              <Text style={styles.unclaimedSub}>
                Kept separate from connected memberships
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
        </>
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
  return (
    <View style={[styles.memberRow, unclaimed && styles.memberRowUnclaimed]}>
      <View style={[styles.avatar, unclaimed && styles.avatarUnclaimed]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {row.displayName}
        </Text>
        <Text style={styles.rowMeta}>
          {row.handCount} hand{row.handCount === 1 ? '' : 's'}
          {row.roleSummary ? ` · ${row.roleSummary}` : ''}
          {row.membershipStatus ? ` · ${row.membershipStatus}` : ''}
        </Text>
        <View style={styles.totalsRow}>
          <Text style={styles.totalChip}>
            In {displayMoney(row.totals.contributedDisplay)}
          </Text>
          <Text style={styles.totalChip}>
            Out {displayMoney(row.totals.receivedDisplay)}
          </Text>
        </View>
      </View>
      <Pressable
        style={[styles.statementBtn, !row.canRequestStatement && styles.btnDisabled]}
        onPress={onPress}
        disabled={!row.canRequestStatement}
        accessibilityRole="button"
        accessibilityLabel={`Open statement for ${row.displayName}`}
      >
        <FontAwesome name="file-text-o" size={12} color="#fff" />
        <Text style={styles.statementBtnText}>Statement</Text>
      </Pressable>
    </View>
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
        <View style={styles.iconBubble}>
          <FontAwesome name="folder-o" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle}>Documents</Text>
          <Text style={styles.panelSub}>
            Backend-stored statements · re-download from frozen snapshot
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
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mutedCenter}>Loading documents…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <FontAwesome name="warning" size={24} color={colors.warning} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.primaryBtn} onPress={onRefresh}>
            <Text style={styles.primaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : documents.length === 0 ? (
        <View style={styles.emptyBlock}>
          <FontAwesome name="folder-open-o" size={28} color={colors.subtle} />
          <Text style={styles.emptyTitle}>No documents yet</Text>
          <Text style={styles.emptyBody}>
            When you download a Member Circle Statement PDF, CircuSave stores a
            permission-filtered snapshot on the server so you can re-download it later.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={onGoStatements}>
            <Text style={styles.primaryBtnText}>Open Member Statements</Text>
          </Pressable>
        </View>
      ) : (
        documents.map((doc) => (
          <View key={doc.id} style={styles.docRow}>
            <View style={styles.iconBubble}>
              <FontAwesome name="file-pdf-o" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {doc.memberDisplayName || 'Member'}
              </Text>
              <Text style={styles.rowMeta}>
                {doc.statementReference}
                {'\n'}
                {doc.period?.label || 'Unavailable'} ·{' '}
                {formatRelativeDays(doc.generatedAt)}
              </Text>
            </View>
            <Pressable
              style={[styles.statementBtn, sharingDocId === doc.id && styles.btnDisabled]}
              onPress={() => onShare(doc)}
              disabled={sharingDocId === doc.id}
            >
              {sharingDocId === doc.id ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <FontAwesome name="share" size={12} color="#fff" />
                  <Text style={styles.statementBtnText}>Share</Text>
                </>
              )}
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

function PreviewBody({ snapshot }: { snapshot: MemberStatementSnapshot }) {
  const uniqueLedgerEntries = useMemo(
    () => dedupeById(snapshot.ledger || []),
    [snapshot.ledger],
  );

  return (
    <View>
      <View style={styles.previewHero}>
        <Text style={styles.previewBrand}>CIRCUSAVE · AI SUSU</Text>
        <Text style={styles.previewTitle}>{snapshot.title}</Text>
        <Text style={styles.previewDisclaimer}>
          {snapshot.verification.disclaimer ||
            'Not a bank statement, tax document, legal certification, or proof of income.'}
        </Text>
      </View>

      <InfoGrid
        rows={[
          ['Circle', snapshot.circle.name || 'Unavailable'],
          ['Member', snapshot.member.displayName || 'Unavailable'],
          ['Status', snapshot.member.membershipStatus || 'Unavailable'],
          ['Period', snapshot.period.label || 'Unavailable'],
          ['Generated', snapshot.generatedAt || 'Unavailable'],
          ['Reference', snapshot.statementReference || 'Unavailable'],
          [
            'Contribution',
            displayMoney(snapshot.circle.contributionAmountDisplay),
          ],
          ['Frequency', snapshot.circle.frequency || 'Unavailable'],
          [
            'Hands / rounds',
            `${snapshot.circleParticipation.totalParticipatingHands} hands · ${snapshot.circleParticipation.totalRounds} rounds`,
          ],
          ['Member hands', String(snapshot.circleParticipation.memberHandCount)],
        ]}
      />

      <Text style={styles.sectionLabel}>Member totals</Text>
      <InfoGrid
        rows={[
          ['Contributed', displayMoney(snapshot.memberTotals.totalContributedDisplay)],
          ['Received', displayMoney(snapshot.memberTotals.totalReceivedDisplay)],
          [
            'Remaining',
            displayMoney(snapshot.memberTotals.remainingObligationsDisplay),
          ],
        ]}
      />

      <Text style={styles.sectionLabel}>Hand details</Text>
      <Text style={styles.sectionHint}>
        Each hand is listed separately. Positions are never merged.
      </Text>
      {snapshot.hands.map((hand) => (
        <View key={hand.handId} style={styles.handCard}>
          <Text style={styles.handTitle}>{hand.displayLabel}</Text>
          <Text style={styles.rowMeta}>
            Payout position:{' '}
            {hand.payoutPosition === 'Unavailable'
              ? 'Unavailable'
              : String(hand.payoutPosition)}
            {hand.isParticipating ? '' : ' · not participating'}
          </Text>
          <InfoGrid
            compact
            rows={[
              ['Expected', displayMoney(hand.contributions.expectedDisplay)],
              ['Confirmed', displayMoney(hand.contributions.confirmedDisplay)],
              ['Pending', displayMoney(hand.contributions.pendingDisplay)],
              ['Missed', displayMoney(hand.contributions.missedDisplay)],
              ['Rejected', displayMoney(hand.contributions.rejectedDisplay)],
              ['Received', displayMoney(hand.payouts.receivedDisplay)],
              ['Remaining', displayMoney(hand.remainingObligationsDisplay)],
            ]}
          />
          {(hand.contributions.byRound || []).length > 0 ? (
            <>
              <Text style={styles.miniLabel}>Rounds</Text>
              {hand.contributions.byRound.map((r) => (
                <Text key={r.contributionId} style={styles.roundLine}>
                  R{r.roundNumber} · {r.status} · {displayMoney(r.paidDisplay)} /{' '}
                  {displayMoney(r.expectedDisplay)}
                </Text>
              ))}
            </>
          ) : null}
          {(hand.payouts.scheduled || []).length > 0 ? (
            <>
              <Text style={styles.miniLabel}>Scheduled payouts</Text>
              {hand.payouts.scheduled.map((s) => (
                <Text key={`sch-${hand.handId}-${s.roundNumber}`} style={styles.roundLine}>
                  R{s.roundNumber} · {s.status} · {displayMoney(s.amountDisplay)}
                </Text>
              ))}
            </>
          ) : null}
        </View>
      ))}

      <Text style={styles.sectionLabel}>Ledger history</Text>
      {uniqueLedgerEntries.length === 0 ? (
        <Text style={styles.sectionHint}>No related ledger entries for this period.</Text>
      ) : (
        uniqueLedgerEntries.slice(0, 50).map((entry, index) => (
          <View key={statementLedgerRenderKey(entry, index)} style={styles.ledgerPreviewRow}>
            <Text style={styles.rowTitle}>{entry.eventType}</Text>
            <Text style={styles.rowMeta}>
              {entry.at || '—'} · R{entry.roundNumber ?? '—'} ·{' '}
              {displayMoney(entry.amountDisplay)}
              {'\n'}
              Ref {entry.reference}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.sectionLabel}>Verification</Text>
      <Text style={styles.sectionHint}>
        Source: {snapshot.verification.dataSource}
        {snapshot.verification.contentFingerprint
          ? ` · ${snapshot.verification.contentFingerprint}`
          : ''}
      </Text>
      <Text style={styles.sectionHint}>{snapshot.verification.footerText}</Text>
    </View>
  );
}

function InfoGrid({
  rows,
  compact,
}: {
  rows: Array<[string, string]>;
  compact?: boolean;
}) {
  return (
    <View style={[styles.infoGrid, compact && styles.infoGridCompact]}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.infoRow}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
  },
  hero: {
    borderRadius: radii.card,
    padding: 18,
    backgroundColor: '#0B1020',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2E1065',
  },
  heroGlow: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#7C3AED55',
  },
  heroKicker: {
    color: '#C4B5FD',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 6,
  },
  heroSub: {
    color: '#CBD5E1',
    fontSize: 13,
    marginTop: 4,
  },
  heroDisclaimer: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 10,
    lineHeight: 15,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  segmentChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  segmentTextActive: {
    color: '#fff',
  },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    gap: 10,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.textStrong,
  },
  panelSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  periodCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 10,
  },
  periodLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textStrong,
  },
  periodToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  periodToggle: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  periodToggleActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  periodToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  periodToggleTextActive: {
    color: colors.primaryDark,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 4,
  },
  dateInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textStrong,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  memberRowUnclaimed: {
    opacity: 0.95,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarUnclaimed: {
    backgroundColor: '#64748B',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
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
  totalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  totalChip: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  statementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.pill,
  },
  statementBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  unclaimedSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 4,
  },
  unclaimedTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textStrong,
  },
  unclaimedSub: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
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
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
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
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.muted,
  },
  emptyBody: {
    fontSize: 13,
    color: colors.subtle,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  mutedCenter: {
    fontSize: 13,
    color: colors.muted,
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
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
    backgroundColor: '#fff',
  },
  modalClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textStrong,
  },
  previewScroll: {
    padding: spacing.screenX,
    paddingBottom: 40,
    gap: 12,
  },
  modalFooter: {
    padding: spacing.screenX,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: '#fff',
    gap: 8,
  },
  footerHint: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
  previewHero: {
    backgroundColor: '#0B1020',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  previewBrand: {
    color: '#C4B5FD',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  previewTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 6,
  },
  previewDisclaimer: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 8,
    lineHeight: 15,
  },
  sectionLabel: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: '900',
    color: colors.textStrong,
  },
  sectionHint: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
    marginBottom: 8,
  },
  infoGrid: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  infoGridCompact: {
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    flex: 0.45,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textStrong,
    flex: 0.55,
    textAlign: 'right',
  },
  handCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    marginBottom: 10,
  },
  handTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primaryDark,
  },
  miniLabel: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
  },
  roundLine: {
    fontSize: 12,
    color: colors.text,
    marginTop: 3,
  },
  ledgerPreviewRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
});
