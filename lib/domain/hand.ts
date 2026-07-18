import type { CircleId, HandId, MembershipId, PayoutPositionId, RoundId } from './ids';
import type { HandClaimStatus, HandParticipationStatus, PayoutOrderStatus } from './statuses';

/** A financial participation slot owned by a membership. */
export type Hand = Readonly<{
  id: HandId;
  circleId: CircleId;
  membershipId: MembershipId;
  handNumber: number;
  participationStatus: HandParticipationStatus;
  claimStatus: HandClaimStatus;
  origin: 'initial' | 'additional';
}>;

/** Every participating hand has its own payout position. */
export type PayoutPosition = Readonly<{
  id: PayoutPositionId;
  circleId: CircleId;
  handId: HandId;
  position: number;
  roundId: RoundId | null;
}>;

export type PayoutOrder = Readonly<{
  circleId: CircleId;
  status: PayoutOrderStatus;
  positions: readonly PayoutPosition[];
}>;
