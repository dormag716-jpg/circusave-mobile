import {
  freeEntitlements,
  hasCapability,
  isPremiumPlan,
  normalizeEntitlements,
  planTierFromEntitlements,
} from '../entitlements';
import { getEntitlements } from '../api';

describe('entitlements foundation', () => {
  const originalFetch = global.fetch;
  const originalApiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const globalWithDev = globalThis as typeof globalThis & { __DEV__?: boolean };
  const originalDev = globalWithDev.__DEV__;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:5000';
    globalWithDev.__DEV__ = false;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiBase === undefined) {
      delete process.env.EXPO_PUBLIC_API_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBase;
    }
    if (originalDev === undefined) {
      delete globalWithDev.__DEV__;
    } else {
      globalWithDev.__DEV__ = originalDev;
    }
  });

  test('freeEntitlements is fail-closed free', () => {
    const free = freeEntitlements();
    expect(free.plan).toBe('free');
    expect(free.subscriptionStatus).toBe('inactive');
    expect(free.capabilities.advancedReports).toBe(false);
    expect(free.capabilities.fullActivityHistory).toBe(false);
    expect(free.capabilities.maxParticipatingHands).toBe(20);
    expect(free.capabilities.maxOpenCircles).toBe(1);
    expect(free.capabilities.aiIntroAvailable).toBe(true);
    expect(free.capabilities.contributionPaymentsEnabled).toBe(false);
    expect(isPremiumPlan(free)).toBe(false);
  });

  test('normalizeEntitlements maps active Premium capabilities', () => {
    const premium = normalizeEntitlements({
      plan: 'premium',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-09-01T00:00:00Z',
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
      source: 'stripe',
      capabilities: {
        multiCircle: true,
        maxParticipatingHands: 50,
        maxOpenCircles: null,
        aiAssistant: true,
        aiIntroAvailable: false,
        draftPayoutPdf: true,
        finalPayoutPdf: true,
        advancedReports: true,
        premiumReminders: true,
        fullActivityHistory: true,
        contributionPaymentsEnabled: true,
      },
    });
    expect(premium.plan).toBe('premium');
    expect(premium.source).toBe('stripe');
    expect(hasCapability(premium, 'advancedReports')).toBe(true);
    expect(hasCapability(premium, 'fullActivityHistory')).toBe(true);
    expect(hasCapability(premium, 'contributionPaymentsEnabled')).toBe(true);
    expect(planTierFromEntitlements(premium)).toBe('premium');
  });

  test('normalizeEntitlements fails closed on garbage', () => {
    expect(normalizeEntitlements(null).plan).toBe('free');
    expect(normalizeEntitlements({ plan: 'premium' }).plan).toBe('premium');
    // plan premium without true capability flags → capabilities stay false (fail closed flags)
    const partial = normalizeEntitlements({ plan: 'premium', capabilities: {} });
    expect(partial.plan).toBe('premium');
    expect(partial.capabilities.advancedReports).toBe(false);
    expect(partial.capabilities.contributionPaymentsEnabled).toBe(false);
  });

  test('local role cannot forge access — freeEntitlements ignores role strings', () => {
    // There is no role field on entitlements; consumers must not use user.role.
    const forged = normalizeEntitlements({
      plan: 'free',
      role: 'premium',
      capabilities: { advancedReports: true },
    });
    expect(forged.plan).toBe('free');
    // Free plan path does not honor premium capability flags from payload.
    expect(forged.capabilities.advancedReports).toBe(false);
  });

  test('free plan can receive the independent contribution payment capability', () => {
    const freeWithContributionPayments = normalizeEntitlements({
      plan: 'free',
      capabilities: { contributionPaymentsEnabled: true },
    });
    expect(freeWithContributionPayments.plan).toBe('free');
    expect(
      freeWithContributionPayments.capabilities.contributionPaymentsEnabled,
    ).toBe(true);
    expect(freeWithContributionPayments.capabilities.advancedReports).toBe(false);
  });

  test('getEntitlements fetches /auth/me/entitlements', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          plan: 'premium',
          subscriptionStatus: 'active',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          trialEndsAt: null,
          source: 'stripe',
          capabilities: {
            multiCircle: true,
            maxParticipatingHands: 50,
            maxOpenCircles: null,
            aiAssistant: true,
            aiIntroAvailable: false,
            draftPayoutPdf: true,
            finalPayoutPdf: true,
            advancedReports: true,
            premiumReminders: true,
            fullActivityHistory: true,
            contributionPaymentsEnabled: true,
          },
        }),
    }) as unknown as typeof fetch;

    const result = await getEntitlements('tok_abc');
    expect(result.plan).toBe('premium');
    expect(result.capabilities.contributionPaymentsEnabled).toBe(true);
    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    expect(url).toBe('http://127.0.0.1:5000/api/auth/me/entitlements');
  });

  test('getEntitlements fails closed to free on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const result = await getEntitlements('tok_abc');
    expect(result.plan).toBe('free');
    expect(result.capabilities.fullActivityHistory).toBe(false);
    expect(result.capabilities.contributionPaymentsEnabled).toBe(false);
  });

  test('expired user loses Premium UI capabilities after normalize', () => {
    const expired = normalizeEntitlements({
      plan: 'free',
      subscriptionStatus: 'expired',
      source: 'stripe',
      capabilities: freeEntitlements().capabilities,
    });
    expect(expired.plan).toBe('free');
    expect(hasCapability(expired, 'fullActivityHistory')).toBe(false);
    expect(planTierFromEntitlements(expired)).toBe('free');
  });
});
