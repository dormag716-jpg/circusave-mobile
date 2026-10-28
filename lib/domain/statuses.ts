/** Intended normalized statuses. Current API string values still require verification. */
export type CircleLifecycleStatus = 'setup' | 'active' | 'paused' | 'completed' | 'closed';
export type MembershipLifecycleStatus = 'planned' | 'active' | 'removed';
export type WorkspaceAccessStatus = 'none' | 'invited' | 'active' | 'suspended' | 'revoked';
export type HandParticipationStatus = 'planned' | 'participating' | 'withdrawn';
export type HandClaimStatus = 'unclaimed' | 'claim_pending' | 'claimed' | 'revoked' | 'expired';
export type RequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled' | 'expired';
export type ContributionStatus = 'due' | 'submitted' | 'confirmed' | 'late' | 'missed' | 'rejected' | 'waived';
export type PayoutOrderStatus = 'draft' | 'complete' | 'finalized' | 'locked';
export type PayoutReleaseStatus = 'not_ready' | 'ready' | 'release_pending' | 'released' | 'failed';
