import type { AdditionalHandPreview, CircleAgreementSnapshot } from '../api';
import {
  additionalHandFinancialRows,
  canSubmitAgreementAcceptance,
  normalizeAgreementLanguage,
  ownedAgreementHands,
  shouldRefreshStaleSnapshot,
} from '../circleAgreements';

const snapshot = {
  structureCurrent: true,
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
});
