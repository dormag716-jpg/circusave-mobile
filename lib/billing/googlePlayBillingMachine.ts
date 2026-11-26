import type {
  PricingPhaseAndroid,
  ProductSubscription,
  Purchase,
  PurchaseAndroid,
  SubscriptionOffer,
} from 'expo-iap';

import {
  getEntitlements,
  getGooglePlayBillingStatus,
  restoreGooglePlayPurchase,
  verifyGooglePlayPurchase,
  type GooglePlayBillingStatus,
  type GooglePlayPlanConfig,
  type GooglePlayVerificationResponse,
} from '../api';
import { planChangeRequest, type BillingInterval, type PaidTier } from './planChange';
import {
  googlePlayBilling,
  GooglePlayNativeBillingUnavailableError,
  type GooglePlayBillingGateway,
  type GooglePlayPurchaseError,
} from './googlePlayBilling';

export type GooglePlayPlanKey = 'monthly' | 'annual';
export type GooglePlayTierPlanKey =
  | 'member_pro_monthly'
  | 'member_pro_annual'
  | 'organizer_pro_monthly'
  | 'organizer_pro_annual';
export type GooglePlayAnyPlanKey = GooglePlayPlanKey | GooglePlayTierPlanKey;

const TIER_PLAN_KEYS: readonly GooglePlayTierPlanKey[] = [
  'member_pro_monthly',
  'member_pro_annual',
  'organizer_pro_monthly',
  'organizer_pro_annual',
];

function tierPlanKey(
  tier: PaidTier,
  interval: BillingInterval,
): GooglePlayTierPlanKey {
  return `${tier}_${interval}`;
}

function splitTierPlanKey(key: GooglePlayTierPlanKey): {
  tier: PaidTier;
  interval: BillingInterval;
} {
  return {
    tier: key.startsWith('member_pro') ? 'member_pro' : 'organizer_pro',
    interval: key.endsWith('annual') ? 'annual' : 'monthly',
  };
}

export type GooglePlayPricingPhase = {
  billingCycleCount: number;
  billingPeriod: string;
  displayPrice: string;
  priceCurrencyCode: string;
  recurrenceMode: number;
};

export type GooglePlayPlan = {
  key: GooglePlayAnyPlanKey;
  productId: string;
  basePlanId: string;
  offerId: string | null;
  title: string;
  description: string;
  displayPrice: string;
  currency: string;
  billingPeriod: string | null;
  trial: {
    billingPeriod: string;
    displayPrice: string;
  } | null;
  pricingPhases: GooglePlayPricingPhase[];
};

export type GooglePlayRestoreSummary = {
  discovered: number;
  eligible: number;
  restored: number;
  expired: number;
  duplicates: number;
  failed: number;
  completionPending: number;
};

export type GooglePlayBillingFailureCode =
  | 'status_failed'
  | 'product_configuration_unavailable'
  | 'purchase_failed'
  | 'purchase_invalid'
  | 'verification_failed'
  | 'verification_not_entitled'
  | 'entitlement_refresh_failed'
  | 'transaction_completion_failed'
  | 'restore_failed'
  | 'partial_restore_failed';

export type GooglePlayBillingState =
  | { status: 'idle' }
  | { status: 'unsupported'; reason: 'non_android' | 'native_module_unavailable' }
  | { status: 'disabled' }
  | { status: 'connecting' }
  | { status: 'loading_products' }
  | {
      status: 'ready';
      plans: Record<GooglePlayPlanKey, GooglePlayPlan>;
      /** Member Pro / Organizer Pro products found in Google Play. Absent when none. */
      tierPlans?: Partial<Record<GooglePlayTierPlanKey, GooglePlayPlan>>;
      outcome?: 'canceled';
    }
  | { status: 'purchasing'; plan: GooglePlayAnyPlanKey }
  | { status: 'pending'; plan: GooglePlayAnyPlanKey }
  | { status: 'verifying'; plan: GooglePlayAnyPlanKey }
  | { status: 'restoring' }
  | {
      status: 'succeeded';
      operation: 'purchase' | 'restore' | 'completion';
      plan?: GooglePlayAnyPlanKey;
      restore?: GooglePlayRestoreSummary;
    }
  | {
      status: 'failed';
      operation: 'initialize' | 'purchase' | 'restore' | 'completion';
      code: GooglePlayBillingFailureCode;
      retryable: boolean;
      restore?: GooglePlayRestoreSummary;
    };

type InternalPlan = {
  presentation: GooglePlayPlan;
  offerToken: string;
};

type PendingCompletion = {
  operation: 'purchase' | 'restore';
  plan: GooglePlayAnyPlanKey | null;
  purchase: PurchaseAndroid;
};

type BillingApi = {
  getStatus(token: string): Promise<GooglePlayBillingStatus>;
  verify(
    token: string,
    purchaseToken: string,
  ): Promise<GooglePlayVerificationResponse>;
  restore(
    token: string,
    purchaseToken: string,
  ): Promise<GooglePlayVerificationResponse>;
  refreshEntitlements(token: string): Promise<unknown>;
};

type GooglePlayBillingMachineOptions = {
  authToken: string;
  gateway?: GooglePlayBillingGateway;
  api?: Partial<BillingApi>;
};

const ALLOWED_TRANSITIONS: Record<
  GooglePlayBillingState['status'],
  ReadonlySet<GooglePlayBillingState['status']>
> = {
  idle: new Set(['unsupported', 'connecting']),
  unsupported: new Set(['idle', 'connecting']),
  disabled: new Set(['idle', 'connecting']),
  connecting: new Set(['idle', 'unsupported', 'disabled', 'loading_products', 'failed']),
  loading_products: new Set(['idle', 'ready', 'failed']),
  ready: new Set(['idle', 'connecting', 'purchasing', 'pending', 'verifying', 'restoring']),
  purchasing: new Set(['idle', 'ready', 'pending', 'verifying', 'failed']),
  pending: new Set(['idle', 'ready', 'verifying', 'restoring', 'failed']),
  verifying: new Set(['idle', 'succeeded', 'failed']),
  restoring: new Set(['idle', 'succeeded', 'failed']),
  succeeded: new Set(['idle', 'connecting', 'verifying', 'restoring']),
  failed: new Set(['idle', 'connecting', 'ready', 'verifying', 'restoring']),
};

export class GooglePlayBillingOperationError extends Error {
  readonly code:
    | 'google_play_invalid_state'
    | 'google_play_operation_in_progress'
    | 'google_play_disposed'
    | 'google_play_plan_change_unavailable';

  constructor(
    code:
      | 'google_play_invalid_state'
      | 'google_play_operation_in_progress'
      | 'google_play_disposed'
      | 'google_play_plan_change_unavailable',
  ) {
    super(
      code === 'google_play_operation_in_progress'
        ? 'Another Google Play billing operation is already in progress.'
        : code === 'google_play_disposed'
          ? 'Google Play billing has been disposed.'
          : code === 'google_play_plan_change_unavailable'
            ? 'This plan change is not available in the app yet.'
            : 'Google Play billing is not ready.',
    );
    this.name = 'GooglePlayBillingOperationError';
    this.code = code;
  }
}

function isAndroidSubscription(
  product: ProductSubscription,
): product is Extract<ProductSubscription, { platform: 'android' }> {
  return product.platform === 'android';
}

function isAndroidPurchase(purchase: Purchase): purchase is PurchaseAndroid {
  return purchase.store === 'google';
}

function isFreeTrialOffer(offer: SubscriptionOffer): boolean {
  if (offer.paymentMode === 'free-trial') {
    return true;
  }
  return (
    offer.pricingPhasesAndroid?.pricingPhaseList.some(
      (phase) =>
        phase.billingCycleCount > 0 &&
        Number.parseInt(phase.priceAmountMicros, 10) === 0,
    ) === true
  );
}

function copyPricingPhase(phase: PricingPhaseAndroid): GooglePlayPricingPhase {
  return {
    billingCycleCount: phase.billingCycleCount,
    billingPeriod: phase.billingPeriod,
    displayPrice: phase.formattedPrice,
    priceCurrencyCode: phase.priceCurrencyCode,
    recurrenceMode: phase.recurrenceMode,
  };
}

function matchPlan(
  key: GooglePlayAnyPlanKey,
  config: GooglePlayPlanConfig,
  products: ProductSubscription[],
): InternalPlan | null {
  const product = products.find(
    (candidate) => candidate.id === config.productId,
  );
  if (!product || !isAndroidSubscription(product)) {
    return null;
  }

  const matchingOffers = product.subscriptionOffers.filter((offer) => {
    if (offer.basePlanIdAndroid !== config.basePlanId) {
      return false;
    }
    // Paid plans have no free trial. Only the plain base-plan offer is ever
    // chosen, whatever offerId or trialEligible the backend still sends.
    return (
      offer.id === config.basePlanId &&
      Boolean(offer.offerTokenAndroid?.trim()) &&
      !isFreeTrialOffer(offer)
    );
  });
  if (matchingOffers.length !== 1) {
    return null;
  }

  const offer = matchingOffers[0];
  const offerToken = offer.offerTokenAndroid;
  if (!offerToken) {
    return null;
  }
  const rawPricingPhases =
    offer.pricingPhasesAndroid?.pricingPhaseList ?? [];
  const pricingPhases = rawPricingPhases.map(copyPricingPhase);
  const recurringPhase =
    pricingPhases.find((phase) => phase.recurrenceMode === 1) ??
    pricingPhases.at(-1);
  const trialPhase = isFreeTrialOffer(offer)
    ? rawPricingPhases.find(
        (phase) =>
          phase.billingCycleCount > 0 &&
          Number.parseInt(phase.priceAmountMicros, 10) === 0,
      )
    : undefined;

  return {
    offerToken,
    presentation: {
      key,
      productId: config.productId,
      basePlanId: config.basePlanId,
      offerId: null,
      title: product.title,
      description: product.description,
      displayPrice: recurringPhase?.displayPrice ?? offer.displayPrice,
      currency:
        recurringPhase?.priceCurrencyCode ?? offer.currency ?? product.currency,
      billingPeriod: recurringPhase?.billingPeriod ?? null,
      trial: trialPhase
        ? {
            billingPeriod: trialPhase.billingPeriod,
            displayPrice: trialPhase.formattedPrice,
          }
        : null,
      pricingPhases,
    },
  };
}

function emptyRestoreSummary(discovered = 0): GooglePlayRestoreSummary {
  return {
    discovered,
    eligible: 0,
    restored: 0,
    expired: 0,
    duplicates: 0,
    failed: 0,
    completionPending: 0,
  };
}

export function createGooglePlayBillingMachine(
  options: GooglePlayBillingMachineOptions,
) {
  const gateway = options.gateway ?? googlePlayBilling;
  const api: BillingApi = {
    getStatus: options.api?.getStatus ?? getGooglePlayBillingStatus,
    verify: options.api?.verify ?? verifyGooglePlayPurchase,
    restore: options.api?.restore ?? restoreGooglePlayPurchase,
    refreshEntitlements: options.api?.refreshEntitlements ?? getEntitlements,
  };

  let state: GooglePlayBillingState = { status: 'idle' };
  let config: Extract<GooglePlayBillingStatus, { enabled: true }> | null = null;
  let plans: Record<GooglePlayPlanKey, InternalPlan> | null = null;
  let tierPlans: Partial<Record<GooglePlayTierPlanKey, InternalPlan>> = {};
  let listenerCleanup: (() => void) | null = null;
  let initializationPromise: Promise<void> | null = null;
  let nativeConnected = false;
  let activeOperation: 'purchase' | 'restore' | 'completion' | null = null;
  let activePlan: GooglePlayAnyPlanKey | null = null;
  let disposed = false;
  const listeners = new Set<(state: GooglePlayBillingState) => void>();
  const queuedPurchaseEvents: PurchaseAndroid[] = [];
  const processingTokens = new Set<string>();
  const verifiedTokens = new Set<string>();
  const pendingCompletions = new Map<string, PendingCompletion>();

  function transition(next: GooglePlayBillingState): void {
    if (!ALLOWED_TRANSITIONS[state.status].has(next.status)) {
      throw new GooglePlayBillingOperationError('google_play_invalid_state');
    }
    state = next;
    listeners.forEach((listener) => listener(state));
  }

  function ensureUsable(): void {
    if (disposed) {
      throw new GooglePlayBillingOperationError('google_play_disposed');
    }
  }

  function ensureNoActiveOperation(): void {
    if (activeOperation) {
      throw new GooglePlayBillingOperationError(
        'google_play_operation_in_progress',
      );
    }
  }

  function publicPlans(): Record<GooglePlayPlanKey, GooglePlayPlan> {
    if (!plans) {
      throw new GooglePlayBillingOperationError('google_play_invalid_state');
    }
    return {
      monthly: plans.monthly.presentation,
      annual: plans.annual.presentation,
    };
  }

  function readyState(
    outcome?: 'canceled',
  ): Extract<GooglePlayBillingState, { status: 'ready' }> {
    const tierPresentation: Partial<
      Record<GooglePlayTierPlanKey, GooglePlayPlan>
    > = {};
    for (const key of TIER_PLAN_KEYS) {
      const plan = tierPlans[key];
      if (plan) {
        tierPresentation[key] = plan.presentation;
      }
    }
    return {
      status: 'ready',
      plans: publicPlans(),
      ...(Object.keys(tierPresentation).length > 0
        ? { tierPlans: tierPresentation }
        : {}),
      ...(outcome ? { outcome } : {}),
    };
  }

  function internalPlan(key: GooglePlayAnyPlanKey): InternalPlan | null {
    if (key === 'monthly' || key === 'annual') {
      return plans?.[key] ?? null;
    }
    return tierPlans[key] ?? null;
  }

  function allPlanKeys(): GooglePlayAnyPlanKey[] {
    return [
      'monthly',
      'annual',
      ...TIER_PLAN_KEYS.filter((key) => tierPlans[key]),
    ];
  }

  function planForPurchase(
    purchase: PurchaseAndroid,
    fallback: GooglePlayAnyPlanKey | null = null,
  ): GooglePlayAnyPlanKey | null {
    if (!plans) {
      return null;
    }
    const candidates = allPlanKeys().filter((key) => {
      const plan = internalPlan(key)?.presentation;
      return (
        plan?.productId === purchase.productId &&
        (!purchase.currentPlanId || purchase.currentPlanId === plan.basePlanId)
      );
    });
    if (candidates.length === 1) {
      return candidates[0];
    }
    if (
      fallback &&
      internalPlan(fallback)?.presentation.productId === purchase.productId
    ) {
      return fallback;
    }
    return null;
  }

  async function refreshAfterBackendAcceptance(): Promise<void> {
    await api.refreshEntitlements(options.authToken);
  }

  async function completeVerifiedPurchase(
    purchase: PurchaseAndroid,
    purchaseToken: string,
    operation: 'purchase' | 'restore',
    plan: GooglePlayAnyPlanKey | null,
  ): Promise<'completed' | 'completion_pending' | 'refresh_failed'> {
    verifiedTokens.add(purchaseToken);
    pendingCompletions.set(purchaseToken, { operation, plan, purchase });
    try {
      await refreshAfterBackendAcceptance();
    } catch {
      return 'refresh_failed';
    }
    if (disposed) {
      return 'completion_pending';
    }
    try {
      await gateway.finishSubscription(purchase);
      pendingCompletions.delete(purchaseToken);
      return 'completed';
    } catch {
      return 'completion_pending';
    }
  }

  async function handlePurchase(purchase: Purchase): Promise<void> {
    if (disposed || !isAndroidPurchase(purchase)) {
      return;
    }
    if (state.status === 'connecting' || state.status === 'loading_products') {
      queuedPurchaseEvents.push(purchase);
      return;
    }
    const plan = planForPurchase(purchase, activePlan);
    if (!plan || activeOperation === 'restore') {
      if (activeOperation === 'purchase') {
        activeOperation = null;
        activePlan = null;
        transition({
          status: 'failed',
          operation: 'purchase',
          code: 'purchase_invalid',
          retryable: false,
        });
      }
      return;
    }
    if (purchase.purchaseState === 'pending') {
      if (activeOperation === 'purchase') {
        activePlan = plan;
      } else if (state.status !== 'ready') {
        return;
      }
      if (state.status !== 'pending') {
        transition({ status: 'pending', plan });
      }
      return;
    }
    if (purchase.purchaseState !== 'purchased') {
      if (activeOperation !== 'purchase') {
        return;
      }
      activeOperation = null;
      activePlan = null;
      transition({
        status: 'failed',
        operation: 'purchase',
        code: 'purchase_invalid',
        retryable: false,
      });
      return;
    }

    const purchaseToken = purchase.purchaseToken;
    if (!purchaseToken?.trim()) {
      activeOperation = null;
      activePlan = null;
      transition({
        status: 'failed',
        operation: 'purchase',
        code: 'purchase_invalid',
        retryable: false,
      });
      return;
    }
    if (state.status === 'verifying') {
      return;
    }
    if (
      processingTokens.has(purchaseToken) ||
      verifiedTokens.has(purchaseToken)
    ) {
      return;
    }

    processingTokens.add(purchaseToken);
    activeOperation = 'purchase';
    activePlan = plan;
    transition({ status: 'verifying', plan });
    let verification: GooglePlayVerificationResponse;
    try {
      verification = await api.verify(options.authToken, purchaseToken);
    } catch {
      processingTokens.delete(purchaseToken);
      activeOperation = null;
      activePlan = null;
      transition({
        status: 'failed',
        operation: 'purchase',
        code: 'verification_failed',
        retryable: true,
      });
      return;
    }
    if (disposed) {
      processingTokens.delete(purchaseToken);
      return;
    }

    const completion = await completeVerifiedPurchase(
      purchase,
      purchaseToken,
      'purchase',
      plan,
    );
    processingTokens.delete(purchaseToken);
    if (disposed) {
      return;
    }
    activeOperation = null;
    activePlan = null;
    if (completion === 'refresh_failed') {
      transition({
        status: 'failed',
        operation: 'purchase',
        code: 'entitlement_refresh_failed',
        retryable: true,
      });
      return;
    }
    if (completion === 'completion_pending') {
      transition({
        status: 'failed',
        operation: 'completion',
        code: 'transaction_completion_failed',
        retryable: true,
      });
      return;
    }
    if (verification.entitlements.plan !== 'premium') {
      transition({
        status: 'failed',
        operation: 'purchase',
        code: 'verification_not_entitled',
        retryable: false,
      });
      return;
    }
    transition({ status: 'succeeded', operation: 'purchase', plan });
  }

  function handlePurchaseError(error: GooglePlayPurchaseError): void {
    if (disposed || activeOperation !== 'purchase') {
      return;
    }
    if (state.status === 'verifying') {
      return;
    }
    if (error.kind === 'pending' && activePlan) {
      if (state.status !== 'pending') {
        transition({ status: 'pending', plan: activePlan });
      }
      return;
    }
    if (error.kind === 'canceled') {
      activeOperation = null;
      activePlan = null;
      transition(readyState('canceled'));
      return;
    }
    activeOperation = null;
    activePlan = null;
    transition({
      status: 'failed',
      operation: 'purchase',
      code: 'purchase_failed',
      retryable: true,
    });
  }

  async function ensureListeners(): Promise<void> {
    if (listenerCleanup) {
      return;
    }
    listenerCleanup = await gateway.registerPurchaseListeners(
      (purchase) => {
        void handlePurchase(purchase);
      },
      handlePurchaseError,
    );
  }

  async function disconnectNative(): Promise<void> {
    listenerCleanup?.();
    listenerCleanup = null;
    if (nativeConnected) {
      await gateway.disconnect();
      nativeConnected = false;
    }
  }

  async function initialize(): Promise<void> {
    ensureUsable();
    ensureNoActiveOperation();
    if (initializationPromise) {
      return initializationPromise;
    }
    if (!gateway.isAndroid()) {
      if (state.status !== 'unsupported') {
        transition({ status: 'unsupported', reason: 'non_android' });
      }
      return;
    }

    initializationPromise = (async () => {
      transition({ status: 'connecting' });
      let status: GooglePlayBillingStatus;
      try {
        status = await api.getStatus(options.authToken);
      } catch {
        transition({
          status: 'failed',
          operation: 'initialize',
          code: 'status_failed',
          retryable: true,
        });
        return;
      }
      if (!status.enabled) {
        await disconnectNative();
        transition({ status: 'disabled' });
        return;
      }

      const availability = await gateway.getAvailability();
      if (!availability.available) {
        transition({
          status: 'unsupported',
          reason: availability.reason,
        });
        return;
      }

      try {
        if (!nativeConnected) {
          await gateway.connect();
          nativeConnected = true;
        }
      } catch (error) {
        if (error instanceof GooglePlayNativeBillingUnavailableError) {
          transition({
            status: 'unsupported',
            reason: 'native_module_unavailable',
          });
          return;
        }
        transition({
          status: 'failed',
          operation: 'initialize',
          code: 'status_failed',
          retryable: true,
        });
        return;
      }

      transition({ status: 'loading_products' });
      const productIds = [...new Set([status.monthly.productId, status.annual.productId])];
      let products: ProductSubscription[];
      try {
        products = await gateway.querySubscriptionProducts(productIds);
      } catch {
        transition({
          status: 'failed',
          operation: 'initialize',
          code: 'product_configuration_unavailable',
          retryable: true,
        });
        return;
      }

      const monthly = matchPlan(
        'monthly',
        status.monthly,
        products,
      );
      const annual = matchPlan(
        'annual',
        status.annual,
        products,
      );
      if (!monthly || !annual) {
        transition({
          status: 'failed',
          operation: 'initialize',
          code: 'product_configuration_unavailable',
          retryable: false,
        });
        return;
      }

      config = status;
      plans = { monthly, annual };
      tierPlans = {};
      const tierConfigs: Array<[GooglePlayTierPlanKey, GooglePlayPlanConfig]> =
        [];
      for (const tier of ['member_pro', 'organizer_pro'] as const) {
        for (const interval of ['monthly', 'annual'] as const) {
          const planConfig = status.tiers?.[tier]?.[interval];
          if (planConfig) {
            tierConfigs.push([tierPlanKey(tier, interval), planConfig]);
          }
        }
      }
      if (tierConfigs.length > 0) {
        // A missing or draft tier product only hides that plan; it must never
        // break the existing plans above.
        try {
          const tierProducts = await gateway.querySubscriptionProducts([
            ...new Set(
              tierConfigs.map(([, planConfig]) => planConfig.productId),
            ),
          ]);
          for (const [key, planConfig] of tierConfigs) {
            const matched = matchPlan(
              key,
              planConfig,
              tierProducts,
            );
            if (matched) {
              tierPlans[key] = matched;
            }
          }
        } catch {
          tierPlans = {};
        }
      }
      try {
        await ensureListeners();
      } catch {
        transition({
          status: 'failed',
          operation: 'initialize',
          code: 'product_configuration_unavailable',
          retryable: true,
        });
        return;
      }
      transition(readyState());
      const queued = queuedPurchaseEvents.splice(0);
      queued.forEach((purchase) => {
        void handlePurchase(purchase);
      });
    })();

    try {
      await initializationPromise;
    } finally {
      initializationPromise = null;
    }
  }

  /**
   * Finds the paid tier plan the person has now in Google Play, to decide how a
   * change is requested. Returns null when there is none (a fresh purchase).
   */
  async function findCurrentTierPurchase(): Promise<{
    purchase: PurchaseAndroid & { purchaseToken: string };
    tier: PaidTier;
    interval: BillingInterval;
  } | null> {
    const owned = await gateway.getAvailableSubscriptionPurchases();
    for (const candidate of owned) {
      if (
        candidate.purchaseState !== 'purchased' ||
        candidate.isSuspendedAndroid === true ||
        !candidate.purchaseToken?.trim()
      ) {
        continue;
      }
      for (const key of TIER_PLAN_KEYS) {
        const plan = tierPlans[key]?.presentation;
        if (
          plan &&
          plan.productId === candidate.productId &&
          (!candidate.currentPlanId ||
            candidate.currentPlanId === plan.basePlanId)
        ) {
          return {
            purchase: candidate as PurchaseAndroid & { purchaseToken: string },
            ...splitTierPlanKey(key),
          };
        }
      }
    }
    return null;
  }

  async function purchase(planKey: GooglePlayAnyPlanKey): Promise<void> {
    ensureUsable();
    ensureNoActiveOperation();
    if (state.status !== 'ready' || !plans || !config) {
      throw new GooglePlayBillingOperationError('google_play_invalid_state');
    }
    const plan = internalPlan(planKey);
    if (!plan) {
      throw new GooglePlayBillingOperationError('google_play_invalid_state');
    }

    let replacement:
      | {
          oldProductId: string;
          oldPurchaseToken: string;
          replacementMode: 'charge-prorated-price' | 'deferred';
        }
      | undefined;
    if (planKey !== 'monthly' && planKey !== 'annual') {
      // Moving between paid plans follows our own rules (D7), not a guess.
      activeOperation = 'purchase';
      let current: Awaited<ReturnType<typeof findCurrentTierPurchase>>;
      try {
        current = await findCurrentTierPurchase();
      } catch {
        activeOperation = null;
        throw new GooglePlayBillingOperationError('google_play_invalid_state');
      }
      activeOperation = null;
      const request = planChangeRequest(
        current ? { tier: current.tier, interval: current.interval } : null,
        splitTierPlanKey(planKey),
      );
      if (request.kind === 'not_supported_yet') {
        throw new GooglePlayBillingOperationError(
          'google_play_plan_change_unavailable',
        );
      }
      if (request.kind === 'replace' && current) {
        replacement = {
          oldProductId: current.purchase.productId,
          oldPurchaseToken: current.purchase.purchaseToken,
          replacementMode: request.replacementMode,
        };
      }
    }

    activeOperation = 'purchase';
    activePlan = planKey;
    transition({ status: 'purchasing', plan: planKey });
    try {
      if (replacement) {
        await gateway.requestSubscription(
          plan.presentation.productId,
          plan.offerToken,
          config.obfuscatedAccountId,
          replacement,
        );
      } else {
        await gateway.requestSubscription(
          plan.presentation.productId,
          plan.offerToken,
          config.obfuscatedAccountId,
        );
      }
    } catch (error) {
      const kind =
        error &&
        typeof error === 'object' &&
        'kind' in error &&
        (error.kind === 'canceled' || error.kind === 'pending')
          ? error.kind
          : 'failed';
      handlePurchaseError({
        kind,
        message: 'Google Play purchase failed.',
      });
    }
  }

  function isEligibleRestorePurchase(
    purchase: PurchaseAndroid,
  ): purchase is PurchaseAndroid & { purchaseToken: string } {
    const configuredProductIds = plans
      ? new Set(
          allPlanKeys().flatMap((key) => {
            const plan = internalPlan(key);
            return plan ? [plan.presentation.productId] : [];
          }),
        )
      : new Set<string>();
    return (
      purchase.purchaseState === 'purchased' &&
      purchase.isSuspendedAndroid !== true &&
      Boolean(purchase.purchaseToken?.trim()) &&
      configuredProductIds.has(purchase.productId) &&
      (!purchase.currentPlanId ||
        planForPurchase(purchase) !== null)
    );
  }

  /**
   * Leaves a purchase that Google Play itself reported as failed, so the user
   * can try again. Failures after payment (verification, entitlement) are not
   * cleared here: those go through restore so nobody pays twice.
   */
  function dismissFailure(): void {
    ensureUsable();
    if (
      activeOperation !== null ||
      state.status !== 'failed' ||
      state.operation !== 'purchase' ||
      state.code !== 'purchase_failed' ||
      !plans
    ) {
      return;
    }
    transition(readyState());
  }

  async function restore(): Promise<void> {
    ensureUsable();
    ensureNoActiveOperation();
    if (
      !plans ||
      !config ||
      !['ready', 'pending', 'succeeded', 'failed'].includes(state.status)
    ) {
      throw new GooglePlayBillingOperationError('google_play_invalid_state');
    }

    activeOperation = 'restore';
    transition({ status: 'restoring' });
    let purchases: PurchaseAndroid[];
    try {
      purchases = await gateway.getAvailableSubscriptionPurchases();
    } catch {
      activeOperation = null;
      transition({
        status: 'failed',
        operation: 'restore',
        code: 'restore_failed',
        retryable: true,
      });
      return;
    }
    if (disposed) {
      return;
    }

    const summary = emptyRestoreSummary(purchases.length);
    const seenTokens = new Set<string>();
    for (const purchase of purchases) {
      if (!isEligibleRestorePurchase(purchase)) {
        continue;
      }
      summary.eligible += 1;
      const purchaseToken = purchase.purchaseToken;
      if (seenTokens.has(purchaseToken)) {
        summary.duplicates += 1;
        continue;
      }
      seenTokens.add(purchaseToken);
      if (verifiedTokens.has(purchaseToken)) {
        summary.duplicates += 1;
        const pending = pendingCompletions.get(purchaseToken);
        if (pending) {
          try {
            await gateway.finishSubscription(pending.purchase);
            pendingCompletions.delete(purchaseToken);
          } catch {
            summary.completionPending += 1;
          }
        }
        continue;
      }

      try {
        const response = await api.restore(options.authToken, purchaseToken);
        verifiedTokens.add(purchaseToken);
        pendingCompletions.set(purchaseToken, {
          operation: 'restore',
          plan: planForPurchase(purchase),
          purchase,
        });
        summary.restored += 1;
        if (response.status === 'expired') {
          summary.expired += 1;
        }
        try {
          await gateway.finishSubscription(purchase);
          pendingCompletions.delete(purchaseToken);
        } catch {
          summary.completionPending += 1;
        }
      } catch {
        summary.failed += 1;
      }
      if (disposed) {
        return;
      }
    }

    try {
      await refreshAfterBackendAcceptance();
    } catch {
      activeOperation = null;
      transition({
        status: 'failed',
        operation: 'restore',
        code: 'entitlement_refresh_failed',
        retryable: true,
        restore: summary,
      });
      return;
    }
    if (disposed) {
      return;
    }

    activeOperation = null;
    if (summary.failed > 0 || summary.completionPending > 0) {
      transition({
        status: 'failed',
        operation: 'restore',
        code:
          summary.failed > 0
            ? 'partial_restore_failed'
            : 'transaction_completion_failed',
        retryable: true,
        restore: summary,
      });
      return;
    }
    transition({ status: 'succeeded', operation: 'restore', restore: summary });
  }

  async function retryCompletion(): Promise<void> {
    ensureUsable();
    ensureNoActiveOperation();
    if (pendingCompletions.size === 0) {
      throw new GooglePlayBillingOperationError('google_play_invalid_state');
    }

    const entries = [...pendingCompletions.entries()];
    const purchaseCompletion = entries.find(
      ([, pending]) => pending.operation === 'purchase',
    )?.[1];
    activeOperation = 'completion';
    if (purchaseCompletion?.plan) {
      transition({ status: 'verifying', plan: purchaseCompletion.plan });
    } else {
      transition({ status: 'restoring' });
    }

    let failed = 0;
    for (const [purchaseToken, pending] of entries) {
      try {
        await gateway.finishSubscription(pending.purchase);
        pendingCompletions.delete(purchaseToken);
      } catch {
        failed += 1;
      }
    }
    try {
      await refreshAfterBackendAcceptance();
    } catch {
      activeOperation = null;
      transition({
        status: 'failed',
        operation: 'completion',
        code: 'entitlement_refresh_failed',
        retryable: true,
      });
      return;
    }

    activeOperation = null;
    if (failed > 0) {
      transition({
        status: 'failed',
        operation: 'completion',
        code: 'transaction_completion_failed',
        retryable: true,
      });
      return;
    }
    transition({ status: 'succeeded', operation: 'completion' });
  }

  async function dispose(): Promise<void> {
    if (disposed) {
      return;
    }
    disposed = true;
    listenerCleanup?.();
    listenerCleanup = null;
    processingTokens.clear();
    verifiedTokens.clear();
    pendingCompletions.clear();
    queuedPurchaseEvents.splice(0);
    activeOperation = null;
    activePlan = null;
    await disconnectNative();
    if (state.status !== 'idle') {
      transition({ status: 'idle' });
    }
    listeners.clear();
  }

  return {
    getState: () => state,
    subscribe(listener: (next: GooglePlayBillingState) => void) {
      ensureUsable();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize,
    purchase,
    dismissFailure,
    restore,
    reconcile: restore,
    retryCompletion,
    dispose,
  };
}
