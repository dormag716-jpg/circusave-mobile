jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import type { AppleBillingGateway } from '../billing/appleBilling';
import { ApplePurchaseRequestError } from '../billing/appleBilling';
import {
  createAppleBillingMachine,
  hasIntroductoryOffer,
  type AppleBillingApi,
} from '../billing/appleBillingMachine';
import { normalizeEntitlements } from '../billing/entitlements';
import {
  normalizeAppleBillingStatus,
  normalizeAppleVerificationResponse,
  type AppleBillingStatus,
} from '../api/billing';

const premium = normalizeEntitlements({
  plan: 'premium',
  tier: 'organizer_pro',
  subscriptionStatus: 'active',
  source: 'apple',
  capabilities: {},
});
const free = normalizeEntitlements({ plan: 'free', tier: 'free', capabilities: {} });

function enabledStatus(): AppleBillingStatus {
  return {
    provider: 'apple_app_store',
    enabled: true,
    bundleId: 'com.circusave.mobile',
    environment: 'sandbox',
    appAccountToken: '11111111-1111-5111-8111-111111111111',
    tiers: {
      member_pro: {
        monthly: { productId: 'cs.member.monthly' },
        annual: { productId: 'cs.member.annual' },
      },
      organizer_pro: {
        monthly: { productId: 'cs.organizer.monthly' },
        annual: { productId: 'cs.organizer.annual' },
      },
    },
  };
}

function product(id: string, price: string, overrides: Record<string, unknown> = {}): any {
  return {
    id,
    type: 'subs',
    platform: 'ios',
    title: id,
    displayNameIOS: id,
    description: '',
    displayPrice: price,
    currency: 'USD',
    subscriptionPeriodUnitIOS: id.endsWith('annual') ? 'year' : 'month',
    subscriptionPeriodNumberIOS: '1',
    introductoryPriceIOS: null,
    introductoryPricePaymentModeIOS: 'empty',
    subscriptionOffers: [],
    ...overrides,
  };
}

const PRODUCTS = [
  product('cs.member.monthly', '$2.99'),
  product('cs.member.annual', '$24.99'),
  product('cs.organizer.monthly', '$5.99'),
  product('cs.organizer.annual', '$49.99'),
];

function harness(options: {
  products?: any[];
  status?: AppleBillingStatus;
  verified?: any;
  available?: boolean;
} = {}) {
  let onPurchase: (purchase: any) => void = () => undefined;
  let onError: (kind: any) => void = () => undefined;
  const gateway = {
    isAvailable: jest.fn(async () => options.available ?? true),
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(async () => undefined),
    querySubscriptionProducts: jest.fn(async () => options.products ?? PRODUCTS),
    registerPurchaseListeners: jest.fn(async (a: any, b: any) => {
      onPurchase = a;
      onError = b;
      return () => undefined;
    }),
    requestSubscription: jest.fn(async () => undefined),
    getAvailableSubscriptionPurchases: jest.fn(async () => [] as any[]),
    finishTransaction: jest.fn(async () => undefined),
  };
  const verify = jest.fn(async (_t: string, _jws: string) => ({
    provider: 'apple_app_store' as const,
    restored: false,
    status: 'active',
    productId: 'cs.organizer.annual',
    tier: 'organizer_pro' as const,
    billingPeriod: 'annual' as const,
    currentPeriodEnd: null,
    entitlements: premium,
    ...(options.verified ?? {}),
  }));
  const api: AppleBillingApi = {
    getStatus: jest.fn(async () => options.status ?? enabledStatus()),
    verify,
    restore: verify,
  };
  const refresh = jest.fn(async () => premium);
  const machine = createAppleBillingMachine({
    authToken: 'session-token',
    gateway: gateway as unknown as AppleBillingGateway,
    api,
    refreshEntitlements: refresh,
  });
  return {
    machine,
    gateway,
    api,
    verify,
    refresh,
    emitPurchase: (purchase: any) => onPurchase(purchase),
    emitError: (kind: any) => onError(kind),
  };
}

const purchase = (overrides: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  productId: 'cs.organizer.annual',
  purchaseToken: 'signed.jws.value',
  purchaseState: 'purchased',
  store: 'apple',
  ...overrides,
});

describe('Apple billing machine', () => {
  test('shows Apple-returned prices for all four paid plans', async () => {
    const { machine } = harness();
    await machine.initialize();
    const state = machine.getState();
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.plans.member_pro_monthly?.displayPrice).toBe('$2.99');
    expect(state.plans.member_pro_annual?.displayPrice).toBe('$24.99');
    expect(state.plans.organizer_pro_monthly?.displayPrice).toBe('$5.99');
    expect(state.plans.organizer_pro_annual?.displayPrice).toBe('$49.99');
    expect(state.plans.organizer_pro_annual?.billingPeriod).toBe('P1Y');
    expect(state.plans.organizer_pro_monthly?.billingPeriod).toBe('P1M');
    expect(state.plans.organizer_pro_annual?.trial).toBeNull();
  });

  test('stays unavailable when billing is off, unsupported or products are missing', async () => {
    const off = harness({ status: { provider: 'apple_app_store', enabled: false } });
    await off.machine.initialize();
    expect(off.machine.getState().status).toBe('disabled');
    expect(off.gateway.querySubscriptionProducts).not.toHaveBeenCalled();

    const unsupported = harness({ available: false });
    await unsupported.machine.initialize();
    expect(unsupported.machine.getState().status).toBe('unsupported');

    const none = harness({ products: [] });
    await none.machine.initialize();
    expect(none.machine.getState()).toMatchObject({
      status: 'failed',
      code: 'product_configuration_unavailable',
    });
    await none.machine.purchase('organizer_pro_annual');
    expect(none.gateway.requestSubscription).not.toHaveBeenCalled();
  });

  test('never offers a product that carries an introductory or trial offer', async () => {
    const trialProduct = product('cs.organizer.annual', '$49.99', {
      introductoryPriceIOS: 'Free',
      introductoryPricePaymentModeIOS: 'free-trial',
    });
    expect(hasIntroductoryOffer(trialProduct)).toBe(true);
    expect(hasIntroductoryOffer(PRODUCTS[0])).toBe(false);
    const { machine } = harness({
      products: [PRODUCTS[0], PRODUCTS[1], PRODUCTS[2], trialProduct],
    });
    await machine.initialize();
    const state = machine.getState();
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.plans.organizer_pro_annual).toBeUndefined();
    expect(state.plans.organizer_pro_monthly).toBeDefined();
  });

  test('purchase sends the account token and the plain product only', async () => {
    const { machine, gateway } = harness();
    await machine.initialize();
    await machine.purchase('organizer_pro_annual');
    expect(gateway.requestSubscription).toHaveBeenCalledWith(
      'cs.organizer.annual',
      '11111111-1111-5111-8111-111111111111',
    );
    expect(gateway.requestSubscription.mock.calls[0]).toHaveLength(2);
  });

  test('verifies with the backend, finishes the transaction and refreshes access', async () => {
    const { machine, gateway, verify, refresh, emitPurchase } = harness();
    await machine.initialize();
    emitPurchase(purchase());
    await new Promise((resolve) => setImmediate(resolve));
    expect(verify).toHaveBeenCalledWith('session-token', 'signed.jws.value');
    expect(gateway.finishTransaction).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
    expect(machine.getState()).toMatchObject({ status: 'succeeded', operation: 'purchase' });
  });

  test('does not finish or grant when the backend does not entitle the purchase', async () => {
    const { machine, gateway, emitPurchase } = harness({
      verified: { entitlements: free, tier: null },
    });
    await machine.initialize();
    emitPurchase(purchase());
    await new Promise((resolve) => setImmediate(resolve));
    expect(gateway.finishTransaction).not.toHaveBeenCalled();
    expect(machine.getState()).toMatchObject({
      status: 'failed',
      code: 'verification_not_entitled',
    });
  });

  test('verification failure keeps the transaction unfinished and can retry', async () => {
    const h = harness();
    h.verify.mockRejectedValueOnce(new Error('offline'));
    await h.machine.initialize();
    h.emitPurchase(purchase());
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.gateway.finishTransaction).not.toHaveBeenCalled();
    expect(h.machine.getState()).toMatchObject({ status: 'failed', code: 'verification_failed' });
    h.emitPurchase(purchase());
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.machine.getState()).toMatchObject({ status: 'succeeded' });
  });

  test('ignores duplicate callbacks, unknown products and missing signed data', async () => {
    const { machine, verify, emitPurchase } = harness();
    await machine.initialize();
    emitPurchase(purchase());
    emitPurchase(purchase());
    emitPurchase(purchase({ id: 'tx-2', productId: 'someone.elses.product' }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(verify).toHaveBeenCalledTimes(1);

    const second = harness();
    await second.machine.initialize();
    second.emitPurchase(purchase({ purchaseToken: null }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(second.verify).not.toHaveBeenCalled();
  });

  test('canceled and pending purchases change nothing', async () => {
    const { machine, gateway, emitPurchase } = harness();
    await machine.initialize();
    gateway.requestSubscription.mockRejectedValueOnce(new ApplePurchaseRequestError('canceled'));
    await machine.purchase('member_pro_monthly');
    expect(machine.getState()).toMatchObject({ status: 'ready', outcome: 'canceled' });

    emitPurchase(purchase({ purchaseState: 'pending' }));
    expect(machine.getState().status).toBe('pending');
    expect(gateway.finishTransaction).not.toHaveBeenCalled();
  });

  test('restore verifies each owned transaction through the restore endpoint', async () => {
    const { machine, gateway, api } = harness();
    await machine.initialize();
    gateway.getAvailableSubscriptionPurchases.mockResolvedValueOnce([
      purchase(),
      purchase({ id: 'x', productId: 'other.app.product' }),
    ]);
    await machine.restore();
    expect(api.restore).toHaveBeenCalledTimes(1);
    expect(machine.getState()).toMatchObject({
      status: 'succeeded',
      operation: 'restore',
      restored: 1,
    });
  });

  test('restore with nothing to restore reports zero and still refreshes access', async () => {
    const { machine, refresh } = harness();
    await machine.initialize();
    await machine.restore();
    expect(machine.getState()).toMatchObject({ status: 'succeeded', restored: 0 });
    expect(refresh).toHaveBeenCalled();
  });

  test('purchase is ignored until products are ready', async () => {
    const { machine, gateway } = harness();
    await machine.purchase('organizer_pro_annual');
    expect(gateway.requestSubscription).not.toHaveBeenCalled();
  });
});

describe('Apple billing API shapes', () => {
  test('normalizes an enabled status and rejects malformed ones', () => {
    const status = normalizeAppleBillingStatus({
      provider: 'apple_app_store',
      enabled: true,
      bundleId: 'com.circusave.mobile',
      environment: 'sandbox',
      appAccountToken: 'tok',
      tiers: { organizer_pro: { annual: { productId: 'cs.organizer.annual' }, monthly: {} } },
      trialEligible: false,
    });
    expect(status).toMatchObject({ enabled: true });
    expect((status as any).tiers.organizer_pro.annual.productId).toBe('cs.organizer.annual');
    expect((status as any).tiers.organizer_pro.monthly).toBeUndefined();
    expect(normalizeAppleBillingStatus({ provider: 'apple_app_store', enabled: false })).toEqual({
      provider: 'apple_app_store',
      enabled: false,
    });
    expect(() => normalizeAppleBillingStatus({ provider: 'google_play', enabled: true })).toThrow();
    expect(() =>
      normalizeAppleBillingStatus({ provider: 'apple_app_store', enabled: true, bundleId: 'x' }),
    ).toThrow();
  });

  test('normalizes a verification response', () => {
    const response = normalizeAppleVerificationResponse({
      provider: 'apple_app_store',
      restored: false,
      status: 'active',
      productId: 'cs.organizer.annual',
      tier: 'organizer_pro',
      billingPeriod: 'annual',
      currentPeriodEnd: null,
      entitlements: { plan: 'premium', tier: 'organizer_pro', capabilities: {} },
    });
    expect(response.tier).toBe('organizer_pro');
    expect(() => normalizeAppleVerificationResponse({})).toThrow();
  });
});
