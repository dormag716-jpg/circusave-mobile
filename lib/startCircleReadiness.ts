/**
 * Client-side readiness checks before calling startCircle.
 * Lifecycle phase is derived only from backend status / startedAt / isStarted.
 * Pure helpers so unit tests can run without React Native.
 */

export type StartCircleMemberLike = {
  id: string;
  isParticipating?: boolean;
  userId?: string | null;
  name?: string | null;
  full_name?: string | null;
  displayLabel?: string | null;
};

export type StartCircleWaitlistLike = {
  id?: string;
  userId?: string | null;
  handNumber?: number;
  hand_number?: number;
  isAdditionalHand?: boolean;
  is_additional_hand?: boolean;
};

/**
 * Authoritative lifecycle fields from circle detail / public circle.
 * Do not extend this type with schedule or contribution fields for phase checks.
 */
export type StartCircleDetailLike = {
  status?: string | null;
  startedAt?: string | null;
  /** Derived by backend from status + startedAt only. Convenience, not a separate store. */
  isStarted?: boolean | null;
  is_started?: boolean | null;
  turnOrder?: string[] | null;
  pot_status?: string | null;
};

export type CircleLifecyclePhase = 'setup' | 'active' | 'completed';

export type StartCircleConfirmations = {
  confirmPayoutOrder: boolean;
  confirmUnclaimedHands: boolean;
};

export type StartReviewHint = {
  id: 'payout_order' | 'unclaimed_hands' | 'pending_requests';
  title: string;
  detail: string;
};

function normalizeStatus(status: string | null | undefined): string {
  return String(status || '')
    .trim()
    .toLowerCase();
}

/**
 * Whether the circle has started (live or completed past start).
 * Prefer API `isStarted` when present; otherwise status + startedAt only.
 * Never uses schedule, contributions, pot totals, or member counts.
 */
export function isCircleStarted(circle: StartCircleDetailLike): boolean {
  if (typeof circle.isStarted === 'boolean') {
    return circle.isStarted;
  }
  if (typeof circle.is_started === 'boolean') {
    return circle.is_started;
  }
  if (circle.startedAt) {
    return true;
  }
  const status = normalizeStatus(circle.status);
  return status === 'active' || status === 'completed';
}

export function isCircleCompleted(circle: StartCircleDetailLike): boolean {
  return normalizeStatus(circle.status) === 'completed';
}

/** True only while the circle has not started (draft/setup). */
export function isCircleNotStarted(circle: StartCircleDetailLike): boolean {
  return getCircleLifecyclePhase(circle) === 'setup';
}

/**
 * Single phase for Round / People tabs.
 * - setup: draft (or legacy setup/forming) and not started
 * - active: started and not completed
 * - completed: status completed
 */
export function getCircleLifecyclePhase(
  circle: StartCircleDetailLike,
): CircleLifecyclePhase {
  const status = normalizeStatus(circle.status);
  if (status === 'completed') {
    return 'completed';
  }
  // Non-product states: never treat as setup (no Start / structural edits).
  if (status === 'paused' || status === 'closed') {
    return 'active';
  }
  if (isCircleStarted(circle)) {
    return 'active';
  }
  return 'setup';
}

/**
 * Start Circle / structural setup actions are only for setup phase.
 * Not started and not completed.
 */
export function isCircleSetupState(circle: StartCircleDetailLike): boolean {
  return getCircleLifecyclePhase(circle) === 'setup';
}

export function isAdditionalHandRequest(entry: StartCircleWaitlistLike): boolean {
  const handNumber = Number(entry.handNumber ?? entry.hand_number ?? 1);
  return entry.isAdditionalHand === true || entry.is_additional_hand === true || handNumber > 1;
}

export function getParticipatingHands(
  members: StartCircleMemberLike[],
): StartCircleMemberLike[] {
  return members.filter((member) => member.isParticipating !== false);
}

export function memberDisplayName(member: StartCircleMemberLike): string {
  return (
    String(member.displayLabel || member.full_name || member.name || '').trim() ||
    'Hand'
  );
}

/** Participating hands with no connected user (planned / unclaimed). */
export function getUnclaimedParticipatingHands(
  members: StartCircleMemberLike[],
): StartCircleMemberLike[] {
  return getParticipatingHands(members).filter(
    (member) => !String(member.userId || '').trim(),
  );
}

export function requiresUnclaimedStartConfirmation(
  members: StartCircleMemberLike[],
): boolean {
  return getUnclaimedParticipatingHands(members).length > 0;
}

/**
 * Ordered payout lines for pre-start review (position + hand label).
 */
export function buildPayoutOrderReviewLines(input: {
  members: StartCircleMemberLike[];
  turnOrder?: string[] | null;
}): string[] {
  const { members, turnOrder } = input;
  const byId = new Map(members.map((member) => [member.id, member]));
  const order = Array.isArray(turnOrder) ? turnOrder : [];
  const lines: string[] = [];

  order.forEach((handId, index) => {
    const member = byId.get(handId);
    if (!member || member.isParticipating === false) {
      return;
    }
    lines.push(`${index + 1}. ${memberDisplayName(member)}`);
  });

  const orderedIds = new Set(order);
  for (const hand of getParticipatingHands(members)) {
    if (!orderedIds.has(hand.id)) {
      lines.push(`• ${memberDisplayName(hand)} (not in payout order)`);
    }
  }

  return lines;
}

export function buildUnclaimedHandsReviewLines(
  members: StartCircleMemberLike[],
): string[] {
  return getUnclaimedParticipatingHands(members).map(
    (hand) => `• ${memberDisplayName(hand)}`,
  );
}

export function getStartCircleReviewHints(input: {
  members: StartCircleMemberLike[];
  waitlist?: StartCircleWaitlistLike[];
}): StartReviewHint[] {
  const hints: StartReviewHint[] = [];
  const unclaimed = getUnclaimedParticipatingHands(input.members);
  if (unclaimed.length > 0) {
    hints.push({
      id: 'unclaimed_hands',
      title: 'Unclaimed hands',
      detail: `${unclaimed.length} planned hand${unclaimed.length === 1 ? '' : 's'} still need a claim invite or organizer-managed confirmation.`,
    });
  }
  hints.push({
    id: 'payout_order',
    title: 'Payout order',
    detail: 'Review the payout order before starting — it locks with the circle.',
  });
  return hints;
}

/**
 * Returns a user-facing block reason, or null when the circle is ready to start.
 * Unclaimed hands are NOT a hard block — they require explicit organizer confirmation.
 */
export function getStartCircleBlockReason(input: {
  circle: StartCircleDetailLike;
  members: StartCircleMemberLike[];
  waitlist: StartCircleWaitlistLike[];
}): string | null {
  const { circle, members, waitlist } = input;

  if (!isCircleSetupState(circle)) {
    return 'This circle has already been started or completed.';
  }

  const pendingJoin = waitlist.filter((entry) => !isAdditionalHandRequest(entry));
  if (pendingJoin.length > 0) {
    return 'Approve or decline all pending join requests before starting.';
  }

  const pendingAdditional = waitlist.filter((entry) => isAdditionalHandRequest(entry));
  if (pendingAdditional.length > 0) {
    return 'Approve or decline all pending additional-hand requests before starting.';
  }

  const hands = getParticipatingHands(members);
  if (hands.length < 2) {
    return 'A circle needs at least 2 participating hands before it can start.';
  }

  const turnOrder = Array.isArray(circle.turnOrder) ? circle.turnOrder : [];
  if (turnOrder.length === 0) {
    return 'The payout order must include every participating hand.';
  }

  const handIds = new Set(hands.map((hand) => hand.id));
  const orderIds = new Set(turnOrder);

  for (const handId of handIds) {
    if (!orderIds.has(handId)) {
      return 'The payout order must include every participating hand.';
    }
  }

  for (const orderId of orderIds) {
    if (!handIds.has(orderId)) {
      return 'The payout order must include every participating hand.';
    }
  }

  return null;
}

export function canShowStartCircleAction(input: {
  isOrganizer: boolean;
  circle: StartCircleDetailLike;
}): boolean {
  return input.isOrganizer && isCircleSetupState(input.circle);
}

export function buildStartCircleConfirmations(input: {
  members: StartCircleMemberLike[];
  payoutOrderReviewed: boolean;
  unclaimedManagedConfirmed: boolean;
}): StartCircleConfirmations {
  const needsUnclaimed = requiresUnclaimedStartConfirmation(input.members);
  return {
    confirmPayoutOrder: Boolean(input.payoutOrderReviewed),
    confirmUnclaimedHands: needsUnclaimed
      ? Boolean(input.unclaimedManagedConfirmed)
      : true,
  };
}
