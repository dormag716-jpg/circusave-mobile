import type {
  ActivityResponse,
  BackendCircleSummary,
  DashboardSummary,
} from './types';

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
  sent: boolean;
  challengeId?: string;
  expiresIn?: number;
  deliveryStatus?: string;
  message?: string;
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
  memberCount?: number;
  uniqueMemberCount?: number;
  viewerHands?: BackendCircleMember[];
  viewerHandCount?: number;
  viewerContributionSummary?: BackendViewerContributionSummary | null;
  totalRounds?: number;
  organizerId: string;
  paymentInstructions?: string | null;
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
  waitlist?: BackendCircleMember[];
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

export type BackendRoundContribution = {
  confirmedAt?: string | null;
  memberId: string;
  note?: string | null;
  paymentMethod?: string | null;
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
};

export type BackendLedgerPage = {
  entries: BackendLedgerEntry[];
  limit?: number;
  next_cursor?: string | null;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
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

async function requestJson<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers: providedHeaders, ...requestOptions } = options;
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

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
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

  if (!response.ok) {
    throw new ApiError(errorMessage(payload, response.status), response.status);
  }

  return payload as T;
}

function normalizeAuthResponse(payload: unknown, requireToken: boolean): AuthResponse {
  if (!isRecord(payload) || !isRecord(payload.user) || !isRecord(payload.session)) {
    throw new ApiError('Authentication response was invalid.', 500);
  }

  const user = payload.user;
  const session = payload.session;
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

export async function register(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<AuthResponse> {
  const payload = await requestJson<unknown>('/auth/mobile/register', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || undefined,
      password: input.password,
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

export function getDashboardSummary(token: string): Promise<DashboardSummary> {
  return requestJson<DashboardSummary>('/dashboard/summary', { token });
}

export function getActivity(token: string): Promise<ActivityResponse> {
  return requestJson<ActivityResponse>('/activity', { token });
}

export function getCircles(token: string): Promise<BackendCircleSummary[]> {
  return requestJson<BackendCircleSummary[]>('/groups', { token });
}

export function getCircleDetail(
  token: string,
  circleId: string,
): Promise<BackendCircleDetail> {
  return requestJson<BackendCircleDetail>(`/groups/${circleId}`, { token });
}

export function updateCircleSettings(
  token: string,
  circleId: string,
  settings: { paymentInstructions?: string },
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
  input: { reason?: string } = {},
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
  input: { note?: string; paymentMethod?: string } = {},
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

export function deleteCircle(token: string, circleId: string): Promise<unknown> {
  return requestJson<unknown>(`/groups/${circleId}`, {
    method: 'DELETE',
    token,
  });
}

/** Permanently delete all setup/draft/forming circles you organize. */
export function deleteAllSetupDrafts(token: string): Promise<{
  deletedCount: number;
  deleted: Array<{ id: string; name: string; status: string }>;
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

export function requestJoin(
  token: string,
  circleId: string,
  claimToken?: string,
): Promise<BackendCircleDetail> {
  return requestJson<BackendCircleDetail>(`/groups/${circleId}/join`, {
    method: 'POST',
    token,
    body: claimToken ? JSON.stringify({ claimToken }) : undefined,
  });
}

export function approveJoinRequest(
  token: string,
  circleId: string,
  memberId: string,
): Promise<unknown> {
  return requestJson<unknown>(`/groups/${circleId}/members/${memberId}/approve`, {
    method: 'POST',
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
};

export function startCircle(
  token: string,
  circleId: string,
  options: StartCircleOptions = {},
): Promise<CreatedCircleResponse> {
  const body: Record<string, boolean> = {};
  if (options.confirmPayoutOrder) {
    body.confirmPayoutOrder = true;
  }
  if (options.confirmUnclaimedHands) {
    body.confirmUnclaimedHands = true;
  }
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
  amount: number,
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
      // Server derives authoritative amount; amount kept for older backends.
      amount: Math.round(amount * 100),
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
): Promise<{ user: AuthUser; session: AuthSession }> {
  return requestJson<{ user: AuthUser; session: AuthSession }>('/auth/me', {
    method: 'PUT',
    token,
    body: JSON.stringify(payload),
  });
}

export type BackendChatMessage = {
  id: string;
  senderName: string;
  senderId: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
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

export async function sendChatMessage(circleId: string, token: string, text: string, senderName: string, senderId: string): Promise<void> {
  return requestJson<void>(`/groups/${circleId}/chat`, {
    method: 'POST',
    token,
    body: JSON.stringify({ text }),
  });
}

export async function requestPositionSwap(circleId: string, token: string, targetMemberId: string): Promise<void> {
  return requestJson<void>(`/groups/${circleId}/swaps`, {
    method: 'POST',
    token,
    body: JSON.stringify({ targetMemberId }),
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
): Promise<unknown> {
  return requestJson<unknown>(`/groups/${circleId}/join`, {
    method: 'POST',
    token,
    body: JSON.stringify({ additionalHand: true }),
  });
}


