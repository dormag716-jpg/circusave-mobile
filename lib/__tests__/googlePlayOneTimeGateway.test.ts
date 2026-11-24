jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

import {
  createGooglePlayBillingGateway,
  GooglePlayBillingNotConnectedError,
} from '../billing/googlePlayBilling';

type NativeModule = NonNullable<
  NonNullable<Parameters<typeof createGooglePlayBillingGateway>[0]>['loadModule']
> extends () => Promise<infer Module>
  ? Module
  : never;

function createNative() {
  let onPurchase: ((purchase: unknown) => void) | undefined;
  let onError: ((error: unknown) => void) | undefined;
  const removeA = jest.fn();
  const removeB = jest.fn();
  const requestPurchase = jest.fn().mockResolvedValue(null);
  const module = {
    initConnection: jest.fn().mockResolvedValue(true),
    endConnection: jest.fn().mockResolvedValue(true),
    fetchProducts: jest.fn().mockResolvedValue([]),
    requestPurchase,
    getAvailablePurchases: jest.fn().mockResolvedValue([]),
    finishTransaction: jest.fn().mockResolvedValue(undefined),
    purchaseUpdatedListener: jest.fn((l) => {
      onPurchase = l;
      return { remove: removeA };
    }),
    purchaseErrorListener: jest.fn((l) => {
      onError = l;
      return { remove: removeB };
    }),
  } as unknown as NativeModule;
  return {
    module,
    requestPurchase,
    removeA,
    removeB,
    emitPurchase: (p: unknown) => onPurchase?.(p),
    emitError: (e: unknown) => onError?.(e),
  };
}

const INPUT = {
  productId: 'extra_hand',
  obfuscatedAccountId: 'acct',
  obfuscatedProfileId: 'xh_1',
};

function purchase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    productId: 'extra_hand',
    purchaseState: 'purchased',
    purchaseToken: 'tok',
    quantity: 1,
    store: 'google',
    transactionDate: 1,
    ...overrides,
  };
}

async function connected() {
  const native = createNative();
  const gateway = createGooglePlayBillingGateway({
    getPlatform: () => 'android',
    loadModule: async () => native.module,
  });
  await gateway.connect();
  return { native, gateway };
}

describe('one-time product purchases (extra hand)', () => {
  test('need an explicit connection', async () => {
    const gateway = createGooglePlayBillingGateway({
      getPlatform: () => 'android',
      loadModule: async () => createNative().module,
    });
    await expect(gateway.purchaseOneTimeProduct(INPUT)).rejects.toBeInstanceOf(
      GooglePlayBillingNotConnectedError,
    );
    await expect(gateway.queryOneTimeProductPrice('extra_hand')).rejects.toBeInstanceOf(
      GooglePlayBillingNotConnectedError,
    );
  });

  test('price is read from Google Play for the in-app product', async () => {
    const { native, gateway } = await connected();
    (native.module.fetchProducts as jest.Mock).mockResolvedValue([
      { id: 'other', displayPrice: '$9.99' },
      { id: 'extra_hand', displayPrice: '$1.99' },
    ]);
    await expect(gateway.queryOneTimeProductPrice('extra_hand')).resolves.toBe('$1.99');
    expect(native.module.fetchProducts).toHaveBeenCalledWith({
      skus: ['extra_hand'],
      type: 'in-app',
    });
    (native.module.fetchProducts as jest.Mock).mockResolvedValue([]);
    await expect(gateway.queryOneTimeProductPrice('extra_hand')).resolves.toBeNull();
  });

  test('sends the backend binding ids and returns the token once paid', async () => {
    const { native, gateway } = await connected();
    const pending = gateway.purchaseOneTimeProduct(INPUT);
    await Promise.resolve();
    await Promise.resolve();
    native.emitPurchase(purchase());
    await expect(pending).resolves.toMatchObject({ kind: 'purchased', purchaseToken: 'tok' });
    expect(native.requestPurchase).toHaveBeenCalledWith({
      request: {
        google: {
          skus: ['extra_hand'],
          obfuscatedAccountId: 'acct',
          obfuscatedProfileId: 'xh_1',
        },
      },
      type: 'in-app',
    });
    expect(native.removeA).toHaveBeenCalledTimes(1);
    expect(native.removeB).toHaveBeenCalledTimes(1);
  });

  test('ignores other products and reports a pending payment', async () => {
    const { native, gateway } = await connected();
    const pending = gateway.purchaseOneTimeProduct(INPUT);
    await Promise.resolve();
    await Promise.resolve();
    native.emitPurchase(purchase({ productId: 'something_else' }));
    native.emitPurchase(purchase({ purchaseState: 'pending' }));
    await expect(pending).resolves.toEqual({ kind: 'pending' });
  });

  test('maps cancel and failure without leaking details', async () => {
    const canceled = await connected();
    canceled.native.requestPurchase.mockRejectedValue({ code: 'user-cancelled' });
    await expect(canceled.gateway.purchaseOneTimeProduct(INPUT)).resolves.toEqual({
      kind: 'canceled',
    });
    const failed = await connected();
    failed.native.requestPurchase.mockRejectedValue(new Error('secret detail'));
    await expect(failed.gateway.purchaseOneTimeProduct(INPUT)).resolves.toEqual({
      kind: 'failed',
    });
    expect(failed.native.removeA).toHaveBeenCalledTimes(1);
  });

  test('lists only paid, unconsumed purchases of the product and consumes on request', async () => {
    const { native, gateway } = await connected();
    (native.module.getAvailablePurchases as jest.Mock).mockResolvedValue([
      purchase(),
      purchase({ purchaseToken: 'pend', purchaseState: 'pending' }),
      purchase({ productId: 'organizer-pro', purchaseToken: 'sub' }),
    ]);
    const found = await gateway.getUnconsumedOneTimePurchases('extra_hand');
    expect(found.map((p) => p.purchaseToken)).toEqual(['tok']);
    await gateway.consumeOneTimePurchase(found[0]);
    expect(native.module.finishTransaction).toHaveBeenCalledWith({
      purchase: found[0],
      isConsumable: true,
    });
  });
});
