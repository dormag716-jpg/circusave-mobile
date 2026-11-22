import { requestJson } from './http';
import { requestPdf, type MemberStatementPdfResult } from './statements';

// ---------------------------------------------------------------------------
// Records: formal contribution, payout and round records (read-only).
// The backend decides what each viewer may see; the app only renders it. Money is
// integer cents plus backend display strings.
// ---------------------------------------------------------------------------

export type RecordActor = {
  role: 'organizer' | 'member' | 'system';
  /** Present only when the viewer may see the person's name (the organizer's view). */
  displayName?: string | null;
};

export type RecordHistoryItem = {
  seq: number;
  id: string;
  type: string;
  at: string | null;
  actor: RecordActor;
  amountCents: number | null;
  paymentMethod: string | null;
  note: string | null;
  paymentReference?: string | null;
  rejectionReasonCode?: string | null;
};

export type RecordPosition = {
  id: string;
  number: number;
  /** A name only when the viewer may see it; otherwise a generic "Position N". */
  label: string;
  handNumber: number | null;
};

export type RecordRoundRef = {
  number: number;
  id: string;
  dueDate: string | null;
  reference: string;
};

export type RecordVerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'reopened';

export type RecordVerification = {
  status: RecordVerificationStatus | string;
  verifiedByRole: 'organizer' | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  rejectionReasonCode: string | null;
  verifiedBy?: string | null;
};

export type ContributionRecord = {
  id: string;
  recordType: 'contribution';
  reference: string;
  circle: { id: string; name: string };
  round: RecordRoundRef;
  member: RecordPosition;
  amount: {
    expectedCents: number;
    expectedDisplay: string;
    grossPaidCents: number;
    refundedCents: number;
    netPaidCents: number;
    recognizedFundingCents: number;
    remainingDueCents: number;
  };
  status: string;
  paymentLifecycle: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  note: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  verification: RecordVerification;
  relatedPayoutReference: string | null;
  history?: RecordHistoryItem[];
};

export type PayoutRecord = {
  id: string | null;
  recordType: 'payout';
  reference: string;
  circle: { id: string; name: string };
  round: RecordRoundRef;
  recipient: RecordPosition;
  amount: { cents: number; display: string; isExpected: boolean };
  /** Backend vocabulary: `pending` or `released`. */
  status: 'pending' | 'released' | string;
  scheduledDate: string | null;
  paidAt: string | null;
  /** `summary` for another member's payout: position, amount, status and date only. */
  detailLevel: 'full' | 'summary';
  note?: string | null;
  releasedBy?: RecordActor | null;
  history?: RecordHistoryItem[];
};

export type RoundRecord = {
  id: string;
  recordType: 'round';
  reference: string;
  circle: { id: string; name: string };
  round: {
    number: number;
    status: string;
    dueDate: string | null;
    openedAt: string | null;
    closedAt: string | null;
  };
  recipient: RecordPosition;
  totals: {
    expectedPotCents: number;
    expectedPotDisplay: string;
    recognizedFundingCents: number;
    remainingDueCents: number;
  };
  contributionCounts: { total: number; byStatus: Record<string, number> };
  payout: { status: string; reference: string; paidAt: string | null };
  contributions: Array<{
    reference: string;
    member: RecordPosition;
    status: string;
    expectedCents: number;
  }>;
  history?: RecordHistoryItem[];
};

export type RecordsPage<T> = {
  records: T[];
  /** Rows on this page. */
  count: number;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  filters: Record<string, string | number | null>;
};

export type RecordBrief = {
  reference: string;
  round: number;
  status: string;
  expectedCents: number;
  expectedDisplay: string;
};

export type RecordsOverview = {
  circle: { id: string; name: string; status: string };
  viewerRole: 'organizer' | 'member';
  currentRound: {
    number: number;
    status: string;
    dueDate: string | null;
    reference: string;
  } | null;
  totals: {
    expectedCents: number;
    expectedDisplay: string;
    confirmedCents: number;
    confirmedDisplay: string;
    remainingDueCents: number;
    remainingDueDisplay: string;
    paidOutCents: number;
    paidOutDisplay: string;
  };
  roundCounts: { total: number; closed: number; payoutsReleased: number };
  /** Organizer only; null for members. */
  needsVerification: { count: number } | null;
  yourRecords: {
    nextContribution: RecordBrief | null;
    lastConfirmed: RecordBrief | null;
  } | null;
  latest: { roundReference: string | null; payoutReference: string | null };
};

export type RecordsListQuery = {
  round?: number;
  member?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

export function buildRecordsListQuery(query: RecordsListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.round != null && Number.isFinite(query.round)) {
    params.set('round', String(Math.trunc(query.round)));
  }
  if (query.member) params.set('member', query.member);
  if (query.status) params.set('status', query.status);
  if (query.limit != null && Number.isFinite(query.limit)) {
    params.set('limit', String(Math.trunc(query.limit)));
  }
  if (query.offset != null && Number.isFinite(query.offset)) {
    params.set('offset', String(Math.trunc(query.offset)));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function recordsPath(circleId: string, suffix: string): string {
  return `/groups/${encodeURIComponent(circleId)}/records/${suffix}`;
}

// Formal records must be current, so every Records read revalidates.
export function getRecordsOverview(
  token: string,
  circleId: string,
): Promise<RecordsOverview> {
  return requestJson<RecordsOverview>(recordsPath(circleId, 'overview'), {
    token,
    revalidate: true,
  });
}

export function getContributionRecords(
  token: string,
  circleId: string,
  query?: RecordsListQuery,
): Promise<RecordsPage<ContributionRecord>> {
  return requestJson<RecordsPage<ContributionRecord>>(
    recordsPath(circleId, `contributions${buildRecordsListQuery(query)}`),
    { token, revalidate: true },
  );
}

export function getContributionRecord(
  token: string,
  circleId: string,
  reference: string,
): Promise<ContributionRecord> {
  return requestJson<ContributionRecord>(
    recordsPath(circleId, `contributions/${encodeURIComponent(reference)}`),
    { token, revalidate: true },
  );
}

export function getPayoutRecords(
  token: string,
  circleId: string,
  query?: RecordsListQuery,
): Promise<RecordsPage<PayoutRecord>> {
  return requestJson<RecordsPage<PayoutRecord>>(
    recordsPath(circleId, `payouts${buildRecordsListQuery(query)}`),
    { token, revalidate: true },
  );
}

export function getPayoutRecord(
  token: string,
  circleId: string,
  reference: string,
): Promise<PayoutRecord> {
  return requestJson<PayoutRecord>(
    recordsPath(circleId, `payouts/${encodeURIComponent(reference)}`),
    { token, revalidate: true },
  );
}

export function getRoundRecords(
  token: string,
  circleId: string,
  query?: RecordsListQuery,
): Promise<RecordsPage<RoundRecord>> {
  return requestJson<RecordsPage<RoundRecord>>(
    recordsPath(circleId, `rounds${buildRecordsListQuery(query)}`),
    { token, revalidate: true },
  );
}

export type RecordDocumentKind = 'contribution' | 'payout' | 'round';

const RECORD_DOCUMENT_ROUTE: Record<RecordDocumentKind, string> = {
  contribution: 'contributions',
  payout: 'payouts',
  round: 'rounds',
};

/**
 * Issue (or re-serve, when nothing changed) the PDF document for one record. The backend stores
 * it, so it also appears in saved documents. Reads only: no financial state changes.
 */
export function downloadRecordPdf(
  token: string,
  circleId: string,
  kind: RecordDocumentKind,
  reference: string,
): Promise<MemberStatementPdfResult> {
  return requestPdf(
    recordsPath(
      circleId,
      `${RECORD_DOCUMENT_ROUTE[kind]}/${encodeURIComponent(reference)}/pdf`,
    ),
    token,
  );
}

export function getRoundRecord(
  token: string,
  circleId: string,
  reference: string,
): Promise<RoundRecord> {
  return requestJson<RoundRecord>(
    recordsPath(circleId, `rounds/${encodeURIComponent(reference)}`),
    { token, revalidate: true },
  );
}

export function downloadStatementDocumentPdf(
  token: string,
  circleId: string,
  documentId: string,
): Promise<MemberStatementPdfResult> {
  return requestPdf(
    `/groups/${circleId}/statement-documents/${encodeURIComponent(documentId)}/pdf`,
    token,
  );
}
