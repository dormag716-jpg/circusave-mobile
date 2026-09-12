import React from 'react';

const mockGetAuthoritativeEntitlements = jest.fn();
const mockGetFreshContributionPaymentsCapability = jest.fn();
const mockCreateMachine = jest.fn();
const mockInitialize = jest.fn();
const mockPurchase = jest.fn();
const mockRestore = jest.fn();
const mockReconcile = jest.fn();
const mockRetryCompletion = jest.fn();
const mockDispose = jest.fn();
const mockRemoveAppStateListener = jest.fn();
let mockAppState = 'active';
let mockAppStateListener: ((next: string) => void) | null = null;
let mockPlatform = 'android';
let mockAuth: {
  status: 'authenticated' | 'unauthenticated';
  session: {
    user: { id: string };
    session: { token: string; id: string };
  } | null;
};
let mockMachineState: Record<string, unknown> = { status: 'idle' };
let mockMachineSubscriber:
  | ((state: Record<string, unknown>) => void)
  | null = null;
let mockInitializedState: Record<string, unknown> = {
  status: 'ready',
  plans: {},
};

jest.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return mockAppState;
    },
    addEventListener: jest.fn(
      (_event: string, listener: (next: string) => void) => {
        mockAppStateListener = listener;
        return { remove: mockRemoveAppStateListener };
      },
    ),
  },
  Platform: {
    get OS() {
      return mockPlatform;
    },
  },
}));

jest.mock('../authContext', () => ({
  useAuthSession: () => mockAuth,
}));

jest.mock('../api', () => ({
  getAuthoritativeEntitlements: mockGetAuthoritativeEntitlements,
  getFreshContributionPaymentsCapability:
    mockGetFreshContributionPaymentsCapability,
}));

jest.mock('../errorLogging', () => ({
  logClientWarning: jest.fn(),
}));

jest.mock('../googlePlayBillingMachine', () => ({
  createGooglePlayBillingMachine: mockCreateMachine,
}));

const TestRenderer: any = require('react-test-renderer');
const {
  EntitlementsProvider,
  GOOGLE_PLAY_RECONCILIATION_COOLDOWN_MS,
  useEntitlements,
}: typeof import('../entitlementsContext') = require('../entitlementsContext');

let latest: ReturnType<typeof useEntitlements> | undefined;
let renderer: any;

const free = {
  plan: 'free',
  subscriptionStatus: 'inactive',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  trialEndsAt: null,
  source: 'none',
  capabilities: {
    multiCircle: false,
    maxParticipatingHands: 20,
    maxOpenCircles: 1,
    aiAssistant: false,
    aiIntroAvailable: true,
    draftPayoutPdf: false,
    finalPayoutPdf: false,
    advancedReports: false,
    premiumReminders: false,
    fullActivityHistory: false,
    contributionPaymentsEnabled: false,
  },
};

const premium = {
  ...free,
  plan: 'premium',
  subscriptionStatus: 'active',
  source: 'google_play',
  capabilities: {
    ...free.capabilities,
    multiCircle: true,
    maxParticipatingHands: 50,
    maxOpenCircles: null,
    aiAssistant: true,
  },
};

function Consumer() {
  latest = useEntitlements();
  return React.createElement('EntitlementsState', {
    plan: latest.entitlements.plan,
    status: latest.status,
    billingStatus: latest.googlePlayBillingState.status,
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function mountProvider(): Promise<void> {
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      React.createElement(
        EntitlementsProvider,
        null,
        React.createElement(Consumer),
      ),
    );
    await flush();
  });
}

async function rerenderProvider(): Promise<void> {
  await TestRenderer.act(async () => {
    renderer.update(
      React.createElement(
        EntitlementsProvider,
        null,
        React.createElement(Consumer),
      ),
    );
    await flush();
  });
}

async function changeAppState(next: string): Promise<void> {
  mockAppState = next;
  await TestRenderer.act(async () => {
    mockAppStateListener?.(next);
    await flush();
  });
}

function emitMachineState(state: Record<string, unknown>): void {
  mockMachineState = state;
  mockMachineSubscriber?.(state);
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockAppState = 'active';
  mockAppStateListener = null;
  mockPlatform = 'android';
  mockAuth = {
    status: 'authenticated',
    session: {
      user: { id: 'user-1' },
      session: { token: 'session-1', id: 'session-id-1' },
    },
  };
  mockMachineState = { status: 'idle' };
  mockInitializedState = {
    status: 'ready',
    plans: {
      monthly: { key: 'monthly' },
      annual: { key: 'annual' },
    },
  };
  mockInitialize.mockImplementation(async () => {
    emitMachineState(mockInitializedState);
  });
  mockPurchase.mockResolvedValue(undefined);
  mockRestore.mockResolvedValue(undefined);
  mockReconcile.mockResolvedValue(undefined);
  mockRetryCompletion.mockResolvedValue(undefined);
  mockDispose.mockResolvedValue(undefined);
  mockCreateMachine.mockImplementation(() => ({
    getState: () => mockMachineState,
    subscribe: (
      subscriber: (state: Record<string, unknown>) => void,
    ) => {
      mockMachineSubscriber = subscriber;
      return () => {
        mockMachineSubscriber = null;
      };
    },
    initialize: mockInitialize,
    purchase: mockPurchase,
    restore: mockRestore,
    reconcile: mockReconcile,
    retryCompletion: mockRetryCompletion,
    dispose: mockDispose,
  }));
  mockGetAuthoritativeEntitlements.mockResolvedValue(premium);
  mockGetFreshContributionPaymentsCapability.mockResolvedValue(true);
});

afterEach(async () => {
  if (renderer) {
    await TestRenderer.act(async () => {
      renderer.unmount();
      await flush();
    });
    renderer = null;
  }
});

describe('central entitlement synchronization', () => {
  test('authenticated startup fetches authoritative entitlements', async () => {
    await mountProvider();

    expect(mockGetAuthoritativeEntitlements).toHaveBeenCalledTimes(1);
    expect(mockGetAuthoritativeEntitlements).toHaveBeenCalledWith('session-1');
    expect(latest?.entitlements.plan).toBe('premium');
  });

  test('logged-out startup performs no entitlement request', async () => {
    mockAuth = { status: 'unauthenticated', session: null };
    await mountProvider();

    expect(mockGetAuthoritativeEntitlements).not.toHaveBeenCalled();
    expect(latest?.entitlements.plan).toBe('free');
    expect(mockAppStateListener).toBeNull();
  });

  test('concurrent refresh callers share one request and a later refresh runs', async () => {
    await mountProvider();
    mockGetAuthoritativeEntitlements.mockClear();
    const first = createDeferred<typeof premium>();
    mockGetAuthoritativeEntitlements.mockReturnValueOnce(first.promise);

    const one = latest!.refreshEntitlements();
    const two = latest!.refreshEntitlements();
    expect(one).toBe(two);
    expect(mockGetAuthoritativeEntitlements).toHaveBeenCalledTimes(1);

    first.resolve(premium);
    await expect(one).resolves.toEqual(premium);
    await latest!.refreshEntitlements();
    expect(mockGetAuthoritativeEntitlements).toHaveBeenCalledTimes(2);
  });

  test('ignores a stale response from a previous authenticated session', async () => {
    await mountProvider();
    const oldRequest = createDeferred<typeof premium>();
    const newEntitlements = { ...premium, source: 'stripe' as const };
    mockGetAuthoritativeEntitlements.mockClear();
    mockGetAuthoritativeEntitlements
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce(newEntitlements);
    const staleRefresh = latest!.refreshEntitlements();

    mockAuth = {
      status: 'authenticated',
      session: {
        user: { id: 'user-2' },
        session: { token: 'session-2', id: 'session-id-2' },
      },
    };
    await rerenderProvider();
    expect(latest?.entitlements.source).toBe('stripe');

    oldRequest.resolve(premium);
    await expect(staleRefresh).resolves.toEqual(free);
    await TestRenderer.act(flush);
    expect(latest?.entitlements.source).toBe('stripe');
  });

  test('ignores a stale contribution capability response after account switch', async () => {
    await mountProvider();
    const oldCapability = createDeferred<boolean>();
    mockGetFreshContributionPaymentsCapability.mockReturnValueOnce(
      oldCapability.promise,
    );
    const staleRefresh = latest!.refreshContributionPaymentsCapability();
    mockGetAuthoritativeEntitlements.mockResolvedValueOnce(free);

    mockAuth = {
      status: 'authenticated',
      session: {
        user: { id: 'user-2' },
        session: { token: 'session-2', id: 'session-id-2' },
      },
    };
    await rerenderProvider();
    oldCapability.resolve(true);

    await expect(staleRefresh).resolves.toBe(false);
    expect(
      latest?.entitlements.capabilities.contributionPaymentsEnabled,
    ).toBe(false);
  });

  test('clears the previous user entitlement before a failed account-switch refresh', async () => {
    await mountProvider();
    expect(latest?.entitlements.plan).toBe('premium');
    mockGetAuthoritativeEntitlements.mockRejectedValueOnce(
      new Error('network unavailable'),
    );

    mockAuth = {
      status: 'authenticated',
      session: {
        user: { id: 'user-2' },
        session: { token: 'session-2', id: 'session-id-2' },
      },
    };
    await rerenderProvider();

    expect(latest?.entitlements.plan).toBe('free');
    expect(latest?.status).toBe('error');
  });

  test('logout clears entitlement and billing synchronization state', async () => {
    await mountProvider();
    await latest!.initializeGooglePlayBilling();
    expect(mockCreateMachine).toHaveBeenCalledTimes(1);

    mockAuth = { status: 'unauthenticated', session: null };
    await rerenderProvider();

    expect(latest?.entitlements.plan).toBe('free');
    expect(latest?.googlePlayBillingState.status).toBe('idle');
    expect(latest?.googlePlayPlans).toBeNull();
    expect(mockDispose).toHaveBeenCalledTimes(1);
    expect(mockRemoveAppStateListener).toHaveBeenCalled();
  });

  test('failed refresh preserves known entitlement state', async () => {
    await mountProvider();
    mockGetAuthoritativeEntitlements.mockRejectedValueOnce(
      new Error('network unavailable'),
    );

    await TestRenderer.act(async () => {
      await expect(latest!.refreshEntitlements()).rejects.toThrow(
        'Unable to refresh entitlements.',
      );
      await flush();
    });
    expect(latest?.entitlements.plan).toBe('premium');
    expect(latest?.status).toBe('error');
  });

  test('authoritative expiration removes Premium normally', async () => {
    await mountProvider();
    mockGetAuthoritativeEntitlements.mockResolvedValueOnce({
      ...free,
      subscriptionStatus: 'expired',
      source: 'google_play',
    });

    await TestRenderer.act(async () => {
      await latest!.refreshEntitlements();
      await flush();
    });
    expect(latest?.entitlements.plan).toBe('free');
    expect(latest?.entitlements.subscriptionStatus).toBe('expired');
  });
});

describe('Android foreground reconciliation', () => {
  test('only a genuine background-to-active transition reconciles', async () => {
    await mountProvider();
    expect(mockCreateMachine).not.toHaveBeenCalled();

    await changeAppState('active');
    expect(mockReconcile).not.toHaveBeenCalled();

    await changeAppState('background');
    await changeAppState('active');
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockReconcile).toHaveBeenCalledTimes(1);

    await changeAppState('active');
    expect(mockReconcile).toHaveBeenCalledTimes(1);
  });

  test('cooldown prevents rapid repeats and permits a later reconciliation', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    await mountProvider();
    await changeAppState('background');
    await changeAppState('active');
    expect(mockReconcile).toHaveBeenCalledTimes(1);

    await changeAppState('background');
    await changeAppState('active');
    expect(mockReconcile).toHaveBeenCalledTimes(1);

    now.mockReturnValue(
      100_000 + GOOGLE_PLAY_RECONCILIATION_COOLDOWN_MS,
    );
    await changeAppState('background');
    await changeAppState('active');
    expect(mockReconcile).toHaveBeenCalledTimes(2);
  });

  test('iOS and logged-out sessions never initialize Play reconciliation', async () => {
    mockPlatform = 'ios';
    await mountProvider();
    await changeAppState('background');
    await changeAppState('active');
    expect(mockCreateMachine).not.toHaveBeenCalled();

    await TestRenderer.act(async () => {
      renderer.unmount();
      await flush();
    });
    renderer = null;
    mockAppStateListener = null;
    mockPlatform = 'android';
    mockAuth = { status: 'unauthenticated', session: null };
    await mountProvider();
    expect(mockAppStateListener).toBeNull();
    expect(mockCreateMachine).not.toHaveBeenCalled();
  });

  test.each([
    [{ status: 'disabled' }, 'disabled backend'],
    [
      { status: 'unsupported', reason: 'native_module_unavailable' },
      'unsupported native billing',
    ],
  ])('%s skips reconciliation', async (initializedState, _label) => {
    mockInitializedState = initializedState;
    await mountProvider();
    await changeAppState('background');
    await changeAppState('active');

    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  test.each([
    { status: 'disabled' },
    { status: 'unsupported', reason: 'native_module_unavailable' },
  ])('explicit restore stops after unavailable initialization', async (state) => {
    mockInitializedState = state;
    await mountProvider();

    await latest!.restoreGooglePlayPurchases();

    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockRestore).not.toHaveBeenCalled();
  });

  test.each(['purchasing', 'verifying', 'restoring'])(
    'queues foreground reconciliation during %s and runs afterward',
    async (operationStatus) => {
      await mountProvider();
      await latest!.initializeGooglePlayBilling();
      await TestRenderer.act(async () => {
        emitMachineState(
          operationStatus === 'restoring'
            ? { status: 'restoring' }
            : { status: operationStatus, plan: 'annual' },
        );
        await flush();
      });

      await changeAppState('background');
      await changeAppState('active');
      expect(mockReconcile).not.toHaveBeenCalled();

      await TestRenderer.act(async () => {
        emitMachineState({
          status: 'ready',
          plans: mockInitializedState.plans,
        });
        await flush();
      });
      expect(mockReconcile).toHaveBeenCalledTimes(1);
    },
  );

  test('multiple foreground events share one in-flight reconciliation', async () => {
    const reconciliation = createDeferred<void>();
    mockReconcile.mockReturnValueOnce(reconciliation.promise);
    await mountProvider();
    await changeAppState('background');
    const firstActive = changeAppState('active');
    await flush();

    await changeAppState('background');
    await changeAppState('active');
    expect(mockReconcile).toHaveBeenCalledTimes(1);

    reconciliation.resolve();
    await firstActive;
  });
});
