import type { Hand, PayoutPosition } from '../domain/hand';
import type { CircleId, MembershipId } from '../domain/ids';
import type { CircleMembership } from '../domain/membership';

export type CircleStructureIssueCode =
  | 'cross_circle_membership'
  | 'cross_circle_hand'
  | 'cross_circle_payout_position'
  | 'unknown_hand_membership'
  | 'unknown_payout_hand'
  | 'duplicate_hand_number'
  | 'missing_payout_position'
  | 'duplicate_payout_position';

export type CircleStructureIssue = Readonly<{
  code: CircleStructureIssueCode;
  recordId: string;
}>;

export type CircleStructure = Readonly<{
  circleId: CircleId;
  membershipCount: number;
  participatingMembershipCount: number;
  participatingHandCount: number;
  payoutPositionCount: number;
  organizerMembershipId: MembershipId | null;
  organizerParticipates: boolean;
  handsByMembership: ReadonlyMap<MembershipId, readonly Hand[]>;
}>;

export type CircleStructureResult =
  | Readonly<{ ok: true; structure: CircleStructure }>
  | Readonly<{ ok: false; issues: readonly CircleStructureIssue[] }>;

/**
 * Validates already-normalized facts. It intentionally does not adapt or guess
 * relationships from the current mobile API compatibility model.
 */
export function selectCircleStructure(input: {
  circleId: CircleId;
  memberships: readonly CircleMembership[];
  hands: readonly Hand[];
  payoutPositions: readonly PayoutPosition[];
}): CircleStructureResult {
  const issues: CircleStructureIssue[] = [];
  const memberships = new Map(input.memberships.map((membership) => [membership.id, membership]));
  const hands = new Map(input.hands.map((hand) => [hand.id, hand]));

  for (const membership of input.memberships) {
    if (membership.circleId !== input.circleId) {
      issues.push({ code: 'cross_circle_membership', recordId: membership.id });
    }
  }

  const handNumbers = new Set<string>();
  for (const hand of input.hands) {
    if (hand.circleId !== input.circleId) {
      issues.push({ code: 'cross_circle_hand', recordId: hand.id });
    }
    const membership = memberships.get(hand.membershipId);
    if (!membership || membership.circleId !== hand.circleId) {
      issues.push({ code: 'unknown_hand_membership', recordId: hand.id });
    }
    const numberKey = `${hand.membershipId}:${hand.handNumber}`;
    if (handNumbers.has(numberKey)) {
      issues.push({ code: 'duplicate_hand_number', recordId: hand.id });
    }
    handNumbers.add(numberKey);
  }

  const positionsByHand = new Map<string, number>();
  for (const position of input.payoutPositions) {
    if (position.circleId !== input.circleId) {
      issues.push({ code: 'cross_circle_payout_position', recordId: position.id });
    }
    const hand = hands.get(position.handId);
    if (!hand || hand.circleId !== position.circleId) {
      issues.push({ code: 'unknown_payout_hand', recordId: position.id });
    }
    positionsByHand.set(position.handId, (positionsByHand.get(position.handId) ?? 0) + 1);
  }

  const participatingHands = input.hands.filter((hand) => hand.participationStatus === 'participating');
  for (const hand of participatingHands) {
    const count = positionsByHand.get(hand.id) ?? 0;
    if (count === 0) issues.push({ code: 'missing_payout_position', recordId: hand.id });
    if (count > 1) issues.push({ code: 'duplicate_payout_position', recordId: hand.id });
  }

  if (issues.length > 0) return { ok: false, issues };

  const handsByMembership = new Map<MembershipId, Hand[]>();
  for (const hand of input.hands) {
    const owned = handsByMembership.get(hand.membershipId) ?? [];
    owned.push(hand);
    handsByMembership.set(hand.membershipId, owned);
  }
  const participatingMembershipIds = new Set(participatingHands.map((hand) => hand.membershipId));
  const organizer = input.memberships.find((membership) => membership.role === 'organizer') ?? null;

  return {
    ok: true,
    structure: {
      circleId: input.circleId,
      membershipCount: input.memberships.length,
      participatingMembershipCount: participatingMembershipIds.size,
      participatingHandCount: participatingHands.length,
      payoutPositionCount: input.payoutPositions.length,
      organizerMembershipId: organizer?.id ?? null,
      organizerParticipates: organizer ? participatingMembershipIds.has(organizer.id) : false,
      handsByMembership,
    },
  };
}
