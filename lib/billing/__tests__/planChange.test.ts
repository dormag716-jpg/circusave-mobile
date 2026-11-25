import { planChangeRequest } from '../planChange';

describe('planChangeRequest', () => {
  it('buys new when there is no current plan', () => {
    expect(planChangeRequest(null, { tier: 'member_pro', interval: 'monthly' })).toEqual({
      kind: 'new_purchase',
    });
  });

  it('upgrades Member Pro to Organizer Pro now, prorated', () => {
    expect(
      planChangeRequest(
        { tier: 'member_pro', interval: 'monthly' },
        { tier: 'organizer_pro', interval: 'monthly' },
      ),
    ).toEqual({ kind: 'replace', replacementMode: 'charge-prorated-price' });
  });

  it('downgrades Organizer Pro to Member Pro at the next renewal', () => {
    expect(
      planChangeRequest(
        { tier: 'organizer_pro', interval: 'annual' },
        { tier: 'member_pro', interval: 'annual' },
      ),
    ).toEqual({ kind: 'replace', replacementMode: 'deferred' });
  });

  it('does not start monthly/annual switches (undecided)', () => {
    expect(
      planChangeRequest(
        { tier: 'member_pro', interval: 'monthly' },
        { tier: 'member_pro', interval: 'annual' },
      ),
    ).toEqual({ kind: 'not_supported_yet', reason: 'billing_period_change' });
    expect(
      planChangeRequest(
        { tier: 'organizer_pro', interval: 'annual' },
        { tier: 'member_pro', interval: 'monthly' },
      ),
    ).toEqual({ kind: 'not_supported_yet', reason: 'billing_period_change' });
  });

  it('reports choosing the same plan', () => {
    expect(
      planChangeRequest(
        { tier: 'member_pro', interval: 'monthly' },
        { tier: 'member_pro', interval: 'monthly' },
      ),
    ).toEqual({ kind: 'not_supported_yet', reason: 'same_plan' });
  });
});
