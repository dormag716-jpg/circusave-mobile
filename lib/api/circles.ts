import { ApiError } from '../platform/networkErrors';
import { type ActivityResponse, type BackendCircleSummary, type DashboardSummary } from '../shared/types';
import { requestJson, type ApiGetOptions } from './http';
import { requestPdf, type MemberStatementPdfResult, type StatementActor } from './statements';

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
  /** True when the request asked to claim an existing planned hand. */
  claimsPlannedHand?: boolean;
  matchedMembershipId?: string | null;
  matchedMemberName?: string | null;
  matchedHandNumber?: number | null;
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
  /** People who joined (claimed a hand). Absent on older backends. */
  joinedMembersCount?: number;
  /** Participating hands, claimed or not. Absent on older backends. */
  plannedHandsCount?: number;
  /** Planned hands nobody has claimed yet. Absent on older backends. */
  unclaimedHandsCount?: number;
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

export function getDashboardSummary(
  token: string,
  options?: ApiGetOptions,
): Promise<DashboardSummary> {
  return requestJson<DashboardSummary>('/dashboard/summary', {
    token,
    revalidate: options?.revalidate,
  });
}

export type ActivityGetOptions = ApiGetOptions & {
  limit?: number;
  cursor?: string | null;
};

export function getActivity(
  token: string,
  options?: ActivityGetOptions,
): Promise<ActivityResponse> {
  const params = new URLSearchParams();
  if (typeof options?.limit === 'number' && Number.isFinite(options.limit)) {
    params.set('limit', String(Math.max(1, Math.floor(options.limit))));
  }
  const cursor = String(options?.cursor || '').trim();
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return requestJson<ActivityResponse>(`/activity${qs ? `?${qs}` : ''}`, {
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
  options?: ApiGetOptions,
): Promise<BackendRoundSnapshot> {
  return requestJson<BackendRoundSnapshot>(`/groups/${circleId}/schedule`, {
    token,
    revalidate: options?.revalidate,
  });
}

export function getLedgerEntries(
  token: string,
  circleId: string,
): Promise<BackendLedgerPage> {
  return requestJson<BackendLedgerPage>(`/ledger/${circleId}`, { token });
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
