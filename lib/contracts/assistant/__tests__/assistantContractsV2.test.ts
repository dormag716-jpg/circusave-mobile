import type { AssistantCircleContextV2 } from '../contextV2';
import type { AssistantResponseV2 } from '../responseV2';

function contextV2(): AssistantCircleContextV2 {
  return {
    schemaVersion: 'assistant-circle-context.v2',
    generatedAt: '2026-08-02T12:00:00Z',
    expiresAt: '2026-08-02T12:05:00Z',
    locale: 'en',
    assistantAccess: {
      mode: 'free_introduction',
      authorizationSource: 'one_time_introduction',
      premiumEntitled: false,
      introductionStatus: 'available',
    },
    viewer: {
      userId: 'user-1',
      role: 'organizer',
      accessStatus: 'active_member',
      handIds: ['hand-1'],
      primaryHandId: 'hand-1',
      participatingHandIds: ['hand-1'],
    },
    circle: {
      circleId: 'circle-1',
      name: 'Family Circle',
      status: 'active',
      lifecyclePhase: 'active',
      isStarted: true,
      isCompleted: false,
      organizerUserId: 'user-1',
      organizerHandId: 'hand-1',
      organizerParticipates: true,
    },
    structure: {
      peopleCount: 2,
      participatingHandCount: 2,
      totalRounds: 2,
      claimedParticipatingHandCount: 2,
      unclaimedParticipatingHandCount: 0,
      assignedPayoutPositionCount: 2,
      missingPayoutPositionCount: 0,
    },
    requests: {
      pendingJoinRequestCount: 0,
      pendingAdditionalHandRequestCount: 0,
    },
    setup: {
      structureComplete: false,
      canStartCircle: false,
      requiresReview: false,
      readiness: 'not_applicable',
      blockingCodes: [],
      reviewRequiredCodes: [],
      startRequestConfirmations: [],
    },
    currentRound: {
      number: 1,
      status: 'collecting',
      recipientHandId: 'hand-1',
      contributionAmountCents: 5000,
      totalExpectedCents: 10000,
      recognizedFundingCents: 5000,
      remainingDueCents: 5000,
      expectedContributionCount: 2,
      submittedCount: 0,
      pendingReviewCount: 0,
      confirmedCount: 1,
      lateCount: 0,
      missedCount: 0,
      payoutReleased: false,
    },
    viewerContributions: [{
      handId: 'hand-1',
      status: 'confirmed',
      amountOwedCents: 5000,
      currency: 'usd',
    }],
    payout: {
      collectionReady: false,
      releaseEligible: false,
      payoutReleased: false,
      recipientHandId: 'hand-1',
    },
    capacity: {
      plan: 'free',
      unit: 'participating_hand',
      maxHands: 20,
      usedHands: 2,
      remainingHands: 18,
      atCapacity: false,
    },
    restrictions: {
      financialTruthSource: 'circusave_backend',
      mayExecuteMutations: false,
      mayUseTools: false,
      mayAccessExternalData: false,
    },
  };
}

function responseV2(): AssistantResponseV2 {
  return {
    schemaVersion: 'assistant-response.v2',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    status: 'completed',
    locale: 'en',
    responseType: 'answer',
    message: 'One of two contributions is confirmed.',
    explanationCodes: ['ROUND_COLLECTION_IN_PROGRESS'],
    factRefs: ['currentRound.confirmedCount'],
    navigationSuggestions: [{
      actionId: 'view_round_status',
      reason: 'Review the current round.',
      assistantExecutable: false,
    }],
    generatedFromContextAt: '2026-08-02T12:00:00Z',
    actionsExecutable: false,
  };
}

describe('assistant v2 contracts', () => {
  test('freezes matching context and response schema versions', () => {
    expect(contextV2().schemaVersion).toBe('assistant-circle-context.v2');
    expect(responseV2().schemaVersion).toBe('assistant-response.v2');
  });

  test('keeps every execution surface disabled', () => {
    const context = contextV2();
    const response = responseV2();
    expect(context.restrictions.mayExecuteMutations).toBe(false);
    expect(context.restrictions.mayUseTools).toBe(false);
    expect(context.restrictions.mayAccessExternalData).toBe(false);
    expect(response.actionsExecutable).toBe(false);
    expect(
      response.navigationSuggestions.every(
        (suggestion) => suggestion.assistantExecutable === false,
      ),
    ).toBe(true);
  });

  test('uses integer cents for model-visible contribution amounts', () => {
    expect(contextV2().viewerContributions[0].amountOwedCents).toBe(5000);
  });

  test('does not derive Premium access from the viewer role', () => {
    const context = contextV2();
    expect(context.viewer.role).toBe('organizer');
    expect(context.assistantAccess.premiumEntitled).toBe(false);
  });
});
