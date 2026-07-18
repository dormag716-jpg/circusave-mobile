import type { Hand, PayoutPosition } from '../../domain/hand';
import { domainId, type CircleId, type HandId, type MembershipId, type PayoutPositionId, type UserId } from '../../domain/ids';
import type { CircleMembership } from '../../domain/membership';
import { selectCircleStructure } from '../circleStructure';

const circleA = domainId<'CircleId'>('circle-a') as CircleId;
const circleB = domainId<'CircleId'>('circle-b') as CircleId;

function membership(id: string, role: CircleMembership['role']): CircleMembership {
  return {
    id: domainId<'MembershipId'>(id) as MembershipId,
    circleId: circleA,
    userId: domainId<'UserId'>(`user-${id}`) as UserId,
    role,
    lifecycleStatus: 'active',
    workspaceAccessStatus: 'active',
  };
}

function hand(id: string, owner: CircleMembership, handNumber: number): Hand {
  return {
    id: domainId<'HandId'>(id) as HandId,
    circleId: owner.circleId,
    membershipId: owner.id,
    handNumber,
    participationStatus: 'participating',
    claimStatus: 'claimed',
    origin: handNumber === 1 ? 'initial' : 'additional',
  };
}

function payout(id: string, ownedHand: Hand, position: number): PayoutPosition {
  return {
    id: domainId<'PayoutPositionId'>(id) as PayoutPositionId,
    circleId: ownedHand.circleId,
    handId: ownedHand.id,
    position,
    roundId: null,
  };
}

describe('selectCircleStructure', () => {
  test('organizer may manage without a participating hand', () => {
    const organizer = membership('organizer', 'organizer');
    const member = membership('member', 'member');
    const memberHand = hand('member-hand', member, 1);
    const result = selectCircleStructure({
      circleId: circleA,
      memberships: [organizer, member],
      hands: [memberHand],
      payoutPositions: [payout('position-1', memberHand, 1)],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.structure.organizerParticipates).toBe(false);
  });

  test('organizer may participate with one or more hands', () => {
    const organizer = membership('organizer', 'organizer');
    const hands = [hand('organizer-hand-1', organizer, 1), hand('organizer-hand-2', organizer, 2)];
    const result = selectCircleStructure({
      circleId: circleA,
      memberships: [organizer],
      hands,
      payoutPositions: [payout('position-1', hands[0], 1), payout('position-2', hands[1], 2)],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.structure.organizerParticipates).toBe(true);
      expect(result.structure.membershipCount).toBe(1);
      expect(result.structure.participatingHandCount).toBe(2);
      expect(result.structure.payoutPositionCount).toBe(2);
    }
  });

  test('rejects cross-circle records instead of silently adapting them', () => {
    const organizer = membership('organizer', 'organizer');
    const foreignHand: Hand = {
      ...hand('foreign-hand', organizer, 1),
      circleId: circleB,
    };
    const result = selectCircleStructure({
      circleId: circleA,
      memberships: [organizer],
      hands: [foreignHand],
      payoutPositions: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('cross_circle_hand');
      expect(result.issues.map((issue) => issue.code)).toContain('unknown_hand_membership');
    }
  });

  test('requires one separate payout position per participating hand', () => {
    const owner = membership('member', 'member');
    const hands = [hand('hand-1', owner, 1), hand('hand-2', owner, 2)];
    const result = selectCircleStructure({
      circleId: circleA,
      memberships: [owner],
      hands,
      payoutPositions: [payout('position-1', hands[0], 1)],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual({ code: 'missing_payout_position', recordId: hands[1].id });
    }
  });
});
