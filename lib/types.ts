export type UserIdentity = {
  id: string;
  displayName: string;
  email: string;
};

export type MembershipStatus = 'invited' | 'waitlist' | 'active' | 'removed';

export type MembershipRole = 'organizer' | 'participant';
export type CircleRole = MembershipRole | 'admin';

export type CirclePermissions = {
  canViewCircle: boolean;
  canViewRound: boolean;
  canViewMembers: boolean;
  canViewSchedule: boolean;
  canViewLedger: boolean;
  canPayContribution: boolean;
  canInviteMembers: boolean;
  canManageMembers: boolean;
  canConfirmContributions: boolean;
  canManageSchedule: boolean;
  canReorderPayout: boolean;
  canEndRound: boolean;
  // Compatibility keys used by existing routes and backend contracts.
  canConfirmContribution: boolean;
  canReleasePayout: boolean;
  canEditPayoutOrder: boolean;
  canEditCircleSettings: boolean;
  canAcceptInvite: boolean;
  canDeclineInvite: boolean;
};

export type CirclePermissionKey = keyof CirclePermissions;

export type CircleMembershipContext = {
  membershipId: string;
  circleId: string;
  circleName: string;
  user: UserIdentity;
  role: MembershipRole | null;
  status: MembershipStatus;
  permissions: CirclePermissions;
};

// Compatibility aliases for the first API prototype.
export type UserRole = MembershipRole;
export type CircleMembershipStatus = MembershipStatus;
export type CirclePermission = CirclePermissionKey;
export type CircleExperience = MembershipRole | 'invited' | 'waitlist';

export type CircleMembership = {
  id: string;
  circleId: string;
  userId: string;
  role: MembershipRole | null;
  status: MembershipStatus;
};

export type LocalTestUser = UserIdentity;

export type CircleStatus = 'forming' | 'active' | 'completed' | 'paused';

export type ContributionStatus = 'due' | 'pending' | 'confirmed' | 'missed';

export type PayoutStatus = 'scheduled' | 'processing' | 'paid';

export type MobileSession = {
  userId: string;
  displayName: string;
  role: UserRole;
  token: string;
};

export type CircleSummary = {
  id: string;
  name: string;
  role: CircleRole;
  status: CircleStatus;
  memberCount: number;
  contributionAmount: string;
  contributionCadence: string;
  nextContributionDueAt: string | null;
};

export type DashboardSummary = {
  activeSaved?: number;
  lifetimeSaved?: number;
  totalSaved: number;
  activeCircles: number;
  completedCircles?: number;
  personalFinancials: {
    myContributions: number;
    myPayoutsReceived: number;
  };
  upcomingPayout: {
    circleId: string;
    circleName: string;
    round: number;
    payoutDate: string;
    recipientMemberId: string | null;
    recipientName: string | null;
    amount: number;
  } | null;
  pendingContributions: number;
  recentActivity: BackendActivity[];
};

export type BackendActivity = {
  id: string;
  circleId: string;
  circleName: string;
  type: string;
  title: string;
  message: string;
  amount: number | null;
  createdAt: string;
  round: number | null;
  memberId: string | null;
  metadata: Record<string, unknown>;
};

export type ActivityResponse = {
  items: BackendActivity[];
  limit: number;
};

export type BackendCircleSummary = {
  id: string;
  name: string;
  status: string;
  pot_status: string;
  contributionAmount: number;
  frequency: string;
  startDate: string;
  currentRound: number;
  memberCount: number;
  waitlistCount: number;
  organizerId: string;
  userRole: MembershipRole | null;
  nextPayout: {
    round: number;
    memberId: string;
    payoutDate: string;
    status: string;
  } | null;
  currentRoundProgress: {
    roundNumber: number;
    submittedCount: number;
    confirmedCount: number;
    expectedContributionCount: number;
    percentConfirmed: number;
  };
};

export type LedgerActivity = BackendActivity;

export type ApiState<T> =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };
