/**
 * Structured Phase 1 setup progress for the pre-start People tab.
 *
 * Pure derivation from backend circle facts — no React Native, no AI calls.
 * UI consumes this now; AI Susu can consume the same model later.
 */

import {
  getParticipatingHands,
  getStartCircleBlockReason,
  getUnclaimedParticipatingHands,
  isAdditionalHandRequest,
  isCircleSetupState,
  memberDisplayName,
  type StartCircleDetailLike,
  type StartCircleMemberLike,
  type StartCircleWaitlistLike,
} from './startCircleReadiness';

export type SetupStepStatus =
  | 'complete'
  | 'action_required'
  | 'waiting'
  | 'blocked';

export type SetupStepId =
  | 'invite_members'
  | 'review_claims_joins'
  | 'confirm_member_access'
  | 'review_additional_hands'
  | 'verify_structure'
  | 'finalize_payout_order'
  | 'review_and_start';

export type CircleSetupStep = {
  id: SetupStepId;
  title: string;
  status: SetupStepStatus;
  reason?: string;
  nextAction?: string;
};

export type CircleSetupStructureSummary = {
  peopleCount: number;
  handCount: number;
  totalRounds: number;
  contributionPerHand: number;
  potPerRound: number;
  organizerParticipates: boolean;
  circleCode: string | null;
  /** Plan capacity (free 20 / premium 50) for AI Susu + UI. */
  capacityMaxHands?: number;
  capacityUsedHands?: number;
  capacityTier?: string;
};

export type CircleSetupProgress = {
  phase: 'setup';
  steps: CircleSetupStep[];
  blockingReasons: string[];
  nextAction: string | null;
  structure: CircleSetupStructureSummary;
  counts: {
    plannedHands: number;
    claimedHands: number;
    unclaimedHands: number;
    pendingJoinRequests: number;
    pendingAdditionalHandRequests: number;
  };
  /**
   * Structural completeness: every participating hand id appears exactly once
   * in turnOrder. Does NOT mean the organizer has reviewed/confirmed the order.
   */
  payoutOrderComplete: boolean;
  /**
   * Mirrors the existing start contract `confirmPayoutOrder`.
   * False until the organizer performs the start-flow payout-order confirmation.
   * Not an independently mutable database field.
   */
  payoutOrderReviewed: boolean;
  /** True when structure is complete but organizer review is still required. */
  reviewRequired: boolean;
  /** Backend start-block reason, or null when start is allowed (still needs organizer confirm). */
  startBlockReason: string | null;
};

export type CircleSetupProgressInput = {
  circle: StartCircleDetailLike & {
    circleCode?: string | null;
    contributionAmount?: number | null;
    handCount?: number | null;
    totalHands?: number | null;
    uniqueMemberCount?: number | null;
    memberCount?: number | null;
    totalRounds?: number | null;
    /**
     * Proven API: organizer membership (hand) id (`organizer_member_id`).
     * Do not assume this equals users.id.
     */
    organizerId?: string | null;
    /** Optional organizer users.id when present on the payload. */
    organizerUserId?: string | null;
    /** Explicit backend flag when present. */
    organizerParticipates?: boolean | null;
    rosterCapacity?: {
      tier?: string;
      maxHands?: number;
      usedHands?: number;
    } | null;
  };
  members: StartCircleMemberLike[];
  waitlist?: StartCircleWaitlistLike[];
  /**
   * Existing start contract flag (`confirmPayoutOrder`). Defaults false.
   * UI sets true only after the organizer confirms order in the start flow.
   */
  payoutOrderReviewed?: boolean;
};

const STEP_TITLES: Record<SetupStepId, string> = {
  invite_members: 'Invite members',
  review_claims_joins: 'Review claims and join requests',
  confirm_member_access: 'Confirm member access',
  review_additional_hands: 'Review additional-hand requests',
  verify_structure: 'Verify people, hands, rounds, and pot',
  finalize_payout_order: 'Finalize payout order',
  review_and_start: 'Review and start',
};

export function splitWaitlistRequests<T extends StartCircleWaitlistLike>(waitlist: T[] = []): {
  joinRequests: T[];
  additionalHandRequests: T[];
} {
  const joinRequests: T[] = [];
  const additionalHandRequests: T[] = [];
  for (const entry of waitlist) {
    if (isAdditionalHandRequest(entry)) {
      additionalHandRequests.push(entry);
    } else {
      joinRequests.push(entry);
    }
  }
  return { joinRequests, additionalHandRequests };
}

export function isPayoutOrderComplete(input: {
  members: StartCircleMemberLike[];
  turnOrder?: string[] | null;
}): boolean {
  const hands = getParticipatingHands(input.members);
  if (hands.length < 2) {
    return false;
  }
  const turnOrder = Array.isArray(input.turnOrder) ? input.turnOrder : [];
  if (turnOrder.length === 0) {
    return false;
  }
  const handIds = new Set(hands.map((hand) => hand.id));
  const orderIds = new Set(turnOrder);
  if (handIds.size !== orderIds.size) {
    return false;
  }
  for (const handId of handIds) {
    if (!orderIds.has(handId)) {
      return false;
    }
  }
  for (const orderId of orderIds) {
    if (!handIds.has(orderId)) {
      return false;
    }
  }
  return true;
}

/**
 * Whether the organizer holds a participating hand.
 *
 * Identifier rules:
 * - Prefer explicit `organizerParticipates` when the backend provides it.
 * - Prefer matching `member.userId` to `organizerUserId` (both user ids).
 * - Proven API contract: `circle.organizerId` is the organizer membership/hand id
 *   (`organizer_member_id`), comparable to `member.id` only.
 * - Never treat a membership id as claimed workspace access.
 */
export function deriveOrganizerParticipates(input: {
  members: StartCircleMemberLike[];
  organizerId?: string | null;
  organizerUserId?: string | null;
  organizerParticipates?: boolean | null;
}): boolean {
  if (typeof input.organizerParticipates === 'boolean') {
    return input.organizerParticipates;
  }

  const organizerUserId = String(input.organizerUserId || '').trim();
  if (organizerUserId) {
    const organizerHands = input.members.filter(
      (m) => String(m.userId || '').trim() === organizerUserId,
    );
    if (organizerHands.length === 0) {
      return false;
    }
    return organizerHands.some((hand) => hand.isParticipating !== false);
  }

  // Proven contract: organizerId === organizer membership (hand) id.
  const organizerMemberId = String(input.organizerId || '').trim();
  if (!organizerMemberId) {
    return false;
  }
  const byMembershipId = input.members.find((m) => m.id === organizerMemberId);
  if (byMembershipId) {
    return byMembershipId.isParticipating !== false;
  }

  // Unlike ids: organizerId did not match any membership id.
  // Do not invent participation by comparing membership ids to user ids.
  return false;
}

export function buildStructureSummary(input: CircleSetupProgressInput): CircleSetupStructureSummary {
  const hands = getParticipatingHands(input.members);
  const handCount =
    typeof input.circle.handCount === 'number'
      ? input.circle.handCount
      : typeof input.circle.totalHands === 'number'
        ? input.circle.totalHands
        : hands.length;

  const claimedUserIds = new Set(
    hands
      .map((hand) => String(hand.userId || '').trim())
      .filter(Boolean),
  );
  const peopleCount =
    typeof input.circle.uniqueMemberCount === 'number'
      ? input.circle.uniqueMemberCount
      : claimedUserIds.size > 0
        ? claimedUserIds.size
        : hands.length;

  const contributionPerHand = Number(input.circle.contributionAmount || 0);
  const totalRounds =
    typeof input.circle.totalRounds === 'number' && input.circle.totalRounds > 0
      ? input.circle.totalRounds
      : handCount;

  const rosterCap = input.circle.rosterCapacity;
  return {
    peopleCount,
    handCount,
    totalRounds,
    contributionPerHand,
    potPerRound: contributionPerHand * handCount,
    organizerParticipates: deriveOrganizerParticipates({
      members: input.members,
      organizerId: input.circle.organizerId,
      organizerUserId: input.circle.organizerUserId,
      organizerParticipates: input.circle.organizerParticipates,
    }),
    circleCode: String(input.circle.circleCode || '').trim() || null,
    capacityMaxHands:
      typeof rosterCap?.maxHands === 'number' ? rosterCap.maxHands : undefined,
    capacityUsedHands:
      typeof rosterCap?.usedHands === 'number' ? rosterCap.usedHands : handCount,
    capacityTier: rosterCap?.tier ? String(rosterCap.tier) : undefined,
  };
}

/**
 * Returns setup progress only while lifecycle phase is setup.
 * Callers must not show the command center when this returns null.
 */
export function buildCircleSetupProgress(
  input: CircleSetupProgressInput,
): CircleSetupProgress | null {
  if (!isCircleSetupState(input.circle)) {
    return null;
  }

  const waitlist = input.waitlist ?? [];
  const { joinRequests, additionalHandRequests } = splitWaitlistRequests(waitlist);
  const hands = getParticipatingHands(input.members);
  const unclaimed = getUnclaimedParticipatingHands(input.members);
  const claimedHands = hands.length - unclaimed.length;
  const structure = buildStructureSummary(input);
  const payoutOrderComplete = isPayoutOrderComplete({
    members: input.members,
    turnOrder: input.circle.turnOrder,
  });
  const payoutOrderReviewed = Boolean(input.payoutOrderReviewed);
  const reviewRequired = payoutOrderComplete && !payoutOrderReviewed;
  const startBlockReason = getStartCircleBlockReason({
    circle: input.circle,
    members: input.members,
    waitlist,
  });

  const steps: CircleSetupStep[] = [
    buildInviteStep(structure),
    buildJoinRequestsStep(joinRequests.length),
    buildMemberAccessStep(hands.length, claimedHands, unclaimed.length),
    buildAdditionalHandsStep(additionalHandRequests.length),
    buildVerifyStructureStep(structure),
    buildPayoutOrderStep(payoutOrderComplete, payoutOrderReviewed, hands.length),
    buildReviewAndStartStep(
      startBlockReason,
      payoutOrderComplete,
      payoutOrderReviewed,
    ),
  ];

  const blockingReasons = collectBlockingReasons(steps, startBlockReason);
  const nextAction = pickNextAction(steps);

  return {
    phase: 'setup',
    steps,
    blockingReasons,
    nextAction,
    structure,
    counts: {
      plannedHands: hands.length,
      claimedHands,
      unclaimedHands: unclaimed.length,
      pendingJoinRequests: joinRequests.length,
      pendingAdditionalHandRequests: additionalHandRequests.length,
    },
    payoutOrderComplete,
    payoutOrderReviewed,
    reviewRequired,
    startBlockReason,
  };
}

function buildInviteStep(structure: CircleSetupStructureSummary): CircleSetupStep {
  const id: SetupStepId = 'invite_members';
  const title = STEP_TITLES[id];

  if (structure.handCount < 2) {
    return {
      id,
      title,
      status: 'action_required',
      reason: 'A circle needs at least 2 planned hands before invites matter.',
      nextAction: 'Add planned members so the circle has 2 or more hands.',
    };
  }
  if (!structure.circleCode) {
    return {
      id,
      title,
      status: 'action_required',
      reason: 'Circle invite code is not available yet.',
      nextAction: 'Refresh the circle and share the invite code when it appears.',
    };
  }
  // Claims do not gate this step — unclaimed hands belong to Confirm Member Access.
  return {
    id,
    title,
    status: 'complete',
    reason: 'Invite method is ready (circle code available; at least 2 planned hands).',
  };
}

function buildJoinRequestsStep(pendingJoins: number): CircleSetupStep {
  const id: SetupStepId = 'review_claims_joins';
  const title = STEP_TITLES[id];

  if (pendingJoins > 0) {
    return {
      id,
      title,
      status: 'action_required',
      reason: `${pendingJoins} join request${pendingJoins === 1 ? '' : 's'} waiting for organizer review.`,
      nextAction: 'Approve or decline pending join requests.',
    };
  }
  // Unclaimed planned hands do not keep this step waiting.
  return {
    id,
    title,
    status: 'complete',
    reason: 'No pending join requests.',
  };
}

function buildMemberAccessStep(
  plannedHands: number,
  claimedHands: number,
  unclaimedCount: number,
): CircleSetupStep {
  const id: SetupStepId = 'confirm_member_access';
  const title = STEP_TITLES[id];

  if (plannedHands < 2) {
    return {
      id,
      title,
      status: 'blocked',
      reason: 'Not enough planned hands to confirm access.',
      nextAction: 'Add planned members first.',
    };
  }
  if (unclaimedCount > 0) {
    return {
      id,
      title,
      status: 'waiting',
      reason:
        `${claimedHands} hand${claimedHands === 1 ? '' : 's'} connected to an account · ` +
        `${unclaimedCount} planned hand${unclaimedCount === 1 ? '' : 's'} still unclaimed. ` +
        'Unclaimed hands do not have workspace access. Organizer-managed cash hands stay unclaimed — they are not claimed access.',
      nextAction:
        'Share claim invites for unclaimed hands, or keep them unclaimed for cash management at Start.',
    };
  }
  return {
    id,
    title,
    status: 'complete',
    reason: `All ${claimedHands} planned hands are claimed with workspace access.`,
  };
}

function buildAdditionalHandsStep(pendingAdditional: number): CircleSetupStep {
  const id: SetupStepId = 'review_additional_hands';
  const title = STEP_TITLES[id];

  if (pendingAdditional > 0) {
    return {
      id,
      title,
      status: 'action_required',
      reason: `${pendingAdditional} additional-hand request${pendingAdditional === 1 ? '' : 's'} awaiting approval.`,
      nextAction: 'Approve or decline Hand 2 / Hand 3 requests.',
    };
  }
  return {
    id,
    title,
    status: 'complete',
    reason: 'No pending additional-hand requests.',
  };
}

function buildVerifyStructureStep(
  structure: CircleSetupStructureSummary,
): CircleSetupStep {
  const id: SetupStepId = 'verify_structure';
  const title = STEP_TITLES[id];

  if (structure.handCount < 2) {
    return {
      id,
      title,
      status: 'action_required',
      reason: 'Need at least 2 participating hands.',
      nextAction: 'Add planned members until there are 2 or more hands.',
    };
  }
  if (!(structure.contributionPerHand > 0)) {
    return {
      id,
      title,
      status: 'action_required',
      reason: 'Contribution amount is missing or zero.',
      nextAction: 'Confirm contribution amount on the circle detail.',
    };
  }
  return {
    id,
    title,
    status: 'complete',
    reason: `${structure.peopleCount} people · ${structure.handCount} hands · ${structure.totalRounds} rounds · pot ${structure.potPerRound}.`,
  };
}

function buildPayoutOrderStep(
  payoutOrderComplete: boolean,
  payoutOrderReviewed: boolean,
  handCount: number,
): CircleSetupStep {
  const id: SetupStepId = 'finalize_payout_order';
  const title = STEP_TITLES[id];

  if (handCount < 2) {
    return {
      id,
      title,
      status: 'blocked',
      reason: 'Payout order needs at least 2 hands.',
      nextAction: 'Add planned hands before ordering payouts.',
    };
  }
  if (!payoutOrderComplete) {
    return {
      id,
      title,
      status: 'action_required',
      reason: 'Payout order is incomplete or out of sync with participating hands.',
      nextAction: 'Reorder hands so every participating hand appears exactly once.',
    };
  }
  // Structural completeness is not organizer review.
  if (!payoutOrderReviewed) {
    return {
      id,
      title,
      status: 'action_required',
      reason:
        'Every participating hand has a position, but the organizer has not confirmed the order yet.',
      nextAction:
        'Review positions, then confirm the payout order in the Start Circle flow.',
    };
  }
  return {
    id,
    title,
    status: 'complete',
    reason: 'Payout order is complete and confirmed by the organizer.',
  };
}

function buildReviewAndStartStep(
  startBlockReason: string | null,
  payoutOrderComplete: boolean,
  payoutOrderReviewed: boolean,
): CircleSetupStep {
  const id: SetupStepId = 'review_and_start';
  const title = STEP_TITLES[id];

  if (startBlockReason) {
    return {
      id,
      title,
      status: 'blocked',
      reason: startBlockReason,
      nextAction: startBlockReason,
    };
  }
  if (!payoutOrderComplete) {
    return {
      id,
      title,
      status: 'blocked',
      reason: 'Payout order must include every participating hand.',
      nextAction: 'Complete the payout order structure first.',
    };
  }
  if (!payoutOrderReviewed) {
    return {
      id,
      title,
      status: 'action_required',
      reason:
        'Start requires confirming the payout order (existing confirmPayoutOrder contract).',
      nextAction: 'Review and confirm payout order, then start the circle.',
    };
  }
  return {
    id,
    title,
    status: 'action_required',
    reason:
      'Order confirmed. Start Circle when ready (confirm unclaimed cash hands if any).',
    nextAction: 'Start the circle when ready.',
  };
}

function collectBlockingReasons(
  steps: CircleSetupStep[],
  startBlockReason: string | null,
): string[] {
  const reasons: string[] = [];
  for (const step of steps) {
    if (step.status === 'blocked' && step.reason) {
      reasons.push(step.reason);
    }
  }
  if (startBlockReason && !reasons.includes(startBlockReason)) {
    reasons.push(startBlockReason);
  }
  return reasons;
}

function pickNextAction(steps: CircleSetupStep[]): string | null {
  const priority: SetupStepStatus[] = [
    'action_required',
    'blocked',
    'waiting',
  ];
  for (const status of priority) {
    const step = steps.find((s) => s.status === status);
    if (step?.nextAction) {
      return step.nextAction;
    }
  }
  return null;
}

/** Ordered participating hands for payout display (turnOrder first, then missing). */
export function orderedParticipatingHands(input: {
  members: StartCircleMemberLike[];
  turnOrder?: string[] | null;
}): Array<StartCircleMemberLike & { position: number; inOrder: boolean }> {
  const hands = getParticipatingHands(input.members);
  const byId = new Map(hands.map((hand) => [hand.id, hand]));
  const order = Array.isArray(input.turnOrder) ? input.turnOrder : [];
  const rows: Array<StartCircleMemberLike & { position: number; inOrder: boolean }> = [];
  const seen = new Set<string>();

  order.forEach((handId, index) => {
    const hand = byId.get(handId);
    if (!hand) {
      return;
    }
    seen.add(handId);
    rows.push({ ...hand, position: index + 1, inOrder: true });
  });

  for (const hand of hands) {
    if (seen.has(hand.id)) {
      continue;
    }
    rows.push({
      ...hand,
      position: rows.length + 1,
      inOrder: false,
    });
  }

  return rows;
}

export function setupStepStatusLabel(status: SetupStepStatus): string {
  switch (status) {
    case 'complete':
      return 'Complete';
    case 'action_required':
      return 'Action required';
    case 'waiting':
      return 'Waiting on member';
    case 'blocked':
      return 'Blocked';
    default:
      return 'Unknown';
  }
}

export { memberDisplayName };
