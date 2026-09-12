import { Platform } from 'react-native';
import type {
  ExpoPurchaseError,
  ProductOrSubscription,
  ProductSubscription,
  Purchase,
} from 'expo-iap';

type ListenerSubscription = {
  remove(): void;
};

type ExpoIapModule = Pick<
  typeof import('expo-iap'),
  | 'endConnection'
  | 'fetchProducts'
  | 'initConnection'
  | 'purchaseErrorListener'
  | 'purchaseUpdatedListener'
>;

type GooglePlayBillingGatewayOptions = {
  getPlatform?: () => string;
  loadModule?: () => Promise<ExpoIapModule>;
};

export type GooglePlayBillingAvailability =
  | { available: true }
  | { available: false; reason: 'non_android' | 'native_module_unavailable' };

export type GooglePlayPurchaseError = {
  message: 'Google Play purchase failed.';
};

export class GooglePlayNativeBillingUnavailableError extends Error {
  readonly code = 'google_play_native_billing_unavailable';

  constructor() {
    super('Google Play billing is unavailable in this app build.');
    this.name = 'GooglePlayNativeBillingUnavailableError';
  }
}

export class GooglePlayBillingNotConnectedError extends Error {
  readonly code = 'google_play_billing_not_connected';

  constructor() {
    super('Google Play billing is not connected.');
    this.name = 'GooglePlayBillingNotConnectedError';
  }
}

export type GooglePlayBillingGateway = ReturnType<
  typeof createGooglePlayBillingGateway
>;

function isSubscriptionProduct(
  product: ProductOrSubscription,
): product is ProductSubscription {
  return product.type === 'subs' && 'subscriptionOffers' in product;
}

export function createGooglePlayBillingGateway(
  options: GooglePlayBillingGatewayOptions = {},
) {
  const getPlatform = options.getPlatform ?? (() => Platform.OS);
  const loadModule =
    options.loadModule ??
    (async () => {
      const [module, expoModulesCore] = await Promise.all([
        import('expo-iap'),
        import('expo-modules-core'),
      ]);
      if (!expoModulesCore.requireOptionalNativeModule('ExpoIap')) {
        throw new GooglePlayNativeBillingUnavailableError();
      }
      return module as ExpoIapModule;
    });

  let nativeModule: ExpoIapModule | null = null;
  let connectionPromise: Promise<void> | null = null;
  let disconnectPromise: Promise<void> | null = null;
  let connected = false;
  const listenerCleanups = new Set<() => void>();

  function isAndroid(): boolean {
    return getPlatform() === 'android';
  }

  async function requireNativeModule(): Promise<ExpoIapModule> {
    if (!isAndroid()) {
      throw new GooglePlayNativeBillingUnavailableError();
    }
    if (nativeModule) {
      return nativeModule;
    }
    try {
      nativeModule = await loadModule();
      return nativeModule;
    } catch {
      throw new GooglePlayNativeBillingUnavailableError();
    }
  }

  async function getAvailability(): Promise<GooglePlayBillingAvailability> {
    if (!isAndroid()) {
      return { available: false, reason: 'non_android' };
    }
    try {
      await requireNativeModule();
      return { available: true };
    } catch (error) {
      if (error instanceof GooglePlayNativeBillingUnavailableError) {
        return { available: false, reason: 'native_module_unavailable' };
      }
      throw error;
    }
  }

  async function connect(): Promise<void> {
    if (connected) {
      return;
    }
    if (connectionPromise) {
      return connectionPromise;
    }

    connectionPromise = (async () => {
      const module = await requireNativeModule();
      let initialized: boolean;
      try {
        initialized = await module.initConnection();
      } catch {
        throw new GooglePlayNativeBillingUnavailableError();
      }
      if (!initialized) {
        throw new GooglePlayNativeBillingUnavailableError();
      }
      connected = true;
    })();

    try {
      await connectionPromise;
    } finally {
      connectionPromise = null;
    }
  }

  function removeAllListeners(): void {
    for (const cleanup of listenerCleanups) {
      cleanup();
    }
    listenerCleanups.clear();
  }

  async function disconnect(): Promise<void> {
    if (disconnectPromise) {
      return disconnectPromise;
    }
    if (connectionPromise) {
      try {
        await connectionPromise;
      } catch {
        removeAllListeners();
        return;
      }
    }
    if (!connected || !nativeModule) {
      removeAllListeners();
      return;
    }

    disconnectPromise = (async () => {
      try {
        await nativeModule?.endConnection();
      } finally {
        connected = false;
        removeAllListeners();
      }
    })();

    try {
      await disconnectPromise;
    } finally {
      disconnectPromise = null;
    }
  }

  async function querySubscriptionProducts(
    productIds: string[],
  ): Promise<ProductSubscription[]> {
    if (!connected) {
      throw new GooglePlayBillingNotConnectedError();
    }
    const module = await requireNativeModule();
    const products = await module.fetchProducts({
      skus: [...productIds],
      type: 'subs',
    });
    if (!products) {
      return [];
    }
    const allProducts: ProductOrSubscription[] = products;
    return allProducts.filter(isSubscriptionProduct);
  }

  async function registerPurchaseListeners(
    onPurchase: (purchase: Purchase) => void,
    onError: (error: GooglePlayPurchaseError) => void,
  ): Promise<() => void> {
    const module = await requireNativeModule();
    const subscriptions: ListenerSubscription[] = [
      module.purchaseUpdatedListener(onPurchase),
      module.purchaseErrorListener((_error: ExpoPurchaseError) => {
        onError({ message: 'Google Play purchase failed.' });
      }),
    ];

    let removed = false;
    const cleanup = () => {
      if (removed) {
        return;
      }
      removed = true;
      subscriptions.forEach((subscription) => subscription.remove());
      listenerCleanups.delete(cleanup);
    };
    listenerCleanups.add(cleanup);
    return cleanup;
  }

  return {
    isAndroid,
    getAvailability,
    connect,
    disconnect,
    querySubscriptionProducts,
    registerPurchaseListeners,
  };
}

export const googlePlayBilling = createGooglePlayBillingGateway();
