export type AssistantLocaleV2 = 'en' | 'es' | 'ht';
export type AssistantViewerRoleV2 = 'organizer' | 'member';
export type AssistantAccessStatusV2 = 'active_member';

export type AssistantAccessV2 =
  | Readonly<{
      mode: 'free_introduction';
      authorizationSource: 'one_time_introduction';
      premiumEntitled: false;
      introductionStatus: 'available';
    }>
  | Readonly<{
      mode: 'premium';
      authorizationSource: 'subscription_entitlement';
      premiumEntitled: true;
      introductionStatus: 'not_applicable';
    }>;

export type AssistantCircleContextV2 = Readonly<{
  schemaVersion: 'assistant-circle-context.v2';
  generatedAt: string;
  expiresAt: string;
  locale: AssistantLocaleV2;
  assistantAccess: AssistantAccessV2;
  viewer: Readonly<{
    userId: string;
    role: AssistantViewerRoleV2;
    accessStatus: AssistantAccessStatusV2;
    handIds: readonly string[];
    primaryHandId: string | null;
    participatingHandIds: readonly string[];
  }>;
  circle: Readonly<{
    circleId: string;
    name: string;
    status: 'draft' | 'active' | 'completed' | 'paused' | 'closed';
    lifecyclePhase: 'setup' | 'active' | 'completed' | 'paused';
    isStarted: boolean;
    isCompleted: boolean;
    organizerUserId: string | null;
    organizerHandId: string | null;
    organizerParticipates: boolean;
  }>;
  structure: Readonly<{
    peopleCount: number;
    participatingHandCount: number;
    totalRounds: number;
    claimedParticipatingHandCount: number;
    unclaimedParticipatingHandCount: number;
    assignedPayoutPositionCount: number;
    missingPayoutPositionCount: number;
  }>;
  requests: Readonly<{
    pendingJoinRequestCount: number;
    pendingAdditionalHandRequestCount: number;
  }>;
  setup: Readonly<{
    structureComplete: boolean;
    canStartCircle: boolean;
    requiresReview: boolean;
    readiness: 'blocked' | 'review_required' | 'ready' | 'not_applicable';
    blockingCodes: readonly string[];
    reviewRequiredCodes: readonly string[];
    startRequestConfirmations: readonly (
      | 'confirmPayoutOrder'
      | 'confirmUnclaimedHands'
    )[];
  }>;
  currentRound: Readonly<{
    number: number;
    status:
      | 'no_active_round'
      | 'collecting'
      | 'ready_for_payout'
      | 'payout_released';
    recipientHandId: string | null;
    contributionAmountCents: number;
    totalExpectedCents: number;
    recognizedFundingCents: number;
    remainingDueCents: number;
    expectedContributionCount: number;
    submittedCount: number;
    pendingReviewCount: number;
    confirmedCount: number;
    lateCount: number;
    missedCount: number;
    payoutReleased: boolean;
  }> | null;
  viewerContributions: readonly Readonly<{
    handId: string;
    status:
      | 'due'
      | 'submitted'
      | 'confirmed'
      | 'late'
      | 'missed'
      | 'rejected'
      | 'none';
    amountOwedCents: number;
    currency: 'usd';
  }>[];
  payout: Readonly<{
    collectionReady: boolean;
    releaseEligible: boolean;
    payoutReleased: boolean;
    recipientHandId: string | null;
  }> | null;
  capacity: Readonly<{
    plan: 'free' | 'premium';
    unit: 'participating_hand';
    maxHands: number;
    usedHands: number;
    remainingHands: number;
    atCapacity: boolean;
  }>;
  restrictions: Readonly<{
    financialTruthSource: 'circusave_backend';
    mayExecuteMutations: false;
    mayUseTools: false;
    mayAccessExternalData: false;
  }>;
}>;
