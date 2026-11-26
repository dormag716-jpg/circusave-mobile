import { readFileSync } from 'fs';
import path from 'path';

import { normalizeEntitlements } from '../entitlements';
import { currentCardPeriodView, tierCardAction } from '../tierPlanCards';

/**
 * Browsing the Annual tab must never make a monthly subscriber look annual.
 * The tab chooses which prices to browse; only the verified billing period says
 * how the person pays.
 */

describe('currentCardPeriodView: the plan the person is on', () => {
  it('monthly subscriber on the Monthly tab: shows the price and says billed monthly', () => {
    expect(currentCardPeriodView('current_paid', 'monthly', 'monthly')).toEqual({
      showPrice: true,
      line: 'billed_monthly',
    });
  });

  it('monthly subscriber on the Annual tab: no annual price, says billed monthly', () => {
    expect(currentCardPeriodView('current_paid', 'monthly', 'annual')).toEqual({
      showPrice: false,
      line: 'billed_monthly_other_tab',
    });
  });

  it('annual subscriber on the Annual tab: shows the price and says billed annually', () => {
    expect(currentCardPeriodView('current_paid', 'annual', 'annual')).toEqual({
      showPrice: true,
      line: 'billed_annual',
    });
  });

  it('annual subscriber on the Monthly tab: no monthly price, says billed annually', () => {
    expect(currentCardPeriodView('current_paid', 'annual', 'monthly')).toEqual({
      showPrice: false,
      line: 'billed_annual_other_tab',
    });
  });

  it.each(['monthly', 'annual'] as const)(
    'no verified period on the %s tab: shows no price and does not claim a period',
    (tab) => {
      for (const unknown of [undefined, null]) {
        expect(currentCardPeriodView('current_paid', unknown, tab)).toEqual({
          showPrice: false,
          line: 'billed_unknown',
        });
      }
    },
  );

  it('never shows a price tied to the tab unless the verified period matches it', () => {
    for (const verified of ['monthly', 'annual', undefined] as const) {
      for (const tab of ['monthly', 'annual'] as const) {
        const view = currentCardPeriodView('current_paid', verified, tab);
        expect(view.showPrice).toBe(verified === tab);
      }
    }
  });
});

describe('currentCardPeriodView: every other card is unchanged', () => {
  it.each(['current_free', 'choose', 'upgrade', 'switch_at_renewal', 'none'] as const)(
    '%s keeps its price and shows no billing line',
    (action) => {
      for (const verified of ['monthly', 'annual', undefined] as const) {
        for (const tab of ['monthly', 'annual'] as const) {
          expect(currentCardPeriodView(action, verified, tab)).toEqual({
            showPrice: true,
            line: null,
          });
        }
      }
    },
  );

  it('a Member Pro monthly subscriber still gets Organizer Pro as an upgrade with its price', () => {
    const action = tierCardAction('member_pro', 'organizer_pro');
    expect(action).toBe('upgrade');
    expect(currentCardPeriodView(action, 'monthly', 'annual').showPrice).toBe(true);
  });
});

describe('billingPeriod from the backend', () => {
  const paid = {
    plan: 'premium',
    tier: 'member_pro',
    source: 'apple',
    subscriptionStatus: 'active',
    currentPeriodEnd: '2026-11-27T16:11:14Z',
  };

  it('reads a verified monthly or annual period', () => {
    expect(normalizeEntitlements({ ...paid, billingPeriod: 'monthly' }).billingPeriod).toBe('monthly');
    expect(normalizeEntitlements({ ...paid, billingPeriod: 'Annual' }).billingPeriod).toBe('annual');
  });

  it('leaves it out when the backend does not say, instead of guessing', () => {
    expect('billingPeriod' in normalizeEntitlements(paid)).toBe(false);
    expect('billingPeriod' in normalizeEntitlements({ ...paid, billingPeriod: 'weekly' })).toBe(false);
    expect('billingPeriod' in normalizeEntitlements({ ...paid, billingPeriod: null })).toBe(false);
  });

  it('does not infer a period from the renewal date', () => {
    const e = normalizeEntitlements({ ...paid, currentPeriodEnd: '2027-11-26T16:11:14Z' });
    expect(e.billingPeriod).toBeUndefined();
  });

  it('a free account has no billing period', () => {
    expect(normalizeEntitlements({ plan: 'free', billingPeriod: 'monthly' }).billingPeriod).toBeUndefined();
  });
});

describe('Plans screen wiring', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const section = readFileSync(
    path.join(root, 'components', 'subscription', 'TierPlansSection.tsx'),
    'utf8',
  );
  const screen = readFileSync(path.join(root, 'app', 'subscription.tsx'), 'utf8');

  it('the plan cards decide price and billing line through currentCardPeriodView', () => {
    expect(section).toContain('currentCardPeriodView(action, currentPeriod, interval)');
    expect(section).toMatch(/plan && periodView\.showPrice/);
    expect(section).toContain('periodView.line');
  });

  it('the screen passes the verified period from the entitlements', () => {
    expect(screen).toContain('currentPeriod={entitlements.billingPeriod}');
  });
});
