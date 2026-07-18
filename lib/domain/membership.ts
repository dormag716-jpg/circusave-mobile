import type { CircleId, MembershipId, UserId } from './ids';
import type { MembershipLifecycleStatus, WorkspaceAccessStatus } from './statuses';

export type CircleMembershipRole = 'organizer' | 'member';

/**
 * Intended normalized model: one user-to-circle relationship which may own many hands.
 * This is not an assertion about the current BackendCircleMember representation.
 */
export type CircleMembership = Readonly<{
  id: MembershipId;
  circleId: CircleId;
  userId: UserId | null;
  role: CircleMembershipRole;
  lifecycleStatus: MembershipLifecycleStatus;
  workspaceAccessStatus: WorkspaceAccessStatus;
}>;
