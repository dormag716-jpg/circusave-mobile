import type {
  AdditionalHandPreview,
  CircleAgreementReadiness,
  CircleAgreementSnapshot,
} from '../api';
import {
  additionalHandFinancialRows,
  canEnableOrganizerStart,
  canStartFromReview,
  canSubmitAgreementAcceptance,
  getAgreementReadinessStatusKeys,
  getMemberAgreementPrompt,
  memberCanOpenAgreementReview,
  memberHasAcceptedCurrentSnapshot,
  normalizeAgreementLanguage,
  orderedSnapshotHands,
  ownedAgreementHands,
  reviewHandRows,
  shouldRefreshStaleSnapshot,
  shouldShowMemberAgreementBanner,
  snapshotExpectedPotCents,
  snapshotServiceFeeCents,
  startConfirmationFlags,
  startReviewErrorCode,
  structuralBlockerCopyKey,
} from '../circles/circleAgreements';

function readinessFixture(
  overrides: Partial<CircleAgreementReadiness> = {},
): CircleAgreementReadiness {
  return {
    circleId: 'c1',
    snapshotId: 's1',
    snapshotHash: 'a'.repeat(64),
    readyToStart: false,
    blockers: [
      'payout_order_confirmation_missing',
    ],
    agreementBlockers: [],
    confirmationRequirements: ['payout_order_confirmation_missing'],
    missingMemberAcceptances: [],
    snapshotPresent: true,
    snapshotCurrent: true,
    memberAcceptancesComplete: true,
    organizerAgreementComplete: true,
    agreementsComplete: true,
    requiresOrganizerStartConfirmation: true,
    requiresUnclaimedHandConfirmation: false,
    canOpenStartFlow: true,
    ...overrides,
  };
}

const snapshot = {
  structureCurrent: true,
  payoutOrder: ['h1', 'h3', 'h2'],
  fees: { serviceFeeCents: 0 },
  alreadyAccepted: {
    circleParticipationAgreement: false,
    finalCircleSnapshot: false,
    organizerAgreement: false,
  },
  hands: [
    { handId: 'h2', handNumber: 2, userId: 'u1', payoutPosition: 3, expectedPayoutDate: '2026-09-15' },
    { handId: 'h1', handNumber: 1, userId: 'u1', payoutPosition: 1, expectedPayoutDate: '2026-09-01' },
    { handId: 'h3', handNumber: 1, userId: 'u2', payoutPosition: 2, expectedPayoutDate: '2026-09-08' },
  ],
} as CircleAgreementSnapshot;

describe('circle agreement presentation', () => {
  it('renders every owned hand in hand-number order', () => {
    expect(ownedAgreementHands(snapshot, 'u1')).toEqual([
      expect.objectContaining({ handId: 'h1', handNumber: 1, payoutPosition: 1 }),
      expect.objectContaining({ handId: 'h2', handNumber: 2, payoutPosition: 3 }),
    ]);
  });

  it('lists final payout order for all hands', () => {
    expect(orderedSnapshotHands(snapshot).map((hand) => hand.handId)).toEqual([
      'h1',
      'h3',
      'h2',
    ]);
  });

  it('keeps acceptance disabled until affirmative confirmation', () => {
    expect(canSubmitAgreementAcceptance({ checked: false, submitting: false, structureCurrent: true, alreadyAccepted: false })).toBe(false);
    expect(canSubmitAgreementAcceptance({ checked: true, submitting: false, structureCurrent: true, alreadyAccepted: false })).toBe(true);
    expect(canSubmitAgreementAcceptance({ checked: true, submitting: true, structureCurrent: true, alreadyAccepted: false })).toBe(false);
  });

  it('forces a refresh for stale snapshot API failures', () => {
    expect(shouldRefreshStaleSnapshot({ status: 409 })).toBe(true);
    expect(shouldRefreshStaleSnapshot({ status: 400 })).toBe(false);
  });

  it('normalizes displayed language to persisted backend values', () => {
    expect(normalizeAgreementLanguage('es-MX')).toBe('es');
    expect(normalizeAgreementLanguage('ht-HT')).toBe('ht');
    expect(normalizeAgreementLanguage('fr')).toBe('en');
  });

  it('presents exact before and after additional-hand values', () => {
    const preview = {
      currentRecurringObligationCents: 100000,
      additionalRecurringObligationCents: 100000,
      newRecurringObligationCents: 200000,
      remainingRounds: 8,
      additionalRemainingObligationCents: 800000,
      newTotalRemainingObligationCents: 1600000,
    } as AdditionalHandPreview;
    expect(additionalHandFinancialRows(preview)).toEqual([
      ['currentRecurringObligation', 100000],
      ['additionalRecurringObligation', 100000],
      ['newRecurringObligation', 200000],
      ['remainingRounds', 8],
      ['additionalRemainingObligation', 800000],
      ['newTotalRemainingObligation', 1600000],
    ]);
  });

  it('never requires member acceptance prompts', () => {
    const prompt = getMemberAgreementPrompt({
      circleStarted: false,
      userId: 'u1',
      isParticipatingMember: true,
      snapshot,
    });
    expect(prompt).toEqual({ kind: 'none' });
    expect(shouldShowMemberAgreementBanner(prompt)).toBe(false);
  });

  it('does not show acceptance banners for non-members', () => {
    const prompt = getMemberAgreementPrompt({
      circleStarted: false,
      userId: 'outsider',
      isParticipatingMember: false,
      snapshot,
    });
    expect(prompt).toEqual({ kind: 'none' });
    expect(shouldShowMemberAgreementBanner(prompt)).toBe(false);
  });

  it('still derives multi-hand ownership from snapshot data', () => {
    const accepted = {
      ...snapshot,
      alreadyAccepted: {
        circleParticipationAgreement: true,
        finalCircleSnapshot: true,
        organizerAgreement: false,
      },
    } as CircleAgreementSnapshot;
    expect(ownedAgreementHands(accepted, 'u1')).toHaveLength(2);
    expect(memberHasAcceptedCurrentSnapshot(accepted, 'u1')).toBe(true);
    expect(
      getMemberAgreementPrompt({
        circleStarted: false,
        userId: 'u1',
        isParticipatingMember: true,
        snapshot: accepted,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('reads service fees from the server snapshot', () => {
    expect(snapshotServiceFeeCents(snapshot)).toBe(0);
    expect(
      snapshotServiceFeeCents({
        ...snapshot,
        fees: { serviceFeeCents: 250 },
      } as CircleAgreementSnapshot),
    ).toBe(250);
  });
});

describe('agreement readiness semantics (CS-005)', () => {
  it('disables Start when structure is incomplete', () => {
    const readiness = readinessFixture({
      agreementsComplete: false,
      canOpenStartFlow: false,
      canStartCircle: false,
      structureComplete: false,
      memberAcceptancesComplete: true,
      agreementBlockers: [],
      blockers: ['PAYOUT_ORDER_INCOMPLETE', 'payout_order_confirmation_missing'],
    });
    expect(
      canEnableOrganizerStart({
        readiness,
        startPayoutChecked: true,
        startUnclaimedChecked: true,
        busy: false,
      }),
    ).toBe(false);
    // readyToStart must not drive button eligibility.
    expect(readiness.readyToStart).toBe(false);
  });

  it('shows final confirmation state when agreements are complete', () => {
    const readiness = readinessFixture();
    const keys = getAgreementReadinessStatusKeys({ readiness, isOrganizer: true });
    expect(keys).toContain('statusAgreementsComplete');
    expect(keys).toContain('blockerPayoutOrderConfirmation');
    expect(keys).not.toContain('blockerMemberAcceptances');
  });

  it('enables Start only after required local checkboxes', () => {
    const readiness = readinessFixture();
    expect(
      canEnableOrganizerStart({
        readiness,
        startPayoutChecked: false,
        startUnclaimedChecked: false,
        busy: false,
      }),
    ).toBe(false);
    expect(
      canEnableOrganizerStart({
        readiness,
        startPayoutChecked: true,
        startUnclaimedChecked: false,
        busy: false,
      }),
    ).toBe(true);
  });

  it('requires unclaimed checkbox only when backend requires it', () => {
    const readiness = readinessFixture({
      requiresUnclaimedHandConfirmation: true,
      confirmationRequirements: [
        'payout_order_confirmation_missing',
        'unclaimed_hand_confirmation_missing',
      ],
      blockers: [
        'payout_order_confirmation_missing',
        'unclaimed_hand_confirmation_missing',
      ],
    });
    expect(
      canEnableOrganizerStart({
        readiness,
        startPayoutChecked: true,
        startUnclaimedChecked: false,
        busy: false,
      }),
    ).toBe(false);
    expect(
      canEnableOrganizerStart({
        readiness,
        startPayoutChecked: true,
        startUnclaimedChecked: true,
        busy: false,
      }),
    ).toBe(true);
    const keys = getAgreementReadinessStatusKeys({ readiness, isOrganizer: true });
    expect(keys).toContain('blockerUnclaimedHandConfirmation');
  });

  it('keeps stale snapshot blocking', () => {
    const readiness = readinessFixture({
      snapshotCurrent: false,
      agreementsComplete: false,
      canOpenStartFlow: false,
      agreementBlockers: ['structure_changed_after_acceptance'],
      blockers: [
        'structure_changed_after_acceptance',
        'payout_order_confirmation_missing',
      ],
    });
    expect(
      canEnableOrganizerStart({
        readiness,
        startPayoutChecked: true,
        startUnclaimedChecked: true,
        busy: false,
      }),
    ).toBe(false);
    const keys = getAgreementReadinessStatusKeys({ readiness, isOrganizer: true });
    expect(keys).toContain('blockerStructureChanged');
    expect(keys).not.toContain('statusAgreementsComplete');
  });

  it('hides organizer confirmation section copy from members', () => {
    const readiness = readinessFixture({
      requiresUnclaimedHandConfirmation: true,
    });
    const keys = getAgreementReadinessStatusKeys({ readiness, isOrganizer: false });
    expect(keys).toContain('statusAgreementsComplete');
    expect(keys).not.toContain('blockerPayoutOrderConfirmation');
    expect(keys).not.toContain('blockerUnclaimedHandConfirmation');
  });

  it('does not surface raw confirmation blocker codes as status keys', () => {
    const readiness = readinessFixture({
      requiresUnclaimedHandConfirmation: true,
      blockers: [
        'payout_order_confirmation_missing',
        'unclaimed_hand_confirmation_missing',
      ],
    });
    const keys = getAgreementReadinessStatusKeys({ readiness, isOrganizer: true });
    expect(keys).not.toContain('payout_order_confirmation_missing');
    expect(keys).not.toContain('unclaimed_hand_confirmation_missing');
    expect(keys).toContain('blockerPayoutOrderConfirmation');
    expect(keys).toContain('blockerUnclaimedHandConfirmation');
  });

  it('never uses readyToStart for button eligibility even if true', () => {
    // Hypothetical misconfigured payload: readyToStart true while canOpenStartFlow false.
    const readiness = readinessFixture({
      readyToStart: true,
      canOpenStartFlow: false,
      agreementsComplete: false,
      agreementBlockers: ['member_acceptances_missing'],
    });
    expect(
      canEnableOrganizerStart({
        readiness,
        startPayoutChecked: true,
        startUnclaimedChecked: true,
        busy: false,
      }),
    ).toBe(false);
  });
});

describe('final review before Start', () => {
  const reviewed = {
    ...snapshot,
    id: 's1',
    snapshotHash: 'a'.repeat(64),
    contributionAmountCents: 5000,
    memberReview: { contributionPerHandCents: 5000 },
  } as unknown as CircleAgreementSnapshot;
  const ready = readinessFixture({ canStartCircle: true, structureComplete: true });
  const base = {
    readiness: ready,
    snapshot: reviewed,
    reviewedHash: reviewed.snapshotHash,
    payoutChecked: true,
    unclaimedChecked: true,
    needsUnclaimedConfirmation: true,
    busy: false,
  };

  it('starts only when this snapshot was reviewed and every confirmation is checked', () => {
    expect(canStartFromReview(base)).toBe(true);
    expect(canStartFromReview({ ...base, payoutChecked: false })).toBe(false);
    expect(canStartFromReview({ ...base, unclaimedChecked: false })).toBe(false);
    expect(
      canStartFromReview({
        ...base,
        unclaimedChecked: false,
        needsUnclaimedConfirmation: false,
      }),
    ).toBe(true);
  });

  it('does not carry ticks over to a different snapshot', () => {
    expect(canStartFromReview({ ...base, reviewedHash: 'b'.repeat(64) })).toBe(false);
    expect(canStartFromReview({ ...base, reviewedHash: null })).toBe(false);
  });

  it('stays disabled without a snapshot, readiness, structure, or while busy', () => {
    expect(canStartFromReview({ ...base, snapshot: null })).toBe(false);
    expect(canStartFromReview({ ...base, readiness: null })).toBe(false);
    expect(
      canStartFromReview({
        ...base,
        readiness: readinessFixture({
          canStartCircle: false,
          structureComplete: false,
          canOpenStartFlow: false,
        }),
      }),
    ).toBe(false);
    expect(
      canStartFromReview({
        ...base,
        readiness: readinessFixture({ canStartCircle: true, snapshotCurrent: false }),
      }),
    ).toBe(false);
    expect(canStartFromReview({ ...base, busy: true })).toBe(false);
  });

  it('sends only the confirmations the organizer checked', () => {
    expect(
      startConfirmationFlags({
        payoutChecked: true,
        unclaimedChecked: true,
        needsUnclaimedConfirmation: true,
      }),
    ).toEqual({ confirmPayoutOrder: true, confirmUnclaimedHands: true });
    expect(
      startConfirmationFlags({
        payoutChecked: true,
        unclaimedChecked: true,
        needsUnclaimedConfirmation: false,
      }),
    ).toEqual({ confirmPayoutOrder: true, confirmUnclaimedHands: false });
    expect(
      startConfirmationFlags({
        payoutChecked: false,
        unclaimedChecked: false,
        needsUnclaimedConfirmation: true,
      }),
    ).toEqual({ confirmPayoutOrder: false, confirmUnclaimedHands: false });
  });

  it('lists payout order with roster names and claim status', () => {
    const rows = reviewHandRows(reviewed, [
      { id: 'h1', full_name: 'Org One' },
      { id: 'h3', name: 'Planned Two' },
    ]);
    expect(rows.map((row) => row.handId)).toEqual(['h1', 'h3', 'h2']);
    expect(rows[1]).toMatchObject({ name: 'Planned Two', claimed: true });
    expect(rows[2].name).toBe('');
    const unclaimed = reviewHandRows(
      {
        ...reviewed,
        hands: reviewed.hands.map((hand) =>
          hand.handId === 'h3' ? { ...hand, userId: null } : hand,
        ),
      },
      [],
    );
    expect(unclaimed.find((row) => row.handId === 'h3')?.claimed).toBe(false);
  });

  it('computes the expected pot from the reviewed per-hand amount and all hands', () => {
    expect(snapshotExpectedPotCents(reviewed)).toBe(15000);
  });

  it('recognises the backend stale-review and review-required codes', () => {
    expect(startReviewErrorCode({ payload: { code: 'start_review_stale' } })).toBe(
      'start_review_stale',
    );
    expect(startReviewErrorCode({ payload: { code: 'start_review_required' } })).toBe(
      'start_review_required',
    );
    expect(startReviewErrorCode({ payload: { code: 'other' } })).toBeNull();
    expect(startReviewErrorCode(new Error('x'))).toBeNull();
    expect(startReviewErrorCode(null)).toBeNull();
  });

  it('maps known structural blockers to copy and ignores unknown ones', () => {
    expect(structuralBlockerCopyKey('PENDING_JOIN_REQUESTS')).toBe(
      'structural.PENDING_JOIN_REQUESTS',
    );
    expect(structuralBlockerCopyKey('SOMETHING_NEW')).toBeNull();
  });
});
