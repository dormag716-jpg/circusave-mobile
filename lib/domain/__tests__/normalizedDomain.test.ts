import type { Hand, PayoutPosition } from '../hand';
import { domainId, type CircleId, type HandId, type MembershipId, type PayoutPositionId, type UserId } from '../ids';
import type { CircleMembership } from '../membership';
import { money } from '../money';

const circleId = domainId<'CircleId'>('circle-1') as CircleId;
const userId = domainId<'UserId'>('user-1') as UserId;
const membershipId = domainId<'MembershipId'>('membership-1') as MembershipId;

function hand(id: string, handNumber: number, origin: Hand['origin']): Hand {
  return {
    id: domainId<'HandId'>(id) as HandId,
    circleId,
    membershipId,
    handNumber,
    participationStatus: 'participating',
    claimStatus: 'claimed',
    origin,
  };
}

function position(id: string, ownedHand: Hand, number: number): PayoutPosition {
  return {
    id: domainId<'PayoutPositionId'>(id) as PayoutPositionId,
    circleId,
    handId: ownedHand.id,
    position: number,
    roundId: null,
  };
}

describe('normalized domain foundation', () => {
  test('one membership owns multiple hands with separate payout positions', () => {
    const membership: CircleMembership = {
      id: membershipId,
      circleId,
      userId,
      role: 'member',
      lifecycleStatus: 'active',
      workspaceAccessStatus: 'active',
    };
    const hands = [hand('hand-1', 1, 'initial'), hand('hand-2', 2, 'additional')];
    const positions = [position('position-1', hands[0], 1), position('position-2', hands[1], 2)];

    expect(new Set(hands.map((item) => item.membershipId))).toEqual(new Set([membership.id]));
    expect(new Set(positions.map((item) => item.handId)).size).toBe(2);
    expect(hands[1].origin).toBe('additional');
  });

  test('an additional hand does not create a duplicate membership', () => {
    const memberships: CircleMembership[] = [{
      id: membershipId,
      circleId,
      userId,
      role: 'member',
      lifecycleStatus: 'active',
      workspaceAccessStatus: 'active',
    }];
    const hands = [hand('hand-1', 1, 'initial'), hand('hand-2', 2, 'additional')];

    expect(memberships).toHaveLength(1);
    expect(hands).toHaveLength(2);
    expect(hands.every((item) => item.membershipId === memberships[0].id)).toBe(true);
  });

  test('money accepts integer minor units and rejects fractional units', () => {
    expect(money(12_345)).toEqual({ amountMinor: 12_345, currency: 'USD' });
    expect(() => money(12.34)).toThrow('integer minor units');
  });
});
