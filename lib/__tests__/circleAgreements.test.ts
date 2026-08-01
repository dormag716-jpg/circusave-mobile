import type { AdditionalHandPreview, CircleAgreementSnapshot } from '../api';
import {
  additionalHandFinancialRows,
  canSubmitAgreementAcceptance,
  getMemberAgreementPrompt,
  memberCanOpenAgreementReview,
  memberHasAcceptedCurrentSnapshot,
  normalizeAgreementLanguage,
  orderedSnapshotHands,
  ownedAgreementHands,
  shouldRefreshStaleSnapshot,
  shouldShowMemberAgreementBanner,
  snapshotServiceFeeCents,
} from '../circleAgreements';

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

  it('shows action required when a member is missing acceptance', () => {
    const prompt = getMemberAgreementPrompt({
      circleStarted: false,
      userId: 'u1',
      isParticipatingMember: true,
      snapshot,
    });
    expect(prompt).toEqual({ kind: 'action_required' });
    expect(shouldShowMemberAgreementBanner(prompt)).toBe(true);
    expect(memberCanOpenAgreementReview(prompt)).toBe(true);
  });

  it('does not show organizer-style acceptance for non-members', () => {
    const prompt = getMemberAgreementPrompt({
      circleStarted: false,
      userId: 'outsider',
      isParticipatingMember: false,
      snapshot,
    });
    expect(prompt).toEqual({ kind: 'none' });
    expect(shouldShowMemberAgreementBanner(prompt)).toBe(false);
  });

  it('requires a snapshot before members can accept', () => {
    expect(
      getMemberAgreementPrompt({
        circleStarted: false,
        userId: 'u1',
        isParticipatingMember: true,
        snapshot: null,
      }),
    ).toEqual({ kind: 'waiting_for_snapshot' });
  });

  it('treats multi-hand ownership as accepted only for the exact current snapshot', () => {
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
    ).toEqual({ kind: 'accepted' });
    expect(
      memberHasAcceptedCurrentSnapshot(
        { ...accepted, structureCurrent: false } as CircleAgreementSnapshot,
        'u1',
      ),
    ).toBe(false);
    expect(
      getMemberAgreementPrompt({
        circleStarted: false,
        userId: 'u1',
        isParticipatingMember: true,
        snapshot: { ...accepted, structureCurrent: false } as CircleAgreementSnapshot,
      }),
    ).toEqual({ kind: 'stale_structure' });
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
