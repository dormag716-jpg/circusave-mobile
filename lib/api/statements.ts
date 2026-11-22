import { HTTP_PDF_TIMEOUT_MS, runWithTimeout } from '../platform/httpTimeout';
import { ApiError, classifyFetchFailure, fallbackNetworkMessage } from '../platform/networkErrors';
import { errorMessage, getApiBaseUrl, readRetryAfter, requestJson, throwIfUnauthorized } from './http';

/** Backend money field: cents number or the literal "Unavailable". */
export type StatementMoney = number | 'Unavailable';

export type StatementActor = {
  /** Null when the viewer may only see the actor by role (e.g. the organizer in a member's view). */
  userId: string | null;
  displayName: string | null;
};

export type MemberStatementIndexRow = {
  subjectKey: string;
  userId: string | null;
  handId: string | null;
  displayName: string;
  membershipStatus: string;
  roleSummary?: string;
  handCount: number;
  handIds: string[];
  totals: {
    contributedCents: StatementMoney;
    contributedDisplay: string;
    receivedCents: StatementMoney;
    receivedDisplay: string;
  };
  canRequestStatement: boolean;
  unclaimed?: boolean;
};

export type MemberStatementsIndex = {
  documentType: string;
  circle: {
    id: string;
    name: string;
    status: string;
    contributionAmountCents: number;
    contributionAmountDisplay: string;
    frequency: string | null;
  };
  viewer: {
    userId: string;
    role: string;
    canViewAllMembers: boolean;
  };
  members: MemberStatementIndexRow[];
  unclaimedHands: MemberStatementIndexRow[];
};

export type MemberStatementSnapshot = {
  documentType: string;
  version: number;
  statementReference: string;
  generatedAt: string;
  generatedByUserId: string;
  title: string;
  circle: {
    id: string;
    name: string;
    status: string;
    contributionAmountCents: number | StatementMoney;
    contributionAmountDisplay: string;
    frequency: string | null;
  };
  member: {
    userId: string | null;
    displayName: string;
    membershipStatus: string;
    roleSummary?: string | null;
    unclaimed?: boolean;
  };
  period: {
    mode: 'full_circle' | 'custom' | string;
    from: string | null;
    to: string | null;
    label: string;
  };
  circleParticipation: {
    totalParticipatingHands: number | 'Unavailable';
    totalRounds: number | 'Unavailable';
    memberHandCount: number;
  };
  hands: Array<{
    handId: string;
    handNumber: number;
    displayLabel: string;
    isParticipating: boolean;
    payoutPosition: number | 'Unavailable';
    contributions: {
      expectedCents: StatementMoney;
      expectedDisplay: string;
      confirmedCents: StatementMoney;
      confirmedDisplay: string;
      pendingCents: StatementMoney;
      pendingDisplay: string;
      missedCents: StatementMoney;
      missedDisplay: string;
      rejectedCents: StatementMoney;
      rejectedDisplay: string;
      byRound: Array<{
        contributionId: string;
        handId?: string;
        roundNumber: number;
        dueDate: string | null;
        status: string;
        expectedCents: number;
        expectedDisplay: string;
        paidCents: number;
        paidDisplay: string;
        amountCents?: number;
        amountDisplay?: string;
        grossPaidCents?: number;
        grossPaidDisplay?: string;
        refundedCents?: number;
        refundedDisplay?: string;
        netPaidCents?: number;
        netPaidDisplay?: string;
        recognizedFundingCents?: number;
        recognizedFundingDisplay?: string;
        remainingDueCents?: number;
        remainingDueDisplay?: string;
        paymentOrigin?: 'external' | string | null;
        paymentOriginLabel?: string | null;
        verificationStatus?:
          | 'pending_organizer_confirmation'
          | 'organizer_confirmed'
          | 'organizer_rejected'
          | string
          | null;
        verificationLabel?: string | null;
        reportedBy?: StatementActor | null;
        reportedAt?: string | null;
        confirmedBy?: StatementActor | null;
        rejectedBy?: StatementActor | null;
        rejectedAt?: string | null;
        paymentMethod?: string | null;
        submittedAt?: string | null;
        confirmedAt?: string | null;
      }>;
    };
    payouts: {
      receivedCents: StatementMoney;
      receivedDisplay: string;
      received: Array<{
        payoutId: string;
        roundNumber: number | null;
        amountCents: number;
        amountDisplay: string;
        status: string;
        paidAt: string | null;
      }>;
      scheduled: Array<{
        roundNumber: number;
        dueDate: string | null;
        amountCents: StatementMoney;
        amountDisplay: string;
        status: string;
        roundStatus?: string;
      }>;
    };
    remainingObligationsCents: StatementMoney;
    remainingObligationsDisplay: string;
  }>;
  memberTotals: {
    totalContributedCents: StatementMoney;
    totalContributedDisplay: string;
    totalReceivedCents: StatementMoney;
    totalReceivedDisplay: string;
    remainingObligationsCents: StatementMoney;
    remainingObligationsDisplay: string;
  };
  ledger: Array<{
    id: string;
    at: string | null;
    eventType: string;
    amountCents: number | null;
    amountDisplay: string;
    roundNumber: number | null;
    handId: string | null;
    reference: string;
    statusOrNote: string | null;
    description: string | null;
    paymentOrigin?: 'external' | string | null;
    paymentOriginLabel?: string | null;
    verificationStatus?:
      | 'pending_organizer_confirmation'
      | 'organizer_confirmed'
      | 'organizer_rejected'
      | string
      | null;
    verificationLabel?: string | null;
    reportedBy?: StatementActor | null;
    reportedAt?: string | null;
    confirmedBy?: StatementActor | null;
    confirmedAt?: string | null;
    rejectedBy?: StatementActor | null;
    rejectedAt?: string | null;
  }>;
  verification: {
    footerText: string;
    disclaimer?: string;
    dataSource: string;
    contentFingerprint?: string;
  };
};

export type StatementPeriodInput = {
  period?: 'full_circle' | 'custom';
  from?: string;
  to?: string;
};

export type MemberStatementPdfResult = {
  bytes: Uint8Array;
  statementReference: string;
  generatedAt: string;
  filename: string;
  documentId?: string;
};

export type StatementDocumentSummary = {
  id: string;
  circleId: string;
  statementReference: string;
  documentType: string;
  subjectUserId: string | null;
  handId: string | null;
  memberDisplayName: string;
  membershipStatus?: string | null;
  period: {
    mode: string;
    from: string | null;
    to: string | null;
    label: string;
  };
  generatedAt: string | null;
  generatedByUserId: string;
  contentFingerprint?: string | null;
  /** Record documents only: the Records reference the document is about. */
  recordReference?: string | null;
  issueNumber?: number | null;
  fingerprintAlgorithm?: string | null;
  /** True once a later issued document replaced this one. It still downloads as issued. */
  superseded?: boolean;
};

export type StatementDocumentsPage = {
  documentType: string;
  circleId: string;
  documents: StatementDocumentSummary[];
};

function buildStatementPeriodQuery(period?: StatementPeriodInput): string {
  const params = new URLSearchParams();
  const mode = period?.period || 'full_circle';
  params.set('period', mode);
  if (mode === 'custom') {
    if (period?.from) params.set('from', period.from);
    if (period?.to) params.set('to', period.to);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function getMemberStatementsIndex(
  token: string,
  circleId: string,
): Promise<MemberStatementsIndex> {
  return requestJson<MemberStatementsIndex>(
    `/groups/${circleId}/member-statements`,
    { token },
  );
}

export function getMemberStatementSnapshotForUser(
  token: string,
  circleId: string,
  subjectUserId: string,
  period?: StatementPeriodInput,
): Promise<MemberStatementSnapshot> {
  const qs = buildStatementPeriodQuery(period);
  return requestJson<MemberStatementSnapshot>(
    `/groups/${circleId}/member-statements/users/${encodeURIComponent(subjectUserId)}${qs}`,
    { token },
  );
}

export function getMemberStatementSnapshotForHand(
  token: string,
  circleId: string,
  handId: string,
  period?: StatementPeriodInput,
): Promise<MemberStatementSnapshot> {
  const qs = buildStatementPeriodQuery(period);
  return requestJson<MemberStatementSnapshot>(
    `/groups/${circleId}/member-statements/hands/${encodeURIComponent(handId)}${qs}`,
    { token },
  );
}

/**
 * File name for a downloaded PDF. A record document number (CSC-/CSP-/CSR-...-Dnn) names the
 * file after itself; everything else is a member statement.
 */
export function pdfFilenameForReference(reference: string): string {
  const safeRef = reference.replace(/[^a-zA-Z0-9_-]/g, '_');
  return /^CS[CPR]-/i.test(reference)
    ? `CircuSave_${safeRef}.pdf`
    : `CircuSave_Member_Circle_Statement_${safeRef}.pdf`;
}

export async function requestPdf(
  path: string,
  token: string,
): Promise<MemberStatementPdfResult> {
  const headers = new Headers();
  headers.set('Accept', 'application/pdf');
  headers.set('X-CircuSave-Client', 'mobile');
  headers.set('Origin', 'circusave-mobile');
  headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await runWithTimeout(
      (timedSignal) =>
        fetch(`${getApiBaseUrl()}${path}`, {
          headers,
          signal: timedSignal,
        }),
      { timeoutMs: HTTP_PDF_TIMEOUT_MS },
    );
  } catch (error) {
    const category = classifyFetchFailure(error);
    throw new ApiError(fallbackNetworkMessage(category), 0, undefined, {
      category,
    });
  }

  if (!response.ok) {
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      payload = text;
    }
    const retryAfterSeconds = readRetryAfter(response);
    throwIfUnauthorized(path, Boolean(token), response.status);
    throw new ApiError(
      errorMessage(payload, response.status, retryAfterSeconds),
      response.status,
      payload,
      { retryAfterSeconds },
    );
  }

  const buffer = await response.arrayBuffer();
  const statementReference =
    response.headers.get('X-Statement-Reference') ||
    response.headers.get('x-statement-reference') ||
    'statement';
  const generatedAt =
    response.headers.get('X-Statement-Generated-At') ||
    response.headers.get('x-statement-generated-at') ||
    '';
  const documentId =
    response.headers.get('X-Statement-Document-Id') ||
    response.headers.get('x-statement-document-id') ||
    undefined;
  return {
    bytes: new Uint8Array(buffer),
    statementReference,
    generatedAt,
    filename: pdfFilenameForReference(statementReference),
    documentId: documentId || undefined,
  };
}

export function downloadMemberStatementPdfForUser(
  token: string,
  circleId: string,
  subjectUserId: string,
  period?: StatementPeriodInput,
): Promise<MemberStatementPdfResult> {
  const qs = buildStatementPeriodQuery(period);
  return requestPdf(
    `/groups/${circleId}/member-statements/users/${encodeURIComponent(subjectUserId)}/pdf${qs}`,
    token,
  );
}

export function downloadMemberStatementPdfForHand(
  token: string,
  circleId: string,
  handId: string,
  period?: StatementPeriodInput,
): Promise<MemberStatementPdfResult> {
  const qs = buildStatementPeriodQuery(period);
  return requestPdf(
    `/groups/${circleId}/member-statements/hands/${encodeURIComponent(handId)}/pdf${qs}`,
    token,
  );
}

export function getStatementDocuments(
  token: string,
  circleId: string,
): Promise<StatementDocumentsPage> {
  return requestJson<StatementDocumentsPage>(
    `/groups/${circleId}/statement-documents`,
    { token },
  );
}
