import type { CircleId, HandId, MembershipId, RequestId, UserId } from './ids';
import type { RequestStatus } from './statuses';

export type JoinRequest = Readonly<{
  id: RequestId;
  circleId: CircleId;
  kind: 'unmatched_join';
  requesterUserId: UserId;
  status: RequestStatus;
  createdAt: string;
}>;

export type AdditionalHandRequest = Readonly<{
  id: RequestId;
  circleId: CircleId;
  kind: 'additional_hand';
  membershipId: MembershipId;
  requestedAfterHandId?: HandId;
  status: RequestStatus;
  createdAt: string;
}>;

export type CircleRequest = JoinRequest | AdditionalHandRequest;
