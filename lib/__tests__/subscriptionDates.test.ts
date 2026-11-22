import { subscriptionDateLine } from '../billing/subscriptionDates';

const base = {
  plan: 'premium' as const,
  subscriptionStatus: 'active' as const,
  currentPeriodEnd: '2027-11-21T12:00:00Z',
  cancelAtPeriodEnd: false,
  trialEndsAt: null,
};

describe('subscriptionDateLine', () => {
  test('an active plan shows when it renews', () => {
    expect(subscriptionDateLine(base)).toEqual({
      key: 'renewsOn',
      date: '2027-11-21T12:00:00Z',
    });
  });

  test('a plan set not to renew shows when access ends', () => {
    expect(subscriptionDateLine({ ...base, cancelAtPeriodEnd: true })).toEqual({
      key: 'accessUntil',
      date: '2027-11-21T12:00:00Z',
    });
  });

  test('a trial shows the trial end, falling back to the period end', () => {
    const trial = { ...base, subscriptionStatus: 'trialing' as const };
    expect(
      subscriptionDateLine({ ...trial, trialEndsAt: '2027-01-05T12:00:00Z' }),
    ).toEqual({ key: 'trialEndsOn', date: '2027-01-05T12:00:00Z' });
    expect(subscriptionDateLine(trial)).toEqual({
      key: 'trialEndsOn',
      date: '2027-11-21T12:00:00Z',
    });
  });

  test('a cancelled trial shows when access ends', () => {
    expect(
      subscriptionDateLine({
        ...base,
        subscriptionStatus: 'trialing',
        cancelAtPeriodEnd: true,
        trialEndsAt: '2027-01-05T12:00:00Z',
      }),
    ).toEqual({ key: 'accessUntil', date: '2027-01-05T12:00:00Z' });
  });

  test('free accounts and missing or unreadable dates show nothing', () => {
    expect(subscriptionDateLine({ ...base, plan: 'free' as never })).toBeNull();
    expect(subscriptionDateLine({ ...base, currentPeriodEnd: null })).toBeNull();
    expect(subscriptionDateLine({ ...base, currentPeriodEnd: 'not a date' })).toBeNull();
  });
});
