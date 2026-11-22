import {
  freeEntitlements,
  hasCapability,
  isPremiumPlan,
  normalizeEntitlements,
  planTierFromEntitlements,
} from '../billing/entitlements';
import {
  getAuthoritativeEntitlements,
  getEntitlements,
  getFreshContributionPaymentsCapability,
} from '../api';

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
    expect(free.capabilities.aiIntroAvailable).toBe(false);
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

  test('normalizeEntitlements preserves the google_play provider source', () => {
    const premium = normalizeEntitlements({
      plan: 'premium',
      subscriptionStatus: 'active',
      source: 'google_play',
      capabilities: {},
    });

    expect(premium.source).toBe('google_play');
  });

  test('normalizeEntitlements preserves the existing Stripe provider source', () => {
    const premium = normalizeEntitlements({
      plan: 'premium',
      subscriptionStatus: 'trialing',
      source: 'stripe',
      capabilities: {},
    });

    expect(premium.source).toBe('stripe');
    expect(premium.subscriptionStatus).toBe('trialing');
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

  test('authoritative entitlement fetch surfaces failure to synchronization owners', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(
      getAuthoritativeEntitlements('tok_abc'),
    ).rejects.toBeDefined();
  });

  test.each([
    ['missing', {}],
    ['missing capabilities', { plan: 'premium' }],
    ['false', { capabilities: { contributionPaymentsEnabled: false } }],
    ['invalid string', { capabilities: { contributionPaymentsEnabled: 'true' } }],
    ['invalid number', { capabilities: { contributionPaymentsEnabled: 1 } }],
  ])('fresh contribution capability fails closed for %s payload', async (_label, payload) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
    }) as unknown as typeof fetch;

    await expect(
      getFreshContributionPaymentsCapability('tok_abc'),
    ).resolves.toBe(false);
  });

  test('fresh contribution capability accepts only explicit true', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          capabilities: { contributionPaymentsEnabled: true },
        }),
    }) as unknown as typeof fetch;

    await expect(
      getFreshContributionPaymentsCapability('tok_abc'),
    ).resolves.toBe(true);
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

  describe('plan tier fields', () => {
    test('free defaults: one included hand, three at most, 20 members', () => {
      const free = freeEntitlements();
      expect(free.tier).toBe('free');
      expect(free.capabilities).toMatchObject({
        maxMembersPerCircle: 20,
        handsIncluded: 1,
        maxHandsPerPerson: 3,
      });
    });

    test('an older backend without the new fields still parses', () => {
      const premium = normalizeEntitlements({
        plan: 'premium',
        subscriptionStatus: 'active',
        capabilities: { multiCircle: true, maxParticipatingHands: 50 },
      });
      expect(premium.plan).toBe('premium');
      expect(premium.tier).toBe('organizer_pro');
      expect(premium.capabilities).toMatchObject({
        maxMembersPerCircle: 50,
        handsIncluded: 3,
        maxHandsPerPerson: 6,
      });
    });

    test('reads the tier and limits a newer backend sends', () => {
      const member = normalizeEntitlements({
        plan: 'premium',
        tier: 'member_pro',
        subscriptionStatus: 'active',
        capabilities: {
          maxMembersPerCircle: 20,
          handsIncluded: 3,
          maxHandsPerPerson: 6,
        },
      });
      expect(member.tier).toBe('member_pro');
      expect(member.capabilities.maxMembersPerCircle).toBe(20);
      expect(member.plan).toBe('premium');
    });

    test('ignores unreadable limits and unknown tiers', () => {
      const premium = normalizeEntitlements({
        plan: 'premium',
        tier: 'business',
        subscriptionStatus: 'active',
        capabilities: { maxMembersPerCircle: 'lots', handsIncluded: 0, maxHandsPerPerson: -2 },
      });
      expect(premium.tier).toBe('organizer_pro');
      expect(premium.capabilities).toMatchObject({
        maxMembersPerCircle: 50,
        handsIncluded: 3,
        maxHandsPerPerson: 6,
      });
    });

    test('a free account never gets a paid tier, even if one is sent', () => {
      const free = normalizeEntitlements({
        plan: 'free',
        tier: 'organizer_pro',
        capabilities: { maxMembersPerCircle: 50 },
      });
      expect(free.tier).toBe('free');
      expect(isPremiumPlan(free)).toBe(false);
    });
  });
});
