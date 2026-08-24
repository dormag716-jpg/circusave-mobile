import type {
  ActivityResponse,
  BackendCircleSummary,
  DashboardSummary,
} from './types';
import {
  freeEntitlements,
  normalizeEntitlements,
  type Entitlements,
} from './entitlements';
import {
  invalidateCachedGets,
  runDedupedGet,
  shouldInvalidateCachedGetsOnMutation,
  shouldUseHttpGetCache,
} from './httpGetCache';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  last_login_at?: string | null;
  preferredMarket?: string;
  cashtag?: string | null;
  venmoHandle?: string | null;
  paypalEmail?: string | null;
  reliabilityScore?: number;
};

export type AuthSession = {
  id: string;
  user_id: string;
  token_type: 'Bearer';
  token?: string;
  created_at: string;
  expires_at: string;
};

export type AuthResponse = {
  user: AuthUser;
  session: AuthSession;
};

export type PasswordResetRequestResult = {
  accepted: true;
  challengeId: string;
  expiresIn: number;
  message: string;
  devCode?: string;
};

export type PasswordResetVerificationResult = {
  verified: true;
  resetToken: string;
  expiresAt: string;
};

export type PasswordResetResult = {
  reset: true;
  sessions_cleared?: boolean;
};

export type CreateCircleInput = {
  name: string;
  contributionAmount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  startDate: string;
  organizerParticipates?: boolean;
  /** 1–3 hands for a participating organizer. */
  organizerHandCount?: number;
  organizerPayoutPosition?: number;
  members?: Array<{
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
  }>;
};

export type CreateCircleMemberInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
};

export type CreatedCircleResponse = {
  id: string;
  name: string;
  status?: string;
};

export type BackendCircleMember = {
  email?: string | null;
  full_name?: string;
  id: string;
  /** Stable hand identifier — same as membership id. */
  handId?: string;
  handNumber?: number;
  hand_number?: number;
  handLabel?: string;
  displayLabel?: string;
  isParticipating?: boolean;
  isAdditionalHand?: boolean;
  name?: string;
  phone?: string | null;
  userId?: string | null;
  cashtag?: string | null;
  venmoHandle?: string | null;
  paypalEmail?: string | null;
  reliabilityScore?: number;
};

export type BackendJoinRequest = {
  id: string;
  requestId: string;
  handNumber?: number;
  hand_number?: number;
  handLabel?: string;
  displayLabel?: string;
  isAdditionalHand?: boolean;
  is_additional_hand?: boolean;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  userId?: string | null;
};

export type BackendViewerHand = {
  handId: string;
  memberId?: string;
  handNumber: number;
  handLabel?: string;
  displayLabel?: string;
  isParticipating?: boolean;
};

export type BackendViewerContributionSummary = {
  handCount: number;
  amountPerHand: number;
  totalOwedPerRound: number;
  hands: Array<{
    handId: string;
    handNumber: number;
    displayLabel?: string;
    amountOwed: number;
  }>;
};

export type BackendCircleDetail = {
  id: string;
  name: string;
  circleCode?: string;
  contributionAmount: number;
  currentRound: number;
  currentRoundSummary?: {
    confirmedCount: number;
    dueDate: string | null;
    expectedContributionCount: number;
    lateCount?: number;
    missedCount?: number;
    payoutAmount: number;
    payoutRecorded?: boolean;
    payoutReleased?: boolean;
    recipientMemberId: string | null;
    roundNumber: number;
    submittedCount: number;
    totalExpectedAmount?: number;
    totalPaidAmount: number;
  };
  frequency: string;
  members: BackendCircleMember[];
  /** Active hands (participating memberships) — drives pot and rounds. */
  handCount?: number;
  totalHands?: number;
  participatingHandCount?: number;
  memberCount?: number;
  uniqueMemberCount?: number;
  uniquePeopleCount?: number;
  viewerHands?: BackendCircleMember[];
  viewerHandCount?: number;
  viewerContributionSummary?: BackendViewerContributionSummary | null;
  totalRounds?: number;
  organizerId: string;
  paymentInstructions?: string | null;
  paymentDestinations?: Array<{
    method: string;
    destination: string;
    memo?: string;
  }> | null;
  paymentInstructionAudit?: Array<{
    at?: string;
    actorUserId?: string;
    previousInstructions?: string | null;
    nextInstructions?: string | null;
    previousDestinations?: unknown;
    nextDestinations?: unknown;
  }> | null;
  pot_status?: string;
  startDate: string;
  /** Null/absent before Start Circle; set when the circle starts. */
  startedAt?: string | null;
  /**
   * Lifecycle status: draft (setup) | active | completed.
   * Authoritative with startedAt; mobile must not re-infer from schedule/rounds.
   */
  status: string;
  /**
   * Convenience flag derived by backend from status + startedAt only.
   * Not a separately mutable field.
   */
  isStarted?: boolean;
  is_started?: boolean;
  waitlist?: BackendJoinRequest[];
  turnOrder: string[];
  userRole?: 'organizer' | 'participant' | null;
  /**
   * Plan capacity for roster growth and AI Susu.
   * Free: 20 participating hands; Premium: 50.
   */
  rosterCapacity?: {
    tier?: 'free' | 'premium' | string;
    maxHands?: number;
    maxMembers?: number;
    usedHands?: number;
    remainingHands?: number;
    atCapacity?: boolean;
    unit?: string;
    freeMaxHands?: number;
    premiumMaxHands?: number;
  };
};

export type BackendInvitePreview = {
  approvalMode?: string;
  approval_mode?: string;
  contributionAmount?: number;
  contribution_amount?: number;
  frequency: string;
  id: string;
  membersCount?: number;
  members_count?: number;
  name: string;
  circleCode?: string;
  organizerName?: string;
  organizer_name?: string;
  startDate?: string;
  start_date?: string;
  stewardName?: string;
  steward_name?: string;
  status?: string;
};

export type BackendWaitlistPreview = BackendInvitePreview & {
  userRole: 'waitlist';
  requestStatus: 'pending';
  requestId: string;
  handNumber: number;
  isAdditionalHand: boolean;
};

export type BackendJoinResult = BackendCircleDetail | BackendWaitlistPreview;

export type AgreementLanguage = 'en' | 'es' | 'ht';

export type CircleAgreementHand = {
  handId: string;
  handNumber: number;
  userId: string | null;
  payoutPosition: number;
  expectedPayoutDate: string | null;
};

export type CircleAgreementSnapshot = {
  id: string;
  circleId: string;
  snapshotVersion: number;
  snapshotHash: string;
  status: 'active' | 'superseded';
  contributionAmountCents: number;
  frequency: string;
  totalRounds: number;
  organizerUserId: string;
  organizerParticipates: boolean;
  currency: string;
  fees: { serviceFeeCents?: number; otherFees?: unknown[] };
  roster: Array<{ userId: string; handIds: string[] }>;
  hands: CircleAgreementHand[];
  payoutOrder: string[];
  payoutDates: string[];
  agreementVersions: Record<string, string>;
  generatedAt: string;
  structureCurrent: boolean;
  memberReview: {
    handIds: string[];
    hands: CircleAgreementHand[];
    contributionPerHandCents: number;
    currentRecurringObligationCents: number;
    estimatedTotalObligationCents: number;
    frequency: string;
    totalRounds: number;
  };
  alreadyAccepted: {
    circleParticipationAgreement: boolean;
    finalCircleSnapshot: boolean;
    organizerAgreement: boolean;
  };
};

export type CircleAgreementReadiness = {
  circleId: string;
  snapshotId: string | null;
  snapshotHash: string | null;
  /** Preferred structural readiness fields. */
  structureComplete?: boolean;
  payoutOrderComplete?: boolean;
  pendingStructureRequests?: boolean;
  canStartCircle?: boolean;
  structuralBlockers?: string[];
  /**
   * Legacy full-gate signal including unresolved start-confirmation requirements.
   * Prefer canStartCircle / canOpenStartFlow for Start-button eligibility.
   */
  readyToStart: boolean;
  /** Full list (structural + confirmation) for compatibility. */
  blockers: string[];
  /** Legacy agreement blockers (always empty under structural-only start). */
  agreementBlockers: string[];
  /** Start-confirmation codes only (submitted in the start request). */
  confirmationRequirements: string[];
  missingMemberAcceptances: Array<{
    userId: string;
    handIds: string[];
    missingDocuments: string[];
  }>;
  snapshotPresent: boolean;
  snapshotCurrent: boolean;
  memberAcceptancesComplete: boolean;
  organizerAgreementComplete: boolean;
  agreementsComplete: boolean;
  requiresOrganizerStartConfirmation: boolean;
  requiresUnclaimedHandConfirmation: boolean;
  canOpenStartFlow: boolean;
};

export type CircleAgreementContent = {
  draftStatus: string;
  notLegalAdvice: boolean;
  versions: Record<string, string>;
  documents: Record<string, {
    version: string;
    topics: string[];
    body: Record<AgreementLanguage, string>;
  }>;
};

export type AdditionalHandPreview = {
  currentHandCount: number;
  proposedHandCount: number;
  contributionPerHandCents: number;
  currentRecurringObligationCents: number;
  additionalRecurringObligationCents: number;
  newRecurringObligationCents: number;
  remainingRounds: number;
  currentRemainingObligationCents: number;
  additionalRemainingObligationCents: number;
  newTotalRemainingObligationCents: number;
  frequency: string;
  currency: string;
  consentTextVersion: string;
  previewHash: string;
  expiresAt: string;
};

export type BackendRoundContribution = {
  confirmedAt?: string | null;
  memberId: string;
  note?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  rejectReason?: string | null;
  rejectReasonCode?: string | null;
  round: number;
  status: string;
  submittedAt?: string | null;
  updatedAt?: string | null;
};

export type BackendWalletTransaction = {
  action?: string;
  actor_user_id?: string;
  amount?: number | null;
  amountCents?: number | null;
  at?: string;
  created_at?: string;
  from?: string | null;
  fromMemberId?: string | null;
  id: string;
  note?: string | null;
  payment_method?: string | null;
  related_ledger_event_id?: string | null;
  round?: number | null;
  status?: string | null;
  to?: string | null;
  toMemberId?: string | null;
  type?: string;
};

export type BackendWalletSnapshot = {
  accounts?: Record<string, number>;
  txns?: BackendWalletTransaction[];
};

export type BackendScheduleRound = {
  id?: string;
  payoutAmount?: number;
  payout_amount?: number;
  payoutDate?: string | null;
  payout_date?: string | null;
  recipientMemberId?: string | null;
  recipient_member_id?: string | null;
  recipientName?: string | null;
  recipient_name?: string | null;
  round: number;
  status?: string;
};

export type BackendRoundSnapshot = {
  contributions: BackendRoundContribution[];
  currentRound: number;
  currentRoundSummary?: BackendCircleDetail['currentRoundSummary'];
  groupId: string;
  potStatus?: string;
  roundWorkspace?: {
    currentRecipientMemberId?: string | null;
    currentRecipientName?: string | null;
    currentRoundNumber?: number;
    currentRoundStatus?: string;
    confirmedCount?: number;
    payoutAmountCents?: number;
    payoutReleased?: boolean;
    payoutReleasedAt?: string | null;
    readyForPayout?: boolean;
    totalMemberCount?: number;
    viewerMemberId?: string | null;
    viewerMemberIds?: string[];
    viewerHands?: BackendViewerHand[];
    viewerHandCount?: number;
    viewerPermissions?: {
      canApproveContributions?: boolean;
      canReleasePayout?: boolean;
      canRemindMembers?: boolean;
      canSubmitOwnContribution?: boolean;
    };
    viewerRole?: 'organizer' | 'participant' | 'waitlist' | 'none' | string;
  } | null;
  schedule: BackendScheduleRound[];
  wallet?: BackendWalletSnapshot;
};

export type BackendLedgerEntry = {
  amount?: number | null;
  at?: string;
  created_at?: string;
  event_type?: string;
  id: string;
  memberId?: string;
  metadata?: Record<string, unknown>;
  note?: string | null;
  round?: number;
  type?: string;
  title?: string;
  message?: string;
  createdAt?: string;
  paymentOrigin?: 'external' | string | null;
  paymentOriginLabel?: string | null;
  verificationStatus?:
    | 'pending_organizer_confirmation'
    | 'organizer_confirmed'
    | 'organizer_rejected'
    | string
    | null;
  verificationLabel?: string | null;
  performedBy?: StatementActor | null;
};

export type BackendLedgerPage = {
  entries: BackendLedgerEntry[];
  limit?: number;
  next_cursor?: string | null;
};

/** Backend money field: cents number or the literal "Unavailable". */
export type StatementMoney = number | 'Unavailable';

export type StatementActor = {
  userId: string;
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
};

export type StatementDocumentsPage = {
  documentType: string;
  circleId: string;
  documents: StatementDocumentSummary[];
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function getApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '');

  if (!configured) {
    throw new Error(
      'Set EXPO_PUBLIC_API_BASE_URL to the Flask server URL. On a phone, use the computer LAN IP instead of localhost.',
    );
  }

  return configured.endsWith('/api') ? configured : `${configured}/api`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown) {
  return String(value ?? '').trim();
}

/**
 * Copy optional nullable string fields from a backend user payload without
 * inventing empty strings. Absent keys stay undefined; explicit null stays null.
 */
function readOptionalNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

function errorMessage(payload: unknown, status: number) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }

  if (isRecord(payload)) {
    const message = readString(payload.error ?? payload.message);
    if (message) {
      return message;
    }
  }

  return `Backend request failed with status ${status}.`;
}

const DEV_API_LOG_REDACTED = '[redacted]';
// Shared with lib/errorLogging.ts so any place that logs API-shaped data
// redacts the same set of PII / financial / auth-ish key names.
export const SENSITIVE_LOG_KEY_PATTERN =
  /token|auth|session|password|secret|email|phone|name|user|member|recipient|payment|contribution|wallet|stripe|bank|card|account|circle/i;

function redactDevApiLogBody(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactDevApiLogBody);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        SENSITIVE_LOG_KEY_PATTERN.test(key)
          ? DEV_API_LOG_REDACTED
          : redactDevApiLogBody(entryValue),
      ]),
    );
  }
  return value;
}

function logDevApiResponse(method: string, url: string, status: number, body: unknown) {
  if (!__DEV__) {
    return;
  }
  console.log('[CircuSave API]', {
    method,
    url,
    status,
    body: redactDevApiLogBody(body),
  });
}

export type ApiGetOptions = {
  /** Skip persist hit; fetch fresh; write persist if policy allows. */
  revalidate?: boolean;
};

type JsonRequestOptions = RequestInit & {
  token?: string;
  revalidate?: boolean;
};

async function requestJsonUncached<T>(
  path: string,
  options: JsonRequestOptions = {},
): Promise<T> {
  const {
    token,
    headers: providedHeaders,
    revalidate: _revalidate,
    ...requestOptions
  } = options;
  const headers = new Headers(providedHeaders);
  headers.set('Accept', 'application/json');
  headers.set('X-CircuSave-Client', 'mobile');
  headers.set('Origin', 'circusave-mobile');

  if (requestOptions.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const method = (requestOptions.method ?? 'GET').toUpperCase();
  const url = `${getApiBaseUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...requestOptions,
      headers,
    });
  } catch {
    throw new Error(
      'Could not reach the CircuSave backend. Confirm EXPO_PUBLIC_API_BASE_URL and that Flask is reachable from this device.',
    );
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = text;
  }

  logDevApiResponse(method, url, response.status, payload ?? text);

  if (!response.ok) {
    throw new ApiError(
      errorMessage(payload, response.status),
      response.status,
      payload,
    );
  }

  return payload as T;
}

async function requestJson<T>(
  path: string,
  options: JsonRequestOptions = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  if (shouldUseHttpGetCache(method, path)) {
    return runDedupedGet({
      path,
      token: options.token,
      fetcher: () => requestJsonUncached<T>(path, options),
      revalidate: options.revalidate === true,
    });
  }
  const payload = await requestJsonUncached<T>(path, options);
  if (shouldInvalidateCachedGetsOnMutation(method, path)) {
    invalidateCachedGets();
  }
  return payload;
}

function normalizeAuthResponse(payload: unknown, requireToken: boolean): AuthResponse {
  if (!isRecord(payload) || !isRecord(payload.user) || !isRecord(payload.session)) {
    throw new ApiError('Authentication response was invalid.', 500);
  }

  const user = payload.user;
  const session = payload.session;
  const cashtag = readOptionalNullableString(user, 'cashtag');
  const venmoHandle = readOptionalNullableString(user, 'venmoHandle');
  const paypalEmail = readOptionalNullableString(user, 'paypalEmail');
  const normalized: AuthResponse = {
    user: {
      id: readString(user.id),
      name: readString(user.name),
      email: readString(user.email).toLowerCase(),
      role: readString(user.role),
      created_at: readString(user.created_at),
      last_login_at: readString(user.last_login_at) || null,
      preferredMarket: readString(
        user.preferredMarket ?? user.preferred_market ?? user.market,
      ) || undefined,
      ...(cashtag !== undefined ? { cashtag } : {}),
      ...(venmoHandle !== undefined ? { venmoHandle } : {}),
      ...(paypalEmail !== undefined ? { paypalEmail } : {}),
    },
    session: {
      id: readString(session.id),
      user_id: readString(session.user_id ?? session.userId),
      token_type: 'Bearer',
      token: readString(session.token) || undefined,
      created_at: readString(session.created_at ?? session.createdAt),
      expires_at: readString(session.expires_at ?? session.expiresAt),
    },
  };

  if (
    !normalized.user.id ||
    !normalized.user.name ||
    !normalized.user.email ||
    !normalized.session.id ||
    !normalized.session.user_id ||
    !normalized.session.created_at ||
    !normalized.session.expires_at ||
    (requireToken && !normalized.session.token)
  ) {
    throw new ApiError('Authentication response was invalid.', 500);
  }

  return normalized;
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const payload = await requestJson<unknown>('/auth/mobile/login', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    }),
  });
  return normalizeAuthResponse(payload, true);
}

export type RegistrationLegalAcceptance = {
  acceptedLegal: true;
  termsVersion: string;
  privacyVersion: string;
  fundsDisclosureVersion: string;
  electronicConsentVersion: string;
};

export async function register(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  legalAcceptance: RegistrationLegalAcceptance;
}): Promise<AuthResponse> {
  const payload = await requestJson<unknown>('/auth/mobile/register', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || undefined,
      password: input.password,
      acceptedLegal: input.legalAcceptance.acceptedLegal,
      termsVersion: input.legalAcceptance.termsVersion,
      privacyVersion: input.legalAcceptance.privacyVersion,
      fundsDisclosureVersion: input.legalAcceptance.fundsDisclosureVersion,
      electronicConsentVersion: input.legalAcceptance.electronicConsentVersion,
    }),
  });
  return normalizeAuthResponse(payload, true);
}

export function requestPasswordReset(input: {
  email: string;
}): Promise<PasswordResetRequestResult> {
  return requestJson<PasswordResetRequestResult>('/auth/forgot-password/request', {
    method: 'POST',
    body: JSON.stringify({ email: input.email.trim().toLowerCase() }),
  });
}

export async function verifyPasswordReset(input: {
  email: string;
  code: string;
}): Promise<PasswordResetVerificationResult> {
  const payload = await requestJson<unknown>('/auth/forgot-password/verify', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      code: input.code,
    }),
  });

  if (
    !isRecord(payload) ||
    payload.verified !== true ||
    !readString(payload.resetToken) ||
    !readString(payload.expiresAt)
  ) {
    throw new ApiError('Password reset verification response was invalid.', 500);
  }

  return {
    verified: true,
    resetToken: readString(payload.resetToken),
    expiresAt: readString(payload.expiresAt),
  };
}

export async function resetPassword(input: {
  resetToken: string;
  newPassword: string;
}): Promise<PasswordResetResult> {
  const payload = await requestJson<unknown>('/auth/forgot-password/reset', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  if (!isRecord(payload) || payload.reset !== true) {
    throw new ApiError('Password reset response was invalid.', 500);
  }

  return {
    reset: true,
    sessions_cleared:
      typeof payload.sessions_cleared === 'boolean'
        ? payload.sessions_cleared
        : undefined,
  };
}

export async function getAuthSession(token: string): Promise<AuthResponse> {
  const payload = await requestJson<unknown>('/auth/session', { token });
  return normalizeAuthResponse(payload, false);
}

export function getCurrentUser(token: string): Promise<AuthUser> {
  return requestJson<AuthUser>('/auth/me', { token });
}

/**
 * Backend-authoritative Premium entitlements.
 * Prefer this over users.role for plan and feature gates.
 * Fail closed to free on network/API errors (never invent Premium).
 */
export async function getEntitlements(token: string): Promise<Entitlements> {
  try {
    const payload = await requestJson<unknown>('/auth/me/entitlements', { token });
    return normalizeEntitlements(payload);
  } catch {
    return freeEntitlements();
  }
}

export async function getFreshContributionPaymentsCapability(
  token: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const payload = await requestJson<unknown>('/auth/me/entitlements', {
    token,
    revalidate: true,
    signal,
  });
  if (!isRecord(payload) || !isRecord(payload.capabilities)) {
    return false;
  }
  return payload.capabilities.contributionPaymentsEnabled === true;
}

export async function logout(token: string): Promise<void> {
  await requestJson<unknown>('/auth/logout', {
    method: 'POST',
    token,
  });
}

/**
 * Registers the device's Expo push token with the backend so the server can
 * send targeted push notifications to this user's device.
 * Called once after every successful login.
 */
export function registerPushToken(
  token: string,
  pushToken: string,
): Promise<unknown> {
  return requestJson<unknown>('/auth/device/push-token', {
    method: 'POST',
    token,
    body: JSON.stringify({ pushToken, platform: 'expo' }),
  });
}

export function getDashboardSummary(
  token: string,
  options?: ApiGetOptions,
): Promise<DashboardSummary> {
  return requestJson<DashboardSummary>('/dashboard/summary', {
    token,
    revalidate: options?.revalidate,
  });
}

export function getActivity(
  token: string,
  options?: ApiGetOptions,
): Promise<ActivityResponse> {
  return requestJson<ActivityResponse>('/activity', {
    token,
    revalidate: options?.revalidate,
  });
}

export function getCircles(
  token: string,
  options?: ApiGetOptions,
): Promise<BackendCircleSummary[]> {
  return requestJson<BackendCircleSummary[]>('/groups', {
    token,
    revalidate: options?.revalidate,
  });
}

export function getCircleDetail(
  token: string,
  circleId: string,
  options?: ApiGetOptions,
): Promise<BackendCircleDetail> {
  return requestJson<BackendCircleDetail>(`/groups/${circleId}`, {
    token,
    revalidate: options?.revalidate,
  });
}

export function updateCircleSettings(
  token: string,
  circleId: string,
  settings: {
    paymentInstructions?: string;
    paymentDestinations?: Array<{
      method: string;
      destination: string;
      memo?: string;
    }>;
  },
): Promise<unknown> {
  return requestJson<unknown>(`/groups/${circleId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(settings),
  });
}

export function getCircleSchedule(
  token: string,
  circleId: string,
): Promise<BackendRoundSnapshot> {
  return requestJson<BackendRoundSnapshot>(`/groups/${circleId}/schedule`, {
    token,
  });
}

export function getLedgerEntries(
  token: string,
  circleId: string,
): Promise<BackendLedgerPage> {
  return requestJson<BackendLedgerPage>(`/ledger/${circleId}`, { token });
}

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

async function requestPdf(
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
    response = await fetch(`${getApiBaseUrl()}${path}`, { headers });
  } catch {
    throw new Error(
      'Could not reach the CircuSave backend. Confirm EXPO_PUBLIC_API_BASE_URL and that Flask is reachable from this device.',
    );
  }

  if (!response.ok) {
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      payload = text;
    }
    throw new ApiError(errorMessage(payload, response.status), response.status);
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
  const safeRef = statementReference.replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    bytes: new Uint8Array(buffer),
    statementReference,
    generatedAt,
    filename: `CircuSave_Member_Circle_Statement_${safeRef}.pdf`,
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

export function approveContribution(
  token: string,
  circleId: string,
  memberId: string,
): Promise<unknown> {
  return requestJson<unknown>(`/contributions/${circleId}/${memberId}/approve`, {
    method: 'POST',
    token,
  });
}

export function rejectContribution(
  token: string,
  circleId: string,
  memberId: string,
  input: { reason?: string; reasonCode?: string } = {},
): Promise<unknown> {
  return requestJson<unknown>(`/contributions/${circleId}/${memberId}/reject`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}


export function submitContribution(
  token: string,
  circleId: string,
  memberId: string,
  input: { note?: string; paymentMethod?: string; paymentReference?: string } = {},
): Promise<unknown> {
  return requestJson<unknown>(`/contributions/${circleId}/${memberId}/submit`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export function sendContributionReminder(
  token: string,
  circleId: string,
  memberId?: string,
): Promise<unknown> {
  return requestJson<unknown>(`/groups/${circleId}/reminders/contributions`, {
    method: 'POST',
    token,
    body: JSON.stringify(memberId ? { memberId } : {}),
  });
}

export type BillingPlan = {
  id: 'free' | 'premium';
  name: string;
  tagline: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  annualSavingsCents?: number;
  trialDays: number;
  features: string[];
};

export type BillingPlansResponse = {
  currency: string;
  recommendedPlan: 'premium';
  plans: BillingPlan[];
};

export type BillingCheckoutResponse = {
  checkoutSessionId: string;
  checkoutUrl: string;
  interval: 'monthly' | 'annual';
};

export type BillingPortalResponse = {
  portalUrl: string;
};

export type ReminderSchedule = {
  circleId: string;
  enabled: boolean;
  repeatHours: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastResult: {
    status?: string;
    remindedCount?: number;
    error?: string;
  } | null;
};

/**
 * Production assistant-response.v2 shape (AiAssistantService).
 * Older shells used { mode, actions }; those fields are no longer returned.
 */
export type AiAssistantNavigationSuggestion = {
  actionId: string;
  reason: string;
  assistantExecutable: false;
};

export type AiAssistantResponse = {
  schemaVersion: 'assistant-response.v2' | string;
  conversationId: string;
  messageId: string;
  status: 'completed' | 'refused';
  locale: string;
  responseType: 'answer' | 'refusal' | 'clarification';
  message: string;
  explanationCodes: string[];
  factRefs: string[];
  navigationSuggestions: AiAssistantNavigationSuggestion[];
  generatedFromContextAt: string;
  actionsExecutable: false;
  /** Present only on some entitlement/error payloads — not on v2 success body. */
  mode?: 'premium' | 'free_introduction';
};

export function getBillingPlans(): Promise<BillingPlansResponse> {
  return requestJson<BillingPlansResponse>('/billing/plans');
}

export function createBillingCheckout(
  token: string,
  interval: 'monthly' | 'annual',
  sourceFeature?: string,
): Promise<BillingCheckoutResponse> {
  return requestJson<BillingCheckoutResponse>('/billing/checkout', {
    method: 'POST',
    token,
    body: JSON.stringify({ interval, sourceFeature }),
  });
}

export function createBillingPortal(
  token: string,
): Promise<BillingPortalResponse> {
  return requestJson<BillingPortalResponse>('/billing/portal', {
    method: 'POST',
    token,
  });
}

export function cancelPremiumSubscription(token: string): Promise<unknown> {
  return requestJson<unknown>('/billing/subscription/cancel', {
    method: 'POST',
    token,
  });
}

export function getPremiumReminderSchedule(
  token: string,
  circleId: string,
): Promise<ReminderSchedule> {
  return requestJson<ReminderSchedule>(
    `/premium/circles/${circleId}/reminder-schedule`,
    { token },
  );
}

export function updatePremiumReminderSchedule(
  token: string,
  circleId: string,
  input: {
    enabled: boolean;
    repeatHours: number;
    nextRunAt?: string;
  },
): Promise<ReminderSchedule> {
  return requestJson<ReminderSchedule>(
    `/premium/circles/${circleId}/reminder-schedule`,
    {
      method: 'PUT',
      token,
      body: JSON.stringify(input),
    },
  );
}

/**
 * Send a circle assistant message (production v2).
 * Requires Idempotency-Key (8–128 chars). Prefer createAssistantIdempotencyKey().
 */
export function sendAiAssistantMessage(
  token: string,
  circleId: string,
  message: string,
  locale: string,
  options?: {
    conversationId?: string | null;
    idempotencyKey?: string;
  },
): Promise<AiAssistantResponse> {
  const conversationId = String(options?.conversationId || '').trim();
  const idempotencyKey = String(
    options?.idempotencyKey ||
      `m-ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  ).trim();
  const path = conversationId
    ? `/assistant/circles/${circleId}/conversations/${encodeURIComponent(conversationId)}/messages`
    : `/assistant/circles/${circleId}/messages`;
  return requestJson<AiAssistantResponse>(path, {
    method: 'POST',
    token,
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      message,
      locale,
      idempotencyKey,
    }),
  });
}

export type AssistantConversationSummary = {
  id: string;
  circleId: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
};

export type AssistantStoredMessage = {
  id: string;
  conversationId: string;
  role: string;
  status: string;
  locale: string;
  message: string;
  responseType?: string | null;
  explanationCodes?: string[];
  factRefs?: string[];
  navigationSuggestions?: AiAssistantNavigationSuggestion[];
  errorCode?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

export function listAssistantConversations(
  token: string,
  circleId: string,
): Promise<{ conversations: AssistantConversationSummary[] }> {
  return requestJson(`/assistant/circles/${circleId}/conversations`, { token });
}

export function listAssistantMessages(
  token: string,
  circleId: string,
  conversationId: string,
): Promise<{
  conversation: AssistantConversationSummary;
  messages: AssistantStoredMessage[];
}> {
  return requestJson(
    `/assistant/circles/${circleId}/conversations/${encodeURIComponent(conversationId)}/messages`,
    { token },
  );
}

export function createCircle(
  token: string,
  input: CreateCircleInput,
): Promise<CreatedCircleResponse> {
  return requestJson<CreatedCircleResponse>('/groups', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

/** Archive evidence-backed circles; hard-delete only empty drafts. */
export function deleteCircle(
  token: string,
  circleId: string,
): Promise<{
  id: string;
  action: 'archived' | 'deleted';
  mode?: string;
  status: string;
  message?: string;
  circle?: unknown;
}> {
  return requestJson(`/groups/${circleId}`, {
    method: 'DELETE',
    token,
  });
}

/** Archive or delete all setup/draft/forming circles you organize. */
export function deleteAllSetupDrafts(token: string): Promise<{
  deletedCount: number;
  deleted: Array<{ id: string; name: string; status: string; action?: string }>;
  archivedCount?: number;
  archived?: Array<{ id: string; name: string; status: string; action?: string }>;
  skippedCount: number;
  skipped: Array<{ id: string; reason: string }>;
}> {
  return requestJson(`/groups/setup-drafts`, {
    method: 'DELETE',
    token,
  });
}

export function addCircleMember(
  token: string,
  circleId: string,
  input: CreateCircleMemberInput,
): Promise<unknown> {
  return requestJson<unknown>(`/groups/${circleId}/members`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export function getPublicInvitePreview(
  circleId: string,
): Promise<BackendInvitePreview> {
  return requestJson<BackendInvitePreview>(`/groups/${circleId}/invite`);
}

export type PlannedHandClaimJoinOptions = {
  claimToken?: string;
  /** Required when the action may claim a planned hand (CS-006). */
  acknowledgmentAccepted?: boolean;
  acknowledgmentVersion?: string;
  language?: string;
  clientIdentifier?: string;
};

export function requestJoin(
  token: string,
  circleId: string,
  claimTokenOrOptions?: string | PlannedHandClaimJoinOptions,
): Promise<BackendJoinResult> {
  const options: PlannedHandClaimJoinOptions =
    typeof claimTokenOrOptions === 'string'
      ? { claimToken: claimTokenOrOptions }
      : claimTokenOrOptions || {};
  const body: Record<string, unknown> = {};
  if (options.claimToken) {
    body.claimToken = options.claimToken;
  }
  if (options.acknowledgmentAccepted === true) {
    body.acknowledgmentAccepted = true;
    body.acknowledgmentVersion = options.acknowledgmentVersion;
    body.language = options.language;
    body.clientIdentifier = options.clientIdentifier;
  }
  return requestJson<BackendJoinResult>(`/groups/${circleId}/join`, {
    method: 'POST',
    token,
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
}

export function approveJoinRequest(
  token: string,
  circleId: string,
  requestId: string,
): Promise<unknown> {
  return requestJson<unknown>(`/groups/${circleId}/join-requests/${requestId}/approve`, {
    method: 'POST',
    token,
  });
}

export function declineJoinRequest(
  token: string,
  circleId: string,
  requestId: string,
): Promise<unknown> {
  return requestJson<unknown>(`/groups/${circleId}/join-requests/${requestId}`, {
    method: 'DELETE',
    token,
  });
}

export function removeCircleMember(
  token: string,
  circleId: string,
  memberId: string,
): Promise<unknown> {
  return requestJson<unknown>(`/groups/${circleId}/members/${memberId}`, {
    method: 'DELETE',
    token,
  });
}

export type StartCircleOptions = {
  /** Organizer reviewed payout order before start. */
  confirmPayoutOrder?: boolean;
  /** Organizer accepts managing unclaimed hands (cash path) or has none. */
  confirmUnclaimedHands?: boolean;
  snapshotId?: string;
  snapshotHash?: string;
  language?: AgreementLanguage;
};

export function startCircle(
  token: string,
  circleId: string,
  options: StartCircleOptions = {},
): Promise<CreatedCircleResponse> {
  const body: Record<string, unknown> = {};
  if (typeof options.confirmPayoutOrder === 'boolean') {
    body.confirmPayoutOrder = options.confirmPayoutOrder;
  }
  if (typeof options.confirmUnclaimedHands === 'boolean') {
    body.confirmUnclaimedHands = options.confirmUnclaimedHands;
  }
  if (options.snapshotId) body.snapshotId = options.snapshotId;
  if (options.snapshotHash) body.snapshotHash = options.snapshotHash;
  if (options.language) body.language = options.language;
  return requestJson<CreatedCircleResponse>(`/groups/${circleId}/start`, {
    method: 'POST',
    token,
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
}

export function rolloverCircle(
  token: string,
  circleId: string,
): Promise<CreatedCircleResponse> {
  return requestJson<CreatedCircleResponse>(`/groups/${circleId}/rollover`, {
    method: 'POST',
    token,
    body: JSON.stringify({ rotateTurnOrder: true }),
  });
}

export function reorderPayoutTurn(
  token: string,
  circleId: string,
  memberId: string,
  move: 'up' | 'down' | 'top' | 'bottom',
): Promise<unknown> {
  return requestJson<unknown>(`/groups/${circleId}/turn-order`, {
    method: 'POST',
    token,
    body: JSON.stringify({ memberId, move }),
  });
}

export function releasePayoutFromPot(
  token: string,
  circleId: string,
  input: {
    amount: number;
    memberId: string;
    note?: string;
    paymentMethod?: string;
  },
): Promise<unknown> {
  return requestJson<unknown>(`/rounds/${circleId}/wallet`, {
    method: 'POST',
    token,
    body: JSON.stringify({
      action: 'payout_from_pot',
      amount: input.amount,
      memberId: input.memberId,
      note: input.note,
      paymentMethod: input.paymentMethod,
    }),
  });
}

export async function createFinancialConnectionsSession(token: string): Promise<{ clientSecret: string }> {
  return requestJson<{ clientSecret: string }>('/wallet/stripe/financial-connections', {
    method: 'POST',
    token,
  });
}

export async function createPaymentIntent(
  token: string,
  circleId: string,
  roundNumber: number,
  memberId?: string,
): Promise<{
  clientSecret: string;
  paymentIntentId: string;
  memberId?: string;
  handId?: string;
  handNumber?: number;
  amountCents?: number;
}> {
  return requestJson<{
    clientSecret: string;
    paymentIntentId: string;
    memberId?: string;
    handId?: string;
    handNumber?: number;
    amountCents?: number;
  }>('/wallet/stripe/payment-intent', {
    method: 'POST',
    body: JSON.stringify({
      circleId,
      roundNumber,
      memberId: memberId || undefined,
      handId: memberId || undefined,
    }),
    token,
  });
}

export async function getLinkedAccounts(token: string): Promise<BackendLinkedAccount[]> {
  const res = await requestJson<{ accounts: BackendLinkedAccount[] }>('/wallet/stripe/accounts', {
    token,
  });
  return res.accounts;
}

export function updateUserProfile(
  token: string,
  payload: { name?: string; cashtag?: string; venmoHandle?: string; paypalEmail?: string }
): Promise<AuthUser> {
  return requestJson<AuthUser>('/auth/me', {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  });
}

export type BackendChatMessage = {
  id: string;
  circleId?: string;
  conversationId?: string | null;
  senderName: string;
  senderId: string;
  senderUserId?: string | null;
  text: string;
  timestamp: string;
  createdAt?: string | null;
  isSystem?: boolean;
};

export type BackendChatParticipant = {
  userId: string;
  memberId: string;
  name: string;
};

export type BackendChatConversation = {
  id: string;
  circleId: string;
  type: 'group' | 'direct';
  title: string;
  participants: BackendChatParticipant[];
  lastMessage: BackendChatMessage | null;
  unreadCount: number;
  lastReadAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BackendChatConversationList = {
  conversations: BackendChatConversation[];
  unreadCount: number;
};

export type BackendChatThread = {
  conversation: BackendChatConversation;
  messages: BackendChatMessage[];
};

export interface BackendLinkedAccount {
  id: string;
  bankName: string;
  last4: string;
}

export async function getChatMessages(circleId: string, token: string): Promise<BackendChatMessage[]> {
  return requestJson<BackendChatMessage[]>(`/groups/${circleId}/chat`, {
    token,
  });
}

export async function sendChatMessage(circleId: string, token: string, text: string): Promise<void> {
  return requestJson<void>(`/groups/${circleId}/chat`, {
    method: 'POST',
    token,
    body: JSON.stringify({ text }),
  });
}

export function getChatConversations(
  circleId: string,
  token: string,
): Promise<BackendChatConversationList> {
  return requestJson<BackendChatConversationList>(
    `/groups/${circleId}/conversations`,
    { token },
  );
}

export function createDirectChatConversation(
  circleId: string,
  token: string,
  memberId: string,
): Promise<BackendChatConversation> {
  return requestJson<BackendChatConversation>(
    `/groups/${circleId}/conversations/direct`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({ memberId }),
    },
  );
}

export function getConversationMessages(
  circleId: string,
  conversationId: string,
  token: string,
): Promise<BackendChatThread> {
  return requestJson<BackendChatThread>(
    `/groups/${circleId}/conversations/${conversationId}/messages`,
    { token },
  );
}

export function sendConversationMessage(
  circleId: string,
  conversationId: string,
  token: string,
  text: string,
): Promise<BackendChatMessage> {
  return requestJson<BackendChatMessage>(
    `/groups/${circleId}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({ text }),
    },
  );
}

export function deleteConversationMessage(
  circleId: string,
  conversationId: string,
  messageId: string,
  token: string,
): Promise<{
  messageId: string;
  deleted: boolean;
  notificationsDeleted: number;
}> {
  return requestJson(
    `/groups/${circleId}/conversations/${conversationId}/messages/${messageId}`,
    {
      method: 'DELETE',
      token,
    },
  );
}

export function markConversationRead(
  circleId: string,
  conversationId: string,
  token: string,
): Promise<{
  conversationId: string;
  readAt: string | null;
  unreadCount: number;
  notificationsUpdated: number;
}> {
  return requestJson(
    `/groups/${circleId}/conversations/${conversationId}/read`,
    {
      method: 'POST',
      token,
    },
  );
}

export async function getMemberAccessToken(circleId: string, memberId: string, token: string): Promise<{ claimToken: string }> {
  return requestJson<{ claimToken: string }>(`/groups/${circleId}/members/${memberId}/access-token`, {
    method: 'GET',
    token,
  });
}

/**
 * Derives a human-friendly short code from a circle UUID.
 * Example: "f3a1b2c4-5e6f-..." → "CSX-F3A1B2C4"
 */
export function circleShortCode(circleId: string): string {
  const segment = circleId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `CSX-${segment}`;
}

/**
 * Resolves a user-entered short code (e.g. "CSX-F3A1B2C4" or raw UUID prefix)
 * by searching the user's own circle list first, then attempting a public preview
 * lookup. Returns { circleId, preview } on success.
 */
export async function resolveCircleCode(
  token: string,
  rawCode: string,
): Promise<{ circleId: string; preview: BackendInvitePreview }> {
  const trimmed = rawCode.trim();

  if (trimmed.replace(/[-\s]/g, '').length < 6) {
    throw new ApiError('Code is too short. Check and try again.', 400);
  }

  // Public circle code: send the complete code directly to the backend.
  if (/^CSX-?/i.test(trimmed)) {
    const normalizedCode = trimmed
      .toUpperCase()
      .replace(/^CSX(?!-)/, 'CSX-');

    const preview = await getPublicInvitePreview(normalizedCode);

    return {
      circleId: preview.id ?? normalizedCode,
      preview,
    };
  }

  // Legacy UUID or UUID-prefix support.
  let circles: { id: string }[] = [];

  try {
    circles = await requestJson<{ id: string }[]>('/groups', { token });
  } catch {
    // Direct UUID lookup below can still succeed.
  }

  const cleaned = trimmed.toLowerCase();
  const searchString = cleaned.replace(/-/g, '');

  const matched = circles.find((circle) =>
    circle.id.replace(/-/g, '').toLowerCase().startsWith(searchString),
  );

  const identifier =
    matched?.id ??
    (searchString.length >= 32 ? cleaned : trimmed);

  const preview = await getPublicInvitePreview(identifier);

  return {
    circleId: preview.id ?? identifier,
    preview,
  };
}

/**
 * Request an additional hand (slot) in a circle the user already belongs to.
 * Each hand = an independent contribution + payout position.
 */
export function requestAdditionalHand(
  token: string,
  circleId: string,
  input: {
    previewHash: string;
    acceptedAdditionalHandObligation: true;
    consentTextVersion: string;
    language: AgreementLanguage;
    clientIdentifier: string;
  },
): Promise<unknown> {
  return requestJson<unknown>(`/groups/${circleId}/join`, {
    method: 'POST',
    token,
    body: JSON.stringify({ additionalHand: true, ...input }),
  });
}

export function finalizeCircleAgreementSnapshot(
  token: string,
  circleId: string,
): Promise<CircleAgreementSnapshot> {
  return requestJson<CircleAgreementSnapshot>(`/groups/${circleId}/agreement-snapshot/finalize`, {
    method: 'POST',
    token,
  });
}

export function getCircleAgreementContent(
  token: string,
): Promise<CircleAgreementContent> {
  return requestJson<CircleAgreementContent>('/groups/agreements/content', { token });
}

export function getCircleAgreementSnapshot(
  token: string,
  circleId: string,
): Promise<CircleAgreementSnapshot> {
  return requestJson<CircleAgreementSnapshot>(`/groups/${circleId}/agreement-snapshot`, { token });
}

export function getCircleAgreementReadiness(
  token: string,
  circleId: string,
): Promise<CircleAgreementReadiness> {
  return requestJson<CircleAgreementReadiness>(`/groups/${circleId}/agreement-readiness`, { token });
}

export function acceptCircleAgreement(
  token: string,
  circleId: string,
  input: {
    snapshotId: string;
    snapshotHash: string;
    documentType: 'circle_participation_agreement' | 'organizer_agreement' | 'final_circle_snapshot';
    documentVersion: string;
    accepted: true;
    language: AgreementLanguage;
    clientIdentifier: string;
  },
): Promise<{ acceptanceId: string; idempotent: boolean; acceptedAt: string }> {
  return requestJson(`/groups/${circleId}/agreement-acceptances`, {
    method: 'POST', token, body: JSON.stringify(input),
  });
}

export function getAdditionalHandPreview(
  token: string,
  circleId: string,
): Promise<AdditionalHandPreview> {
  return requestJson<AdditionalHandPreview>(`/groups/${circleId}/additional-hand-preview`, {
    method: 'POST', token,
  });
}

export function downloadPayoutOrderPdf(
  token: string,
  circleId: string,
): Promise<MemberStatementPdfResult> {
  return requestPdf(
    `/groups/${encodeURIComponent(circleId)}/payout-order/pdf`,
    token,
  );
}

export async function exportUserData(token: string): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>('/auth/me/export', { token });
}

export async function deleteAccount(token: string): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>('/auth/me/delete', {
    method: 'POST',
    token,
  });
}
