import fs from 'fs';
import path from 'path';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock('expo-router', () => ({
  Link: () => null,
  Stack: { Screen: () => null },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../../components/Themed', () => ({
  Text: () => null,
  View: () => null,
}));

import {
  createGooglePlayBillingGateway,
  GooglePlayBillingNotConnectedError,
  GooglePlayNativeBillingUnavailableError,
} from '../googlePlayBilling';

type NativeModule = NonNullable<
  NonNullable<Parameters<typeof createGooglePlayBillingGateway>[0]>['loadModule']
> extends () => Promise<infer Module>
  ? Module
  : never;

function createNativeModule() {
  let purchaseListener: ((purchase: unknown) => void) | undefined;
  let errorListener: ((error: unknown) => void) | undefined;
  const purchaseRemove = jest.fn();
  const errorRemove = jest.fn();
  const requestPurchase = jest.fn().mockResolvedValue(null);
  const getAvailablePurchases = jest.fn().mockResolvedValue([]);
  const finishTransaction = jest.fn().mockResolvedValue(undefined);
  const module = {
    initConnection: jest.fn().mockResolvedValue(true),
    endConnection: jest.fn().mockResolvedValue(true),
    fetchProducts: jest.fn().mockResolvedValue([]),
    requestPurchase,
    getAvailablePurchases,
    finishTransaction,
    purchaseUpdatedListener: jest.fn((listener) => {
      purchaseListener = listener;
      return { remove: purchaseRemove };
    }),
    purchaseErrorListener: jest.fn((listener) => {
      errorListener = listener;
      return { remove: errorRemove };
    }),
  } as unknown as NativeModule;

  return {
    module,
    purchaseRemove,
    errorRemove,
    requestPurchase,
    getAvailablePurchases,
    finishTransaction,
    emitPurchase: (purchase: unknown) => purchaseListener?.(purchase),
    emitError: (error: unknown) => errorListener?.(error),
  };
}

describe('Google Play native billing gateway', () => {
  test('ordinary route imports do not require the ExpoIAP native module', () => {
    jest.isolateModules(() => {
      jest.doMock('expo-iap', () => {
        throw new Error('ExpoIAP native module is absent');
      });

      expect(() => require('../../app/+not-found')).not.toThrow();
    });
  });

  test('missing native module fails safely without exposing loader details', async () => {
    const rawToken = 'raw-purchase-token-that-must-not-leak';
    const gateway = createGooglePlayBillingGateway({
      getPlatform: () => 'android',
      loadModule: async () => {
        throw new Error(`Cannot load native module: ${rawToken}`);
      },
    });

    await expect(gateway.getAvailability()).resolves.toEqual({
      available: false,
      reason: 'native_module_unavailable',
    });
    await expect(gateway.connect()).rejects.toEqual(
      new GooglePlayNativeBillingUnavailableError(),
    );
    await expect(gateway.connect()).rejects.not.toThrow(rawToken);
  });

  test.each(['ios', 'web'])(
    '%s never loads or initializes Google Play Billing',
    async (platform) => {
      const loadModule = jest.fn();
      const gateway = createGooglePlayBillingGateway({
        getPlatform: () => platform,
        loadModule,
      });

      await expect(gateway.getAvailability()).resolves.toEqual({
        available: false,
        reason: 'non_android',
      });
      await expect(gateway.connect()).rejects.toBeInstanceOf(
        GooglePlayNativeBillingUnavailableError,
      );
      await gateway.disconnect();

      expect(loadModule).not.toHaveBeenCalled();
    },
  );

  test('connect and disconnect cleanup are idempotent', async () => {
    const native = createNativeModule();
    const gateway = createGooglePlayBillingGateway({
      getPlatform: () => 'android',
      loadModule: async () => native.module,
    });

    await Promise.all([gateway.connect(), gateway.connect()]);
    const cleanup = await gateway.registerPurchaseListeners(jest.fn(), jest.fn());
    cleanup();
    cleanup();
    await Promise.all([gateway.disconnect(), gateway.disconnect()]);
    await gateway.disconnect();

    expect(native.module.initConnection).toHaveBeenCalledTimes(1);
    expect(native.module.endConnection).toHaveBeenCalledTimes(1);
    expect(native.purchaseRemove).toHaveBeenCalledTimes(1);
    expect(native.errorRemove).toHaveBeenCalledTimes(1);
  });

  test('queries only subscription products after an explicit connection', async () => {
    const native = createNativeModule();
    const gateway = createGooglePlayBillingGateway({
      getPlatform: () => 'android',
      loadModule: async () => native.module,
    });

    await expect(
      gateway.querySubscriptionProducts(['monthly']),
    ).rejects.toBeInstanceOf(GooglePlayBillingNotConnectedError);

    await gateway.connect();
    await gateway.querySubscriptionProducts(['monthly', 'annual']);

    expect(native.module.fetchProducts).toHaveBeenCalledWith({
      skus: ['monthly', 'annual'],
      type: 'subs',
    });
  });

  test('uses expo-iap subscription purchase and completion contracts', async () => {
    const native = createNativeModule();
    const gateway = createGooglePlayBillingGateway({
      getPlatform: () => 'android',
      loadModule: async () => native.module,
    });
    const purchase = {
      id: 'synthetic-purchase',
      productId: 'organizer-pro',
      currentPlanId: 'monthly',
      purchaseState: 'purchased',
      purchaseToken: 'synthetic-memory-only-token',
      isAutoRenewing: true,
      quantity: 1,
      store: 'google',
      transactionDate: 1,
    };
    native.getAvailablePurchases.mockResolvedValue([purchase]);
    await gateway.connect();

    await gateway.requestSubscription(
      'organizer-pro',
      'synthetic-offer-token',
      'backend-obfuscated-account-id',
    );
    const purchases = await gateway.getAvailableSubscriptionPurchases();
    await gateway.finishSubscription(purchases[0]);

    expect(native.module.requestPurchase).toHaveBeenCalledWith({
      request: {
        google: {
          skus: ['organizer-pro'],
          subscriptionOffers: [
            {
              sku: 'organizer-pro',
              offerToken: 'synthetic-offer-token',
            },
          ],
          obfuscatedAccountId: 'backend-obfuscated-account-id',
        },
      },
      type: 'subs',
    });
    expect(native.module.getAvailablePurchases).toHaveBeenCalledWith({
      includeSuspendedAndroid: false,
    });
    expect(native.module.finishTransaction).toHaveBeenCalledWith({
      purchase,
      isConsumable: false,
    });
  });

  test('sanitizes synchronous purchase cancellation errors', async () => {
    const native = createNativeModule();
    native.requestPurchase.mockRejectedValue({
      code: 'user-cancelled',
      message: 'native diagnostic that must not escape',
    });
    const gateway = createGooglePlayBillingGateway({
      getPlatform: () => 'android',
      loadModule: async () => native.module,
    });
    await gateway.connect();

    await expect(
      gateway.requestSubscription(
        'organizer-pro',
        'synthetic-offer-token',
        'backend-obfuscated-account-id',
      ),
    ).rejects.toMatchObject({
      name: 'GooglePlayPurchaseRequestError',
      kind: 'canceled',
      message: 'Google Play purchase failed.',
    });
  });

  test('does not log or persist native purchase tokens or error details', async () => {
    const native = createNativeModule();
    const onPurchase = jest.fn();
    const onError = jest.fn();
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const gateway = createGooglePlayBillingGateway({
      getPlatform: () => 'android',
      loadModule: async () => native.module,
    });
    const rawToken = 'raw-purchase-token-that-must-not-leak';

    await gateway.registerPurchaseListeners(onPurchase, onError);
    native.emitPurchase({ productId: 'monthly', purchaseToken: rawToken });
    native.emitError(new Error(`Purchase failed for ${rawToken}`));

    expect(onPurchase).toHaveBeenCalledWith({
      productId: 'monthly',
      purchaseToken: rawToken,
    });
    expect(onError).toHaveBeenCalledWith({
      kind: 'failed',
      message: 'Google Play purchase failed.',
    });
    expect(JSON.stringify(onError.mock.calls)).not.toContain(rawToken);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    const source = fs.readFileSync(
      path.join(__dirname, '..', 'googlePlayBilling.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/AsyncStorage|SecureStore/);

    consoleLog.mockRestore();
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });
});
