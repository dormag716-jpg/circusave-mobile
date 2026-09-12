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
} from './api';
import {
  googlePlayBilling,
  GooglePlayNativeBillingUnavailableError,
  type GooglePlayBillingGateway,
  type GooglePlayPurchaseError,
} from './googlePlayBilling';

export type GooglePlayPlanKey = 'monthly' | 'annual';

export type GooglePlayPricingPhase = {
  billingCycleCount: number;
  billingPeriod: string;
  displayPrice: string;
  priceCurrencyCode: string;
  recurrenceMode: number;
};

export type GooglePlayPlan = {
  key: GooglePlayPlanKey;
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
      outcome?: 'canceled';
    }
  | { status: 'purchasing'; plan: GooglePlayPlanKey }
  | { status: 'pending'; plan: GooglePlayPlanKey }
  | { status: 'verifying'; plan: GooglePlayPlanKey }
  | { status: 'restoring' }
  | {
      status: 'succeeded';
      operation: 'purchase' | 'restore' | 'completion';
      plan?: GooglePlayPlanKey;
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
  plan: GooglePlayPlanKey | null;
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
    | 'google_play_disposed';

  constructor(
    code:
      | 'google_play_invalid_state'
      | 'google_play_operation_in_progress'
      | 'google_play_disposed',
  ) {
    super(
      code === 'google_play_operation_in_progress'
        ? 'Another Google Play billing operation is already in progress.'
        : code === 'google_play_disposed'
          ? 'Google Play billing has been disposed.'
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
  key: GooglePlayPlanKey,
  config: GooglePlayPlanConfig,
  products: ProductSubscription[],
  trialEligible: boolean,
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
    if (trialEligible) {
      const expectedOfferId = config.offerId ?? config.basePlanId;
      return (
        offer.id === expectedOfferId &&
        Boolean(offer.offerTokenAndroid?.trim())
      );
    }
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
      offerId: trialEligible ? config.offerId : null,
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
  let listenerCleanup: (() => void) | null = null;
  let initializationPromise: Promise<void> | null = null;
  let nativeConnected = false;
  let activeOperation: 'purchase' | 'restore' | 'completion' | null = null;
  let activePlan: GooglePlayPlanKey | null = null;
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

  function planForPurchase(
    purchase: PurchaseAndroid,
    fallback: GooglePlayPlanKey | null = null,
  ): GooglePlayPlanKey | null {
    if (!plans) {
      return null;
    }
    const candidates = (['monthly', 'annual'] as const).filter((key) => {
      const plan = plans?.[key].presentation;
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
      plans[fallback].presentation.productId === purchase.productId
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
    plan: GooglePlayPlanKey | null,
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
      transition({
        status: 'ready',
        plans: publicPlans(),
        outcome: 'canceled',
      });
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
        status.trialEligible,
      );
      const annual = matchPlan(
        'annual',
        status.annual,
        products,
        status.trialEligible,
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
      transition({ status: 'ready', plans: publicPlans() });
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

  async function purchase(planKey: GooglePlayPlanKey): Promise<void> {
    ensureUsable();
    ensureNoActiveOperation();
    if (state.status !== 'ready' || !plans || !config) {
      throw new GooglePlayBillingOperationError('google_play_invalid_state');
    }
    const plan = plans[planKey];
    activeOperation = 'purchase';
    activePlan = planKey;
    transition({ status: 'purchasing', plan: planKey });
    try {
      await gateway.requestSubscription(
        plan.presentation.productId,
        plan.offerToken,
        config.obfuscatedAccountId,
      );
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
      ? new Set([
          plans.monthly.presentation.productId,
          plans.annual.presentation.productId,
        ])
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
    restore,
    reconcile: restore,
    retryCompletion,
    dispose,
  };
}
