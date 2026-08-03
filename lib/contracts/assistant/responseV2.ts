import type { AssistantActionSuggestionV2 } from './actionsV2';
import type { AssistantLocaleV2 } from './contextV2';

export type AssistantResponseTypeV2 = 'answer' | 'refusal' | 'clarification';

export type AssistantFactRefV2 =
  | 'circle.status'
  | 'circle.lifecyclePhase'
  | 'assistantAccess.mode'
  | 'assistantAccess.premiumEntitled'
  | 'assistantAccess.introductionStatus'
  | 'structure.peopleCount'
  | 'structure.participatingHandCount'
  | 'structure.totalRounds'
  | 'requests.pendingJoinRequestCount'
  | 'requests.pendingAdditionalHandRequestCount'
  | 'setup.structureComplete'
  | 'setup.canStartCircle'
  | 'setup.requiresReview'
  | 'setup.readiness'
  | 'setup.blockingCodes'
  | 'setup.reviewRequiredCodes'
  | 'setup.startRequestConfirmations'
  | 'currentRound.number'
  | 'currentRound.status'
  | 'currentRound.recipientHandId'
  | 'currentRound.contributionAmountCents'
  | 'currentRound.totalExpectedCents'
  | 'currentRound.recognizedFundingCents'
  | 'currentRound.remainingDueCents'
  | 'currentRound.expectedContributionCount'
  | 'currentRound.submittedCount'
  | 'currentRound.pendingReviewCount'
  | 'currentRound.confirmedCount'
  | 'currentRound.lateCount'
  | 'currentRound.missedCount'
  | 'currentRound.payoutReleased'
  | 'viewerContributions'
  | 'payout.collectionReady'
  | 'payout.releaseEligible'
  | 'payout.payoutReleased'
  | 'payout.recipientHandId'
  | 'capacity.plan'
  | 'capacity.maxHands'
  | 'capacity.usedHands'
  | 'capacity.remainingHands'
  | 'capacity.atCapacity';

type AssistantResponseBaseV2 = Readonly<{
  schemaVersion: 'assistant-response.v2';
  conversationId: string;
  messageId: string;
  locale: AssistantLocaleV2;
  message: string;
  explanationCodes: readonly string[];
  factRefs: readonly AssistantFactRefV2[];
  navigationSuggestions: readonly AssistantActionSuggestionV2[];
  generatedFromContextAt: string;
  actionsExecutable: false;
}>;

export type AssistantResponseV2 =
  | (AssistantResponseBaseV2 & Readonly<{
      status: 'completed';
      responseType: 'answer' | 'clarification';
    }>)
  | (AssistantResponseBaseV2 & Readonly<{
      status: 'refused';
      responseType: 'refusal';
    }>);
