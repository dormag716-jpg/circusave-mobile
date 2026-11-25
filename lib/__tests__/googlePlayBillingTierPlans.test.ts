import type { ProductSubscription, PurchaseAndroid } from 'expo-iap';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

import type { GooglePlayBillingStatus, GooglePlayVerificationResponse } from '../api';
import type {
  GooglePlayBillingGateway,
  GooglePlayPurchaseError,
} from '../billing/googlePlayBilling';
import {
  createGooglePlayBillingMachine,
  GooglePlayBillingOperationError,
} from '../billing/googlePlayBillingMachine';
import { freeEntitlements } from '../billing/entitlements';

function offer(basePlan: string, price: string, period: string, token: string) {
  return {
    id: basePlan,
    basePlanIdAndroid: basePlan,
    offerTokenAndroid: token,
    displayPrice: price,
    currency: 'USD',
    price: 1,
    paymentMode: 'pay-as-you-go',
    period: { unit: 'month', value: 1 },
    type: 'introductory',
    pricingPhasesAndroid: {
      pricingPhaseList: [
        {
          billingCycleCount: 0,
          billingPeriod: period,
          formattedPrice: price,
          priceAmountMicros: '1000000',
          priceCurrencyCode: 'USD',
          recurrenceMode: 1,
        },
      ],
    },
  };
}

function product(id: string, monthly: string, annual: string): ProductSubscription {
  return {
    id,
    type: 'subs',
    platform: 'android',
    title: id,
    description: id,
    displayName: id,
    displayPrice: monthly,
    currency: 'USD',
    price: 1,
    subscriptionOffers: [
      offer('monthly', monthly, 'P1M', `${id}-monthly-token`),
      offer('annual', annual, 'P1Y', `${id}-annual-token`),
    ],
  } as unknown as ProductSubscription;
}

const legacy = product('organizer-pro', '$7.99', '$59.99');
const memberPro = product('member_pro', '$4.99', '$39.99');
const organizerPro = product('organizer_pro_tier', '$9.99', '$79.99');

function status(withTiers = true): Extract<GooglePlayBillingStatus, { enabled: true }> {
  return {
    provider: 'google_play',
    enabled: true,
    packageName: 'com.circusave.mobile',
    obfuscatedAccountId: 'acct',
    monthly: { productId: 'organizer-pro', basePlanId: 'monthly', offerId: null },
    annual: { productId: 'organizer-pro', basePlanId: 'annual', offerId: null },
    trialEligible: false,
    ...(withTiers
      ? {
          tiers: {
            member_pro: {
              monthly: { productId: 'member_pro', basePlanId: 'monthly', offerId: null },
              annual: { productId: 'member_pro', basePlanId: 'annual', offerId: null },
            },
            organizer_pro: {
              monthly: {
                productId: 'organizer_pro_tier',
                basePlanId: 'monthly',
                offerId: null,
              },
              annual: {
                productId: 'organizer_pro_tier',
                basePlanId: 'annual',
                offerId: null,
              },
            },
          },
        }
      : {}),
  };
}

function owned(productId: string, basePlan: string, token: string): PurchaseAndroid {
  return {
    id: `p-${token}`,
    productId,
    currentPlanId: basePlan,
    purchaseState: 'purchased',
    purchaseToken: token,
    isAutoRenewing: true,
    quantity: 1,
    store: 'google',
    transactionDate: 1,
  } as PurchaseAndroid;
}

function verification(): GooglePlayVerificationResponse {
  return {
    provider: 'google_play',
    restored: false,
    status: 'active',
    productId: 'member_pro',
    basePlanId: 'monthly',
    offerId: null,
    currentPeriodEnd: '2026-12-01T00:00:00Z',
    acknowledgementState: 'acknowledged',
    entitlements: { ...freeEntitlements(), plan: 'premium', source: 'google_play' },
  };
}

function harness(options: {
  products?: ProductSubscription[];
  purchases?: PurchaseAndroid[];
  tierQueryFails?: boolean;
}) {
  let onPurchase: ((purchase: PurchaseAndroid) => void) | null = null;
  const all = options.products ?? [legacy, memberPro, organizerPro];
  const query = jest.fn(async (ids: string[]) => {
    if (options.tierQueryFails && ids.includes('member_pro')) {
      throw new Error('boom');
    }
    return all.filter((p) => ids.includes(p.id));
  });
  const gateway = {
    isAndroid: jest.fn(() => true),
    getAvailability: jest.fn().mockResolvedValue({ available: true }),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    querySubscriptionProducts: query,
    registerPurchaseListeners: jest.fn(
      async (
        listener: (purchase: PurchaseAndroid) => void,
        _onError: (error: GooglePlayPurchaseError) => void,
      ) => {
        onPurchase = listener;
        return jest.fn();
      },
    ),
    requestSubscription: jest.fn().mockResolvedValue(undefined),
    getAvailableSubscriptionPurchases: jest.fn().mockResolvedValue(options.purchases ?? []),
    finishSubscription: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<GooglePlayBillingGateway>;
  const api = {
    getStatus: jest.fn().mockResolvedValue(status()),
    verify: jest.fn().mockResolvedValue(verification()),
    restore: jest.fn().mockResolvedValue(verification()),
    refreshEntitlements: jest.fn().mockResolvedValue(undefined),
  };
  return { gateway, api, emit: (p: PurchaseAndroid) => onPurchase?.(p) };
}

async function ready(h: ReturnType<typeof harness>) {
  const machine = createGooglePlayBillingMachine({
    authToken: 'session',
    gateway: h.gateway,
    api: h.api,
  });
  await machine.initialize();
  return machine;
}

describe('Member Pro and Organizer Pro plans', () => {
  test('are offered next to the existing plans, with prices from Google Play', async () => {
    const machine = await ready(harness({}));
    const state = machine.getState();
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(Object.keys(state.tierPlans ?? {}).sort()).toEqual([
      'member_pro_annual',
      'member_pro_monthly',
      'organizer_pro_annual',
      'organizer_pro_monthly',
    ]);
    expect(state.tierPlans?.member_pro_monthly?.displayPrice).toBe('$4.99');
    expect(state.tierPlans?.organizer_pro_annual?.displayPrice).toBe('$79.99');
    expect(state.plans.monthly.displayPrice).toBe('$7.99');
  });

  test('a tier product missing from Google Play is hidden, the rest stays', async () => {
    const machine = await ready(harness({ products: [legacy, memberPro] }));
    const state = machine.getState();
    if (state.status !== 'ready') throw new Error('not ready');
    expect(state.tierPlans?.organizer_pro_monthly).toBeUndefined();
    expect(state.tierPlans?.member_pro_monthly).toBeDefined();
  });

  test('a failed tier lookup never breaks the existing plans', async () => {
    const machine = await ready(harness({ tierQueryFails: true }));
    const state = machine.getState();
    if (state.status !== 'ready') throw new Error('not ready');
    expect(state.tierPlans).toBeUndefined();
    expect(state.plans.monthly.productId).toBe('organizer-pro');
  });

  test('a fresh purchase is a plain request', async () => {
    const h = harness({});
    const machine = await ready(h);
    await machine.purchase('member_pro_monthly');
    expect(h.gateway.requestSubscription).toHaveBeenCalledWith(
      'member_pro',
      'member_pro-monthly-token',
      'acct',
    );
  });

  test('upgrade Member Pro to Organizer Pro replaces now, prorated', async () => {
    const h = harness({ purchases: [owned('member_pro', 'monthly', 'old-token')] });
    const machine = await ready(h);
    await machine.purchase('organizer_pro_monthly');
    expect(h.gateway.requestSubscription).toHaveBeenCalledWith(
      'organizer_pro_tier',
      'organizer_pro_tier-monthly-token',
      'acct',
      {
        oldProductId: 'member_pro',
        oldPurchaseToken: 'old-token',
        replacementMode: 'charge-prorated-price',
      },
    );
  });

  test('downgrade Organizer Pro to Member Pro is deferred to renewal', async () => {
    const h = harness({
      purchases: [owned('organizer_pro_tier', 'annual', 'old-token')],
    });
    const machine = await ready(h);
    await machine.purchase('member_pro_annual');
    expect(h.gateway.requestSubscription).toHaveBeenCalledWith(
      'member_pro',
      'member_pro-annual-token',
      'acct',
      {
        oldProductId: 'organizer_pro_tier',
        oldPurchaseToken: 'old-token',
        replacementMode: 'deferred',
      },
    );
  });

  test('monthly/annual switches are refused before Google Play opens', async () => {
    const h = harness({ purchases: [owned('member_pro', 'monthly', 'old-token')] });
    const machine = await ready(h);
    await expect(machine.purchase('member_pro_annual')).rejects.toMatchObject({
      code: 'google_play_plan_change_unavailable',
    });
    await expect(machine.purchase('member_pro_annual')).rejects.toBeInstanceOf(
      GooglePlayBillingOperationError,
    );
    expect(h.gateway.requestSubscription).not.toHaveBeenCalled();
    expect(machine.getState().status).toBe('ready');
  });

  test('a paid tier purchase is verified by the backend, then completed', async () => {
    const h = harness({});
    const machine = await ready(h);
    await machine.purchase('member_pro_monthly');
    h.emit(owned('member_pro', 'monthly', 'new-token'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.api.verify).toHaveBeenCalledWith('session', 'new-token');
    expect(h.gateway.finishSubscription).toHaveBeenCalled();
    expect(machine.getState()).toMatchObject({
      status: 'succeeded',
      plan: 'member_pro_monthly',
    });
  });
});
