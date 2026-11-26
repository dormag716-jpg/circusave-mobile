import { Platform } from 'react-native';
import type {
  ExpoPurchaseError,
  ProductOrSubscription,
  ProductSubscriptionIOS,
  Purchase,
} from 'expo-iap';

type ExpoIapModule = Pick<
  typeof import('expo-iap'),
  | 'endConnection'
  | 'fetchProducts'
  | 'finishTransaction'
  | 'getAvailablePurchases'
  | 'initConnection'
  | 'purchaseErrorListener'
  | 'purchaseUpdatedListener'
  | 'requestPurchase'
>;

export type ApplePurchaseErrorKind = 'canceled' | 'pending' | 'failed';

export class AppleNativeBillingUnavailableError extends Error {
  readonly code = 'apple_native_billing_unavailable';
  constructor() {
    super('Apple billing is unavailable in this app build.');
    this.name = 'AppleNativeBillingUnavailableError';
  }
}

export class ApplePurchaseRequestError extends Error {
  readonly kind: ApplePurchaseErrorKind;
  constructor(kind: ApplePurchaseErrorKind) {
    super('Apple purchase failed.');
    this.name = 'ApplePurchaseRequestError';
    this.kind = kind;
  }
}

function classifyPurchaseError(error: unknown): ApplePurchaseErrorKind {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (code === 'user-cancelled') return 'canceled';
  if (code === 'pending' || code === 'deferred-payment') return 'pending';
  return 'failed';
}

function isSubscriptionProduct(
  product: ProductOrSubscription,
): product is ProductSubscriptionIOS {
  return product.type === 'subs' && product.platform === 'ios';
}

type AppleBillingGatewayOptions = {
  getPlatform?: () => string;
  loadModule?: () => Promise<ExpoIapModule>;
};

/** Thin wrapper over expo-iap (StoreKit 2). It holds no business rules. */
export function createAppleBillingGateway(options: AppleBillingGatewayOptions = {}) {
  const getPlatform = options.getPlatform ?? (() => Platform.OS);
  const loadModule =
    options.loadModule ??
    (async () => {
      const [module, core] = await Promise.all([
        import('expo-iap'),
        import('expo-modules-core'),
      ]);
      if (!core.requireOptionalNativeModule('ExpoIap')) {
        throw new AppleNativeBillingUnavailableError();
      }
      return module as ExpoIapModule;
    });

  let native: ExpoIapModule | null = null;
  let connected = false;
  const cleanups = new Set<() => void>();

  async function requireNative(): Promise<ExpoIapModule> {
    if (getPlatform() !== 'ios') throw new AppleNativeBillingUnavailableError();
    if (native) return native;
    try {
      native = await loadModule();
      return native;
    } catch {
      throw new AppleNativeBillingUnavailableError();
    }
  }

  async function isAvailable(): Promise<boolean> {
    try {
      await requireNative();
      return true;
    } catch {
      return false;
    }
  }

  async function connect(): Promise<void> {
    if (connected) return;
    const module = await requireNative();
    let ok: boolean;
    try {
      ok = await module.initConnection();
    } catch {
      throw new AppleNativeBillingUnavailableError();
    }
    if (!ok) throw new AppleNativeBillingUnavailableError();
    connected = true;
  }

  async function disconnect(): Promise<void> {
    cleanups.forEach((cleanup) => cleanup());
    cleanups.clear();
    if (connected && native) {
      connected = false;
      await native.endConnection();
    }
  }

  async function querySubscriptionProducts(
    productIds: string[],
  ): Promise<ProductSubscriptionIOS[]> {
    const module = await requireNative();
    const products = await module.fetchProducts({ skus: [...productIds], type: 'subs' });
    return (products ?? []).filter(isSubscriptionProduct);
  }

  async function registerPurchaseListeners(
    onPurchase: (purchase: Purchase) => void,
    onError: (kind: ApplePurchaseErrorKind) => void,
  ): Promise<() => void> {
    const module = await requireNative();
    const subscriptions = [
      module.purchaseUpdatedListener(onPurchase),
      module.purchaseErrorListener((error: ExpoPurchaseError) =>
        onError(classifyPurchaseError(error)),
      ),
    ];
    let removed = false;
    const cleanup = () => {
      if (removed) return;
      removed = true;
      subscriptions.forEach((subscription) => subscription.remove());
      cleanups.delete(cleanup);
    };
    cleanups.add(cleanup);
    return cleanup;
  }

  /** Only the plain product is requested: no promotional or introductory offer. */
  async function requestSubscription(
    productId: string,
    appAccountToken: string,
  ): Promise<void> {
    const module = await requireNative();
    try {
      await module.requestPurchase({
        request: { apple: { sku: productId, appAccountToken } },
        type: 'subs',
      });
    } catch (error) {
      throw new ApplePurchaseRequestError(classifyPurchaseError(error));
    }
  }

  async function getAvailableSubscriptionPurchases(): Promise<Purchase[]> {
    const module = await requireNative();
    const purchases = await module.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    return purchases.filter((purchase) => purchase.store === 'apple');
  }

  async function finishTransaction(purchase: Purchase): Promise<void> {
    const module = await requireNative();
    await module.finishTransaction({ purchase, isConsumable: false });
  }

  return {
    isAvailable,
    connect,
    disconnect,
    querySubscriptionProducts,
    registerPurchaseListeners,
    requestSubscription,
    getAvailableSubscriptionPurchases,
    finishTransaction,
  };
}

export type AppleBillingGateway = ReturnType<typeof createAppleBillingGateway>;
