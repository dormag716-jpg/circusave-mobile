import type { ProductSubscriptionIOS as ProductSubscription, Purchase } from 'expo-iap';

import {
  getAppleBillingStatus,
  restoreApplePurchase,
  verifyApplePurchase,
  type AppleBillingStatus,
  type AppleVerificationResponse,
} from '../api/billing';
import { ApiError } from '../platform/networkErrors';
import {
  ApplePurchaseRequestError,
  type AppleBillingGateway,
  type ApplePurchaseErrorKind,
} from './appleBilling';
import type { Entitlements } from './entitlements';
import { isPremiumPlan } from './entitlements';
import type {
  GooglePlayPlan,
  GooglePlayTierPlanKey,
} from './googlePlayBillingMachine';

export type AppleBillingFailureCode =
  | 'status_failed'
  | 'product_configuration_unavailable'
  | 'purchase_failed'
  | 'verification_failed'
  | 'verification_not_entitled'
  | 'transaction_completion_failed'
  | 'restore_failed';

export type AppleBillingState =
  | { status: 'idle' }
  | { status: 'unsupported' }
  | { status: 'disabled' }
  | { status: 'loading' }
  | {
      status: 'ready';
      plans: Partial<Record<GooglePlayTierPlanKey, GooglePlayPlan>>;
      outcome?: 'canceled';
    }
  | { status: 'purchasing'; plan: GooglePlayTierPlanKey }
  | { status: 'pending'; plan: GooglePlayTierPlanKey }
  | { status: 'verifying' }
  | { status: 'restoring' }
  | { status: 'succeeded'; operation: 'purchase' | 'restore'; restored?: number }
  | {
      status: 'failed';
      operation: 'initialize' | 'purchase' | 'restore';
      code: AppleBillingFailureCode;
      retryable: boolean;
    };

export type AppleBillingApi = {
  getStatus: (token: string) => Promise<AppleBillingStatus>;
  verify: (token: string, signedTransaction: string) => Promise<AppleVerificationResponse>;
  restore: (token: string, signedTransaction: string) => Promise<AppleVerificationResponse>;
};

const defaultApi: AppleBillingApi = {
  getStatus: getAppleBillingStatus,
  verify: verifyApplePurchase,
  restore: restoreApplePurchase,
};

type PlanConfig = { key: GooglePlayTierPlanKey; productId: string };

function toIsoPeriod(product: ProductSubscription): string | null {
  const unit = { day: 'D', week: 'W', month: 'M', year: 'Y' }[
    String(product.subscriptionPeriodUnitIOS ?? '') as 'day' | 'week' | 'month' | 'year'
  ];
  const count = Number.parseInt(String(product.subscriptionPeriodNumberIOS ?? '1'), 10);
  return unit && count > 0 ? `P${count}${unit}` : null;
}

/** True when the product carries an introductory or free-trial offer. */
export function hasIntroductoryOffer(product: ProductSubscription): boolean {
  const mode = String(product.introductoryPricePaymentModeIOS ?? 'empty');
  return (
    Boolean(product.introductoryPriceIOS) ||
    (mode !== 'empty' && mode !== '') ||
    (product.subscriptionOffers ?? []).some(
      (offer) =>
        String(offer.type ?? '') === 'introductory' ||
        String(offer.paymentMode ?? '') === 'free-trial',
    )
  );
}

function planFor(config: PlanConfig, products: ProductSubscription[]): GooglePlayPlan | null {
  const product = products.find((candidate) => candidate.id === config.productId);
  // A product with an introductory offer would hand a trial to new subscribers
  // automatically, so it is never shown as purchasable.
  if (!product || hasIntroductoryOffer(product) || !product.displayPrice) {
    return null;
  }
  return {
    key: config.key,
    productId: config.productId,
    basePlanId: config.key,
    offerId: null,
    title: product.displayNameIOS || product.title,
    description: product.description,
    displayPrice: product.displayPrice,
    currency: product.currency,
    billingPeriod: toIsoPeriod(product),
    trial: null,
    pricingPhases: [],
  };
}

export function createAppleBillingMachine(options: {
  authToken: string;
  gateway: AppleBillingGateway;
  api?: AppleBillingApi;
  refreshEntitlements?: () => Promise<Entitlements>;
}) {
  const { authToken, gateway } = options;
  const api = options.api ?? defaultApi;
  const refresh = options.refreshEntitlements;

  let state: AppleBillingState = { status: 'idle' };
  const listeners = new Set<(next: AppleBillingState) => void>();
  let status: Extract<AppleBillingStatus, { enabled: true }> | null = null;
  let productToKey = new Map<string, GooglePlayTierPlanKey>();
  let plans: Partial<Record<GooglePlayTierPlanKey, GooglePlayPlan>> = {};
  let initializing: Promise<void> | null = null;
  let busy = false;
  const handled = new Set<string>();
  let unregister: (() => void) | null = null;

  function transition(next: AppleBillingState) {
    state = next;
    listeners.forEach((listener) => listener(next));
  }
  const ready = (): AppleBillingState => ({ status: 'ready', plans });

  async function applyVerification(response: AppleVerificationResponse): Promise<boolean> {
    // Access follows the backend answer only.
    return isPremiumPlan(response.entitlements) && Boolean(response.tier);
  }

  async function handlePurchase(purchase: Purchase, restored: boolean): Promise<boolean> {
    const jws = purchase.purchaseToken;
    if (!status || !productToKey.has(purchase.productId) || !jws) return false;
    const response = await (restored ? api.restore : api.verify)(authToken, jws);
    if (!(await applyVerification(response))) return false;
    try {
      await gateway.finishTransaction(purchase);
    } catch {
      // Access is already granted by the backend; finishing can retry later.
    }
    if (refresh) await refresh();
    return true;
  }

  async function onPurchaseUpdate(purchase: Purchase) {
    if (!productToKey.has(purchase.productId)) return;
    const id = String(purchase.id);
    if (handled.has(id)) return;
    if (purchase.purchaseState === 'pending') {
      transition({ status: 'pending', plan: productToKey.get(purchase.productId)! });
      return;
    }
    handled.add(id);
    transition({ status: 'verifying' });
    try {
      const ok = await handlePurchase(purchase, false);
      transition(
        ok
          ? { status: 'succeeded', operation: 'purchase' }
          : {
              status: 'failed',
              operation: 'purchase',
              code: 'verification_not_entitled',
              retryable: true,
            },
      );
    } catch {
      handled.delete(id);
      transition({
        status: 'failed',
        operation: 'purchase',
        code: 'verification_failed',
        retryable: true,
      });
    }
  }

  function onPurchaseError(kind: ApplePurchaseErrorKind) {
    if (kind === 'canceled') transition({ status: 'ready', plans, outcome: 'canceled' });
    else if (kind === 'pending') return;
    else
      transition({
        status: 'failed',
        operation: 'purchase',
        code: 'purchase_failed',
        retryable: true,
      });
    busy = false;
  }

  async function runInitialize(): Promise<void> {
    transition({ status: 'loading' });
    if (!(await gateway.isAvailable())) {
      transition({ status: 'unsupported' });
      return;
    }
    let loaded: AppleBillingStatus;
    try {
      loaded = await api.getStatus(authToken);
    } catch (error) {
      // A backend without the Apple endpoints yet answers 404/501: that means
      // Apple billing is not switched on, not that something broke.
      if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
        transition({ status: 'disabled' });
        return;
      }
      transition({ status: 'failed', operation: 'initialize', code: 'status_failed', retryable: true });
      return;
    }
    if (!loaded.enabled) {
      transition({ status: 'disabled' });
      return;
    }
    status = loaded;
    const configs: PlanConfig[] = [];
    for (const tier of ['member_pro', 'organizer_pro'] as const) {
      for (const interval of ['monthly', 'annual'] as const) {
        const productId = loaded.tiers[tier]?.[interval]?.productId;
        if (productId) configs.push({ key: `${tier}_${interval}`, productId });
      }
    }
    try {
      await gateway.connect();
      const products = await gateway.querySubscriptionProducts([
        ...new Set(configs.map((config) => config.productId)),
      ]);
      plans = {};
      productToKey = new Map();
      for (const config of configs) {
        const plan = planFor(config, products);
        if (plan) {
          plans[config.key] = plan;
          productToKey.set(config.productId, config.key);
        }
      }
      unregister?.();
      unregister = await gateway.registerPurchaseListeners(
        (purchase) => void onPurchaseUpdate(purchase),
        onPurchaseError,
      );
    } catch {
      transition({
        status: 'failed',
        operation: 'initialize',
        code: 'product_configuration_unavailable',
        retryable: true,
      });
      return;
    }
    if (Object.keys(plans).length === 0) {
      transition({
        status: 'failed',
        operation: 'initialize',
        code: 'product_configuration_unavailable',
        retryable: false,
      });
      return;
    }
    transition(ready());
  }

  return {
    getState: () => state,
    subscribe(listener: (next: AppleBillingState) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize(): Promise<void> {
      if (!initializing) {
        initializing = runInitialize().finally(() => {
          initializing = null;
        });
      }
      return initializing;
    },
    async purchase(key: GooglePlayTierPlanKey): Promise<void> {
      const plan = plans[key];
      if (state.status !== 'ready' || !plan || !status || busy) return;
      busy = true;
      transition({ status: 'purchasing', plan: key });
      try {
        await gateway.requestSubscription(plan.productId, status.appAccountToken);
      } catch (error) {
        const kind = error instanceof ApplePurchaseRequestError ? error.kind : 'failed';
        onPurchaseError(kind);
      } finally {
        busy = false;
      }
    },
    async restore(): Promise<void> {
      if (!status || busy || (state.status !== 'ready' && state.status !== 'succeeded' && state.status !== 'failed')) {
        return;
      }
      busy = true;
      transition({ status: 'restoring' });
      try {
        const purchases = await gateway.getAvailableSubscriptionPurchases();
        let restored = 0;
        for (const purchase of purchases) {
          if (!productToKey.has(purchase.productId)) continue;
          try {
            if (await handlePurchase(purchase, true)) restored += 1;
          } catch {
            // Try the next transaction; the backend decides what counts.
          }
        }
        if (refresh) await refresh();
        transition({ status: 'succeeded', operation: 'restore', restored });
      } catch {
        transition({ status: 'failed', operation: 'restore', code: 'restore_failed', retryable: true });
      } finally {
        busy = false;
      }
    },
    async dispose(): Promise<void> {
      unregister?.();
      unregister = null;
      listeners.clear();
      await gateway.disconnect();
    },
    /** Return to the plan list after a result has been shown. */
    dismiss(): void {
      if (state.status === 'succeeded' || state.status === 'failed') transition(ready());
    },
  };
}

export type AppleBillingMachine = ReturnType<typeof createAppleBillingMachine>;
