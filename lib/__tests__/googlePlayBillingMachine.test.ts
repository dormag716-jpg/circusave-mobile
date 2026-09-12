import fs from 'fs';
import path from 'path';
import type {
  ProductSubscription,
  PurchaseAndroid,
  SubscriptionOffer,
} from 'expo-iap';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

import type {
  GooglePlayBillingStatus,
  GooglePlayVerificationResponse,
} from '../api';
import type {
  GooglePlayBillingGateway,
  GooglePlayPurchaseError,
} from '../googlePlayBilling';
import {
  createGooglePlayBillingMachine,
  GooglePlayBillingOperationError,
  type GooglePlayBillingState,
} from '../googlePlayBillingMachine';
import { freeEntitlements } from '../entitlements';

const MONTHLY_TOKEN = 'synthetic-monthly-offer-token';
const MONTHLY_BASE_TOKEN = 'synthetic-monthly-base-token';
const ANNUAL_TOKEN = 'synthetic-annual-offer-token';

function pricingPhase(
  displayPrice: string,
  priceAmountMicros: string,
  billingPeriod: string,
  recurrenceMode: number,
) {
  return {
    billingCycleCount: recurrenceMode === 1 ? 0 : 1,
    billingPeriod,
    formattedPrice: displayPrice,
    priceAmountMicros,
    priceCurrencyCode: 'USD',
    recurrenceMode,
  };
}

function productFixture(): ProductSubscription {
  return {
    id: 'organizer-pro',
    type: 'subs',
    platform: 'android',
    title: 'Organizer Pro',
    description: 'Premium circle organization',
    displayName: 'Organizer Pro',
    displayPrice: '$7.99',
    currency: 'USD',
    price: 7.99,
    nameAndroid: 'Organizer Pro',
    productStatusAndroid: 'ok',
    subscriptionOffers: [
      {
        id: 'trial-monthly',
        basePlanIdAndroid: 'monthly',
        offerTokenAndroid: MONTHLY_TOKEN,
        displayPrice: 'Free',
        currency: 'USD',
        price: 0,
        paymentMode: 'free-trial',
        period: { unit: 'week', value: 1 },
        type: 'introductory',
        pricingPhasesAndroid: {
          pricingPhaseList: [
            pricingPhase('Free', '0', 'P1W', 3),
            pricingPhase('$7.99', '7990000', 'P1M', 1),
          ],
        },
      },
      {
        id: 'monthly',
        basePlanIdAndroid: 'monthly',
        offerTokenAndroid: MONTHLY_BASE_TOKEN,
        displayPrice: '$7.99',
        currency: 'USD',
        price: 7.99,
        paymentMode: 'pay-as-you-go',
        period: { unit: 'month', value: 1 },
        type: 'introductory',
        pricingPhasesAndroid: {
          pricingPhaseList: [
            pricingPhase('$7.99', '7990000', 'P1M', 1),
          ],
        },
      },
      {
        id: 'annual',
        basePlanIdAndroid: 'annual',
        offerTokenAndroid: ANNUAL_TOKEN,
        displayPrice: '$59.99',
        currency: 'USD',
        price: 59.99,
        paymentMode: 'pay-as-you-go',
        period: { unit: 'year', value: 1 },
        type: 'introductory',
        pricingPhasesAndroid: {
          pricingPhaseList: [
            pricingPhase('$59.99', '59990000', 'P1Y', 1),
          ],
        },
      },
      {
        id: 'wrong-offer',
        basePlanIdAndroid: 'wrong-base-plan',
        offerTokenAndroid: 'synthetic-wrong-token',
        displayPrice: '$1.00',
        currency: 'USD',
        price: 1,
        paymentMode: 'pay-as-you-go',
        period: { unit: 'month', value: 1 },
        type: 'promotional',
        pricingPhasesAndroid: {
          pricingPhaseList: [pricingPhase('$1.00', '1000000', 'P1M', 1)],
        },
      },
    ],
  } as ProductSubscription;
}

function subscriptionOffers(
  product: ProductSubscription,
): SubscriptionOffer[] {
  return product.subscriptionOffers ?? [];
}

function enabledStatus(
  overrides: Partial<Extract<GooglePlayBillingStatus, { enabled: true }>> = {},
): Extract<GooglePlayBillingStatus, { enabled: true }> {
  return {
    provider: 'google_play',
    enabled: true,
    packageName: 'com.circusave.mobile',
    obfuscatedAccountId: 'backend-obfuscated-account-id',
    monthly: {
      productId: 'organizer-pro',
      basePlanId: 'monthly',
      offerId: 'trial-monthly',
    },
    annual: {
      productId: 'organizer-pro',
      basePlanId: 'annual',
      offerId: null,
    },
    trialEligible: true,
    ...overrides,
  };
}

function verificationResponse(
  overrides: Partial<GooglePlayVerificationResponse> = {},
): GooglePlayVerificationResponse {
  return {
    provider: 'google_play',
    restored: false,
    status: 'active',
    productId: 'organizer-pro',
    basePlanId: 'monthly',
    offerId: 'trial-monthly',
    currentPeriodEnd: '2026-10-01T00:00:00Z',
    acknowledgementState: 'acknowledged',
    entitlements: {
      ...freeEntitlements(),
      plan: 'premium',
      subscriptionStatus: 'active',
      source: 'google_play',
    },
    ...overrides,
  };
}

function purchaseFixture(
  purchaseToken: string,
  overrides: Partial<PurchaseAndroid> = {},
): PurchaseAndroid {
  return {
    id: `purchase-${purchaseToken}`,
    productId: 'organizer-pro',
    currentPlanId: 'monthly',
    purchaseState: 'purchased',
    purchaseToken,
    isAutoRenewing: true,
    quantity: 1,
    store: 'google',
    transactionDate: 1,
    ...overrides,
  } as PurchaseAndroid;
}

function createGatewayHarness(options?: {
  android?: boolean;
  availability?: Awaited<
    ReturnType<GooglePlayBillingGateway['getAvailability']>
  >;
  products?: ProductSubscription[];
  purchases?: PurchaseAndroid[];
}) {
  let purchaseListener: ((purchase: PurchaseAndroid) => void) | null = null;
  let errorListener: ((error: GooglePlayPurchaseError) => void) | null = null;
  const listenerCleanup = jest.fn();
  const gateway = {
    isAndroid: jest.fn(() => options?.android ?? true),
    getAvailability: jest.fn().mockResolvedValue(
      options?.availability ?? { available: true },
    ),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    querySubscriptionProducts: jest
      .fn()
      .mockResolvedValue(options?.products ?? [productFixture()]),
    registerPurchaseListeners: jest.fn(
      async (
        onPurchase: (purchase: PurchaseAndroid) => void,
        onError: (error: GooglePlayPurchaseError) => void,
      ) => {
        purchaseListener = onPurchase;
        errorListener = onError;
        return listenerCleanup;
      },
    ),
    requestSubscription: jest.fn().mockResolvedValue(undefined),
    getAvailableSubscriptionPurchases: jest
      .fn()
      .mockResolvedValue(options?.purchases ?? []),
    finishSubscription: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<GooglePlayBillingGateway>;

  return {
    gateway,
    listenerCleanup,
    emitPurchase(purchase: PurchaseAndroid) {
      purchaseListener?.(purchase);
    },
    emitError(error: GooglePlayPurchaseError) {
      errorListener?.(error);
    },
  };
}

function createApiHarness(status: GooglePlayBillingStatus = enabledStatus()) {
  return {
    getStatus: jest.fn().mockResolvedValue(status),
    verify: jest.fn().mockResolvedValue(verificationResponse()),
    restore: jest
      .fn()
      .mockResolvedValue(verificationResponse({ restored: true })),
    refreshEntitlements: jest
      .fn()
      .mockResolvedValue(verificationResponse().entitlements),
  };
}

function waitForStatus(
  machine: ReturnType<typeof createGooglePlayBillingMachine>,
  expected: GooglePlayBillingState['status'],
): Promise<GooglePlayBillingState> {
  const current = machine.getState();
  if (current.status === expected) {
    return Promise.resolve(current);
  }
  return new Promise((resolve) => {
    const unsubscribe = machine.subscribe((next) => {
      if (next.status === expected) {
        unsubscribe();
        resolve(next);
      }
    });
  });
}

async function readyMachine(options?: {
  gateway?: ReturnType<typeof createGatewayHarness>;
  api?: ReturnType<typeof createApiHarness>;
}) {
  const gateway = options?.gateway ?? createGatewayHarness();
  const api = options?.api ?? createApiHarness();
  const machine = createGooglePlayBillingMachine({
    authToken: 'synthetic-session-token',
    gateway: gateway.gateway,
    api,
  });
  await machine.initialize();
  expect(machine.getState().status).toBe('ready');
  return { machine, gateway, api };
}

describe('Google Play billing state machine', () => {
  test('Android disabled status avoids every native operation', async () => {
    const gateway = createGatewayHarness();
    const api = createApiHarness({ provider: 'google_play', enabled: false });
    const machine = createGooglePlayBillingMachine({
      authToken: 'synthetic-session-token',
      gateway: gateway.gateway,
      api,
    });

    await machine.initialize();

    expect(machine.getState()).toEqual({ status: 'disabled' });
    expect(api.getStatus).toHaveBeenCalledTimes(1);
    expect(gateway.gateway.getAvailability).not.toHaveBeenCalled();
    expect(gateway.gateway.connect).not.toHaveBeenCalled();
  });

  test('non-Android platforms enter unsupported without backend or native work', async () => {
    const gateway = createGatewayHarness({ android: false });
    const api = createApiHarness();
    const machine = createGooglePlayBillingMachine({
      authToken: 'synthetic-session-token',
      gateway: gateway.gateway,
      api,
    });

    await machine.initialize();

    expect(machine.getState()).toEqual({
      status: 'unsupported',
      reason: 'non_android',
    });
    expect(api.getStatus).not.toHaveBeenCalled();
    expect(gateway.gateway.connect).not.toHaveBeenCalled();
  });

  test('missing native module enters a sanitized unsupported state', async () => {
    const gateway = createGatewayHarness({
      availability: {
        available: false,
        reason: 'native_module_unavailable',
      },
    });
    const machine = createGooglePlayBillingMachine({
      authToken: 'synthetic-session-token',
      gateway: gateway.gateway,
      api: createApiHarness(),
    });

    await machine.initialize();

    expect(machine.getState()).toEqual({
      status: 'unsupported',
      reason: 'native_module_unavailable',
    });
    expect(gateway.gateway.connect).not.toHaveBeenCalled();
  });

  test('connects once, queries unique product IDs, and loads Play metadata', async () => {
    const { machine, gateway } = await readyMachine();

    expect(gateway.gateway.connect).toHaveBeenCalledTimes(1);
    expect(gateway.gateway.querySubscriptionProducts).toHaveBeenCalledWith([
      'organizer-pro',
    ]);
    expect(gateway.gateway.registerPurchaseListeners).toHaveBeenCalledTimes(1);
    expect(machine.getState()).toMatchObject({
      status: 'ready',
      plans: {
        monthly: {
          productId: 'organizer-pro',
          basePlanId: 'monthly',
          offerId: 'trial-monthly',
          title: 'Organizer Pro',
          description: 'Premium circle organization',
          displayPrice: '$7.99',
          currency: 'USD',
          billingPeriod: 'P1M',
          pricingPhases: [
            { displayPrice: 'Free', billingPeriod: 'P1W' },
            { displayPrice: '$7.99', billingPeriod: 'P1M' },
          ],
        },
        annual: {
          productId: 'organizer-pro',
          basePlanId: 'annual',
          offerId: null,
          displayPrice: '$59.99',
          billingPeriod: 'P1Y',
        },
      },
    });

    await machine.initialize();
    expect(gateway.gateway.connect).toHaveBeenCalledTimes(1);
    expect(gateway.gateway.registerPurchaseListeners).toHaveBeenCalledTimes(1);
  });

  test('matches the exact product, base plan and configured offer', async () => {
    const { machine, gateway } = await readyMachine();

    await machine.purchase('monthly');

    expect(gateway.gateway.requestSubscription).toHaveBeenCalledWith(
      'organizer-pro',
      MONTHLY_TOKEN,
      'backend-obfuscated-account-id',
    );
  });

  test('selects an exact free-trial offer only when trial eligible', async () => {
    const { machine, gateway } = await readyMachine();

    await machine.purchase('monthly');

    expect(gateway.gateway.requestSubscription).toHaveBeenCalledWith(
      'organizer-pro',
      MONTHLY_TOKEN,
      expect.any(String),
    );
  });

  test('uses the paid base plan when trial is unavailable and no offer is configured', async () => {
    const api = createApiHarness(
      enabledStatus({
        monthly: {
          productId: 'organizer-pro',
          basePlanId: 'monthly',
          offerId: null,
        },
        trialEligible: false,
      }),
    );
    const { machine, gateway } = await readyMachine({ api });

    await machine.purchase('monthly');

    expect(gateway.gateway.requestSubscription).toHaveBeenCalledWith(
      'organizer-pro',
      MONTHLY_BASE_TOKEN,
      expect.any(String),
    );
  });

  test('ignores a configured trial offer and selects the base plan when ineligible', async () => {
    const gateway = createGatewayHarness();
    const { machine } = await readyMachine({
      gateway,
      api: createApiHarness(enabledStatus({ trialEligible: false })),
    });

    expect(machine.getState()).toMatchObject({
      status: 'ready',
      plans: { monthly: { offerId: null } },
    });
    await machine.purchase('monthly');

    expect(gateway.gateway.requestSubscription).toHaveBeenCalledWith(
      'organizer-pro',
      MONTHLY_BASE_TOKEN,
      'backend-obfuscated-account-id',
    );
  });

  test('fails closed for an ineligible user when only a trial offer exists', async () => {
    const trialOnlyProduct = {
      ...productFixture(),
      subscriptionOffers: subscriptionOffers(productFixture()).filter(
        (offer) => offer.id !== 'monthly',
      ),
    } as ProductSubscription;
    const gateway = createGatewayHarness({ products: [trialOnlyProduct] });
    const machine = createGooglePlayBillingMachine({
      authToken: 'synthetic-session-token',
      gateway: gateway.gateway,
      api: createApiHarness(enabledStatus({ trialEligible: false })),
    });

    await machine.initialize();

    expect(machine.getState()).toMatchObject({
      status: 'failed',
      code: 'product_configuration_unavailable',
      retryable: false,
    });
  });

  test('fails closed for ambiguous non-trial base-plan representations', async () => {
    const product = productFixture();
    const basePlan = subscriptionOffers(product).find(
      (offer) => offer.id === 'monthly',
    );
    expect(basePlan).toBeDefined();
    const ambiguousProduct = {
      ...product,
      subscriptionOffers: [
        ...subscriptionOffers(product),
        {
          ...basePlan,
          offerTokenAndroid: 'synthetic-second-base-token',
        },
      ],
    } as ProductSubscription;
    const gateway = createGatewayHarness({ products: [ambiguousProduct] });
    const machine = createGooglePlayBillingMachine({
      authToken: 'synthetic-session-token',
      gateway: gateway.gateway,
      api: createApiHarness(enabledStatus({ trialEligible: false })),
    });

    await machine.initialize();

    expect(machine.getState()).toMatchObject({
      status: 'failed',
      code: 'product_configuration_unavailable',
      retryable: false,
    });
  });

  test('never selects a zero-price base-plan phase for an ineligible user', async () => {
    const product = productFixture();
    const zeroPriceBasePlan = {
      ...subscriptionOffers(product).find((offer) => offer.id === 'monthly'),
      paymentMode: 'pay-as-you-go' as const,
      pricingPhasesAndroid: {
        pricingPhaseList: [
          pricingPhase('Free', '0', 'P1W', 3),
          pricingPhase('$7.99', '7990000', 'P1M', 1),
        ],
      },
    };
    const zeroPriceProduct = {
      ...product,
      subscriptionOffers: [
        ...subscriptionOffers(product).filter(
          (offer) => offer.id !== 'monthly',
        ),
        zeroPriceBasePlan,
      ],
    } as ProductSubscription;
    const gateway = createGatewayHarness({ products: [zeroPriceProduct] });
    const machine = createGooglePlayBillingMachine({
      authToken: 'synthetic-session-token',
      gateway: gateway.gateway,
      api: createApiHarness(enabledStatus({ trialEligible: false })),
    });

    await machine.initialize();

    expect(machine.getState()).toMatchObject({
      status: 'failed',
      code: 'product_configuration_unavailable',
      retryable: false,
    });
  });

  test('fails closed when the configured offer cannot be matched', async () => {
    const gateway = createGatewayHarness();
    const api = createApiHarness(
      enabledStatus({
        monthly: {
          productId: 'organizer-pro',
          basePlanId: 'monthly',
          offerId: 'missing-offer',
        },
      }),
    );
    const machine = createGooglePlayBillingMachine({
      authToken: 'synthetic-session-token',
      gateway: gateway.gateway,
      api,
    });

    await machine.initialize();

    expect(machine.getState()).toMatchObject({
      status: 'failed',
      code: 'product_configuration_unavailable',
      retryable: false,
    });
  });

  test('rejects concurrent purchase and restore operations', async () => {
    const gateway = createGatewayHarness();
    let releasePurchase: (() => void) | undefined;
    gateway.gateway.requestSubscription.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releasePurchase = resolve;
        }),
    );
    const { machine } = await readyMachine({ gateway });

    const firstPurchase = machine.purchase('monthly');
    await expect(machine.purchase('annual')).rejects.toMatchObject({
      code: 'google_play_operation_in_progress',
    });
    await expect(machine.restore()).rejects.toBeInstanceOf(
      GooglePlayBillingOperationError,
    );
    releasePurchase?.();
    await firstPurchase;
  });

  test('canceled purchases return to ready without a failed state', async () => {
    const { machine, gateway } = await readyMachine();
    await machine.purchase('monthly');

    gateway.emitError({
      kind: 'canceled',
      message: 'Google Play purchase failed.',
    });

    expect(machine.getState().status).toBe('ready');
  });

  test('pending purchases do not verify or finish', async () => {
    const { machine, gateway, api } = await readyMachine();
    await machine.purchase('monthly');

    gateway.emitPurchase(
      purchaseFixture('synthetic-pending-token', {
        purchaseState: 'pending',
      }),
    );

    expect(machine.getState()).toEqual({
      status: 'pending',
      plan: 'monthly',
    });
    expect(api.verify).not.toHaveBeenCalled();
    expect(gateway.gateway.finishSubscription).not.toHaveBeenCalled();
  });

  test('uses the active purchase plan when Play omits currentPlanId', async () => {
    const { machine, gateway, api } = await readyMachine();
    await machine.purchase('annual');
    const succeeded = waitForStatus(machine, 'succeeded');

    gateway.emitPurchase(
      purchaseFixture('synthetic-missing-current-plan', {
        currentPlanId: null,
      }),
    );
    await succeeded;

    expect(api.verify).toHaveBeenCalledTimes(1);
    expect(machine.getState()).toEqual({
      status: 'succeeded',
      operation: 'purchase',
      plan: 'annual',
    });
  });

  test('verifies and refreshes entitlements before finishing a purchase', async () => {
    const { machine, gateway, api } = await readyMachine();
    await machine.purchase('monthly');
    const succeeded = waitForStatus(machine, 'succeeded');

    gateway.emitPurchase(purchaseFixture('synthetic-success-token'));
    await succeeded;

    expect(api.verify).toHaveBeenCalledWith(
      'synthetic-session-token',
      'synthetic-success-token',
    );
    expect(api.verify.mock.invocationCallOrder[0]).toBeLessThan(
      api.refreshEntitlements.mock.invocationCallOrder[0],
    );
    expect(api.refreshEntitlements.mock.invocationCallOrder[0]).toBeLessThan(
      gateway.gateway.finishSubscription.mock.invocationCallOrder[0],
    );
    expect(machine.getState()).toEqual({
      status: 'succeeded',
      operation: 'purchase',
      plan: 'monthly',
    });
  });

  test('verification failure never finishes or grants locally', async () => {
    const gateway = createGatewayHarness();
    const api = createApiHarness();
    api.verify.mockRejectedValueOnce(new Error('provider unavailable'));
    const { machine } = await readyMachine({ gateway, api });
    await machine.purchase('monthly');
    const failed = waitForStatus(machine, 'failed');

    gateway.emitPurchase(purchaseFixture('synthetic-verification-failure'));
    await failed;

    expect(gateway.gateway.finishSubscription).not.toHaveBeenCalled();
    expect(api.refreshEntitlements).not.toHaveBeenCalled();
    expect(machine.getState()).toEqual({
      status: 'failed',
      operation: 'purchase',
      code: 'verification_failed',
      retryable: true,
    });
  });

  test('non-entitling verification response fails without local access', async () => {
    const gateway = createGatewayHarness();
    const api = createApiHarness();
    api.verify.mockResolvedValueOnce(
      verificationResponse({
        status: 'expired',
        entitlements: freeEntitlements(),
      }),
    );
    const { machine } = await readyMachine({ gateway, api });
    await machine.purchase('monthly');
    const failed = waitForStatus(machine, 'failed');

    gateway.emitPurchase(purchaseFixture('synthetic-expired-purchase'));
    await failed;

    expect(api.refreshEntitlements).toHaveBeenCalledTimes(1);
    expect(gateway.gateway.finishSubscription).toHaveBeenCalledTimes(1);
    expect(machine.getState()).toEqual({
      status: 'failed',
      operation: 'purchase',
      code: 'verification_not_entitled',
      retryable: false,
    });
  });

  test('deduplicates repeated purchase callbacks in memory', async () => {
    const { machine, gateway, api } = await readyMachine();
    await machine.purchase('monthly');
    const purchase = purchaseFixture('synthetic-duplicate-callback');
    const succeeded = waitForStatus(machine, 'succeeded');

    gateway.emitPurchase(purchase);
    gateway.emitPurchase(purchase);
    await succeeded;
    gateway.emitPurchase(purchase);

    expect(api.verify).toHaveBeenCalledTimes(1);
    expect(gateway.gateway.finishSubscription).toHaveBeenCalledTimes(1);
  });

  test('keeps backend access and permits retry when finishTransaction fails', async () => {
    const gateway = createGatewayHarness();
    gateway.gateway.finishSubscription
      .mockRejectedValueOnce(new Error('temporary Play failure'))
      .mockResolvedValueOnce(undefined);
    const api = createApiHarness();
    const { machine } = await readyMachine({ gateway, api });
    await machine.purchase('monthly');
    const failed = waitForStatus(machine, 'failed');

    gateway.emitPurchase(purchaseFixture('synthetic-completion-retry'));
    await failed;

    expect(api.verify).toHaveBeenCalledTimes(1);
    expect(api.refreshEntitlements).toHaveBeenCalledTimes(1);
    expect(machine.getState()).toMatchObject({
      status: 'failed',
      code: 'transaction_completion_failed',
      retryable: true,
    });

    await machine.retryCompletion();

    expect(api.verify).toHaveBeenCalledTimes(1);
    expect(api.refreshEntitlements).toHaveBeenCalledTimes(2);
    expect(gateway.gateway.finishSubscription).toHaveBeenCalledTimes(2);
    expect(machine.getState()).toEqual({
      status: 'succeeded',
      operation: 'completion',
    });
  });

  test('restore with no purchases refreshes authoritative entitlements', async () => {
    const { machine, gateway, api } = await readyMachine();

    await machine.restore();

    expect(api.restore).not.toHaveBeenCalled();
    expect(api.refreshEntitlements).toHaveBeenCalledTimes(1);
    expect(gateway.gateway.finishSubscription).not.toHaveBeenCalled();
    expect(machine.getState()).toEqual({
      status: 'succeeded',
      operation: 'restore',
      restore: {
        discovered: 0,
        eligible: 0,
        restored: 0,
        expired: 0,
        duplicates: 0,
        failed: 0,
        completionPending: 0,
      },
    });
  });

  test('an unsolicited pending update does not block explicit reconciliation', async () => {
    const { machine, gateway, api } = await readyMachine();
    gateway.emitPurchase(
      purchaseFixture('synthetic-unsolicited-pending', {
        purchaseState: 'pending',
      }),
    );
    expect(machine.getState().status).toBe('pending');

    await machine.reconcile();

    expect(api.restore).not.toHaveBeenCalled();
    expect(machine.getState().status).toBe('succeeded');
  });

  test('restore verifies one eligible purchase and finishes it', async () => {
    const gateway = createGatewayHarness({
      purchases: [purchaseFixture('synthetic-restore-one')],
    });
    const api = createApiHarness();
    const { machine } = await readyMachine({ gateway, api });

    await machine.restore();

    expect(api.restore).toHaveBeenCalledWith(
      'synthetic-session-token',
      'synthetic-restore-one',
    );
    expect(gateway.gateway.finishSubscription).toHaveBeenCalledTimes(1);
    expect(api.refreshEntitlements).toHaveBeenCalledTimes(1);
    expect(machine.getState()).toMatchObject({
      status: 'succeeded',
      restore: { discovered: 1, eligible: 1, restored: 1 },
    });
  });

  test('restore deduplicates identical purchase tokens', async () => {
    const purchase = purchaseFixture('synthetic-restore-duplicate');
    const gateway = createGatewayHarness({ purchases: [purchase, purchase] });
    const api = createApiHarness();
    const { machine } = await readyMachine({ gateway, api });

    await machine.restore();

    expect(api.restore).toHaveBeenCalledTimes(1);
    expect(machine.getState()).toMatchObject({
      status: 'succeeded',
      restore: { discovered: 2, eligible: 2, restored: 1, duplicates: 1 },
    });
  });

  test('reconciliation retries a restore completion without resubmitting the token', async () => {
    const purchase = purchaseFixture('synthetic-restore-completion-retry');
    const gateway = createGatewayHarness({ purchases: [purchase] });
    gateway.gateway.finishSubscription
      .mockRejectedValueOnce(new Error('temporary completion failure'))
      .mockResolvedValueOnce(undefined);
    const api = createApiHarness();
    const { machine } = await readyMachine({ gateway, api });

    await machine.restore();
    expect(machine.getState()).toMatchObject({
      status: 'failed',
      code: 'transaction_completion_failed',
      restore: { restored: 1, completionPending: 1 },
    });

    await machine.reconcile();

    expect(api.restore).toHaveBeenCalledTimes(1);
    expect(gateway.gateway.finishSubscription).toHaveBeenCalledTimes(2);
    expect(machine.getState()).toMatchObject({
      status: 'succeeded',
      operation: 'restore',
      restore: { duplicates: 1, completionPending: 0 },
    });
  });

  test('restore handles multiple, expired and partial provider results deterministically', async () => {
    const purchases = [
      purchaseFixture('synthetic-restore-active'),
      purchaseFixture('synthetic-restore-failed', { currentPlanId: 'annual' }),
      purchaseFixture('synthetic-restore-expired', { currentPlanId: 'annual' }),
      purchaseFixture('synthetic-ineligible', { productId: 'other-product' }),
    ];
    const gateway = createGatewayHarness({ purchases });
    const api = createApiHarness();
    api.restore
      .mockResolvedValueOnce(verificationResponse({ restored: true }))
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce(
        verificationResponse({
          restored: true,
          status: 'expired',
          basePlanId: 'annual',
          offerId: null,
        }),
      );
    const { machine } = await readyMachine({ gateway, api });

    await machine.restore();

    expect(api.restore).toHaveBeenCalledTimes(3);
    expect(api.refreshEntitlements).toHaveBeenCalledTimes(1);
    expect(machine.getState()).toEqual({
      status: 'failed',
      operation: 'restore',
      code: 'partial_restore_failed',
      retryable: true,
      restore: {
        discovered: 4,
        eligible: 3,
        restored: 2,
        expired: 1,
        duplicates: 0,
        failed: 1,
        completionPending: 0,
      },
    });
  });

  test('dispose removes listeners and disconnects exactly once', async () => {
    const { machine, gateway } = await readyMachine();

    await machine.dispose();
    await machine.dispose();

    expect(gateway.listenerCleanup).toHaveBeenCalledTimes(1);
    expect(gateway.gateway.disconnect).toHaveBeenCalledTimes(1);
    expect(machine.getState()).toEqual({ status: 'idle' });
  });

  test('re-registers listeners after a connected account becomes disabled', async () => {
    const gateway = createGatewayHarness();
    const api = createApiHarness();
    const machine = createGooglePlayBillingMachine({
      authToken: 'synthetic-session-token',
      gateway: gateway.gateway,
      api,
    });
    await machine.initialize();
    api.getStatus
      .mockResolvedValueOnce({ provider: 'google_play', enabled: false })
      .mockResolvedValueOnce(enabledStatus());

    await machine.initialize();
    expect(machine.getState().status).toBe('disabled');
    await machine.initialize();

    expect(machine.getState().status).toBe('ready');
    expect(gateway.gateway.connect).toHaveBeenCalledTimes(2);
    expect(gateway.gateway.registerPurchaseListeners).toHaveBeenCalledTimes(2);
    expect(gateway.listenerCleanup).toHaveBeenCalledTimes(1);
  });

  test('queues purchase callbacks that arrive during reinitialization', async () => {
    const gateway = createGatewayHarness();
    const api = createApiHarness();
    const { machine } = await readyMachine({ gateway, api });
    let releaseStatus:
      | ((status: Extract<GooglePlayBillingStatus, { enabled: true }>) => void)
      | undefined;
    api.getStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseStatus = resolve;
        }),
    );

    const reinitialize = machine.initialize();
    expect(machine.getState().status).toBe('connecting');
    const succeeded = waitForStatus(machine, 'succeeded');
    gateway.emitPurchase(purchaseFixture('synthetic-reinitialize-event'));
    releaseStatus?.(enabledStatus());
    await reinitialize;
    await succeeded;

    expect(api.verify).toHaveBeenCalledWith(
      'synthetic-session-token',
      'synthetic-reinitialize-event',
    );
    expect(gateway.gateway.finishSubscription).toHaveBeenCalledTimes(1);
  });

  test('never exposes purchase tokens through state, errors, logs or persistence', async () => {
    const rawToken = 'synthetic-private-purchase-token';
    const gateway = createGatewayHarness();
    gateway.gateway.finishSubscription.mockRejectedValueOnce(
      new Error(`temporary failure for ${rawToken}`),
    );
    const { machine } = await readyMachine({
      gateway,
      api: createApiHarness(),
    });
    const states: GooglePlayBillingState[] = [];
    machine.subscribe((next) => states.push(next));
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    await machine.purchase('monthly');
    const failed = waitForStatus(machine, 'failed');

    gateway.emitPurchase(purchaseFixture(rawToken));
    await failed;

    expect(JSON.stringify(states)).not.toContain(rawToken);
    expect(JSON.stringify(machine.getState())).not.toContain(rawToken);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    const source = fs.readFileSync(
      path.join(__dirname, '..', 'googlePlayBillingMachine.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/AsyncStorage|SecureStore|console\.(?:log|warn|error)/);

    consoleLog.mockRestore();
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });
});
