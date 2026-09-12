import React from 'react';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

const mockInitialize = jest.fn();
const mockDispose = jest.fn();
const mockPurchase = jest.fn();
const mockRestore = jest.fn();
const mockRetryCompletion = jest.fn();
const mockRefreshEntitlements = jest.fn();
const mockOpenManagement = jest.fn();
const mockOpenBrowserAsync = jest.fn();
const mockCreateBillingPortal = jest.fn();
let mockSubscriber: ((state: Record<string, unknown>) => void) | null = null;
let mockInitialState: Record<string, unknown> = { status: 'disabled' };
let mockIsPremium = false;
let mockEntitlements: Record<string, unknown> = {
  subscriptionStatus: 'inactive',
  source: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  capabilities: {
    aiAssistant: false,
    contributionPaymentsEnabled: false,
  },
};

const monthlyPlan = {
  key: 'monthly',
  productId: 'play.monthly',
  basePlanId: 'monthly-base',
  offerId: null,
  title: 'Play Monthly',
  description: 'Monthly from Google Play',
  displayPrice: 'US$7.99',
  currency: 'USD',
  billingPeriod: 'P1M',
  trial: null,
  pricingPhases: [],
};
const annualTrialPlan = {
  key: 'annual',
  productId: 'play.annual',
  basePlanId: 'annual-base',
  offerId: 'trial-offer',
  title: 'Play Annual',
  description: 'Annual from Google Play',
  displayPrice: 'US$49.99',
  currency: 'USD',
  billingPeriod: 'P1Y',
  trial: {
    billingPeriod: 'P1W',
    displayPrice: 'Free',
  },
  pricingPhases: [],
};
const readyState = {
  status: 'ready',
  plans: { monthly: monthlyPlan, annual: annualTrialPlan },
};

jest.mock('react-native', () => {
  const ReactModule = require('react');
  const host = (name: string) =>
    ReactModule.forwardRef(
      (
        {
          children,
          ...props
        }: {
          children?: React.ReactNode;
          [key: string]: unknown;
        },
        ref: React.Ref<unknown>,
      ) => ReactModule.createElement(name, { ...props, ref }, children),
    );
  return {
    ActivityIndicator: host('ActivityIndicator'),
    Alert: { alert: jest.fn() },
    Linking: {
      canOpenURL: jest.fn(async () => true),
      openURL: jest.fn(async () => undefined),
    },
    Platform: { OS: 'android' },
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: host('Text'),
    View: host('View'),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  return {
    SafeAreaView: ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => ReactModule.createElement('SafeAreaView', props, children),
  };
});

jest.mock('@expo/vector-icons/FontAwesome', () => {
  const ReactModule = require('react');
  return (props: Record<string, unknown>) =>
    ReactModule.createElement('FontAwesome', props);
});

jest.mock('react-native-reanimated', () => {
  const ReactModule = require('react');
  const AnimatedView = ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => ReactModule.createElement('AnimatedView', props, children);
  const animation = {
    delay: () => animation,
    springify: () => animation,
  };
  return {
    __esModule: true,
    default: { View: AnimatedView },
    FadeInDown: animation,
    FadeInUp: animation,
  };
});

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  return {
    router: { back: jest.fn() },
    useFocusEffect: (effect: () => void | (() => void)) =>
      ReactModule.useEffect(effect, [effect]),
    useLocalSearchParams: () => ({}),
  };
});

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  openBrowserAsync: mockOpenBrowserAsync,
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { package: 'com.circusave.mobile' },
    },
  },
}));

jest.mock('../authContext', () => ({
  useAuthSession: () => ({
    session: { session: { token: 'authenticated-session' } },
    status: 'authenticated',
  }),
}));

jest.mock('../entitlementsContext', () => ({
  useEntitlements: () => ({
    entitlements: mockEntitlements,
    isPremium: mockIsPremium,
    refreshEntitlements: mockRefreshEntitlements,
  }),
}));

jest.mock('../api', () => ({
  cancelPremiumSubscription: jest.fn(),
  createBillingCheckout: jest.fn(),
  createBillingPortal: mockCreateBillingPortal,
  getBillingPlans: jest.fn(),
}));

jest.mock('../googlePlayBillingMachine', () => ({
  createGooglePlayBillingMachine: jest.fn((options) => ({
    initialize: mockInitialize.mockImplementation(async () => {
      mockSubscriber?.(mockInitialState);
    }),
    dispose: mockDispose,
    purchase: mockPurchase,
    restore: mockRestore,
    retryCompletion: mockRetryCompletion,
    subscribe: (subscriber: (state: Record<string, unknown>) => void) => {
      mockSubscriber = subscriber;
      return () => {
        mockSubscriber = null;
      };
    },
    __options: options,
  })),
}));

jest.mock('../googlePlaySubscriptionManagement', () => ({
  getAndroidApplicationPackage: () => 'com.circusave.mobile',
  openGooglePlaySubscriptionManagement: mockOpenManagement,
}));

jest.mock('../errorLogging', () => ({
  logClientWarning: jest.fn(),
}));

const TestRenderer: any = require('react-test-renderer');
const {
  initializeI18n,
}: typeof import('../i18n') = require('../i18n');
const {
  createGooglePlayBillingMachine,
}: typeof import('../googlePlayBillingMachine') = require('../googlePlayBillingMachine');
const SubscriptionScreen: typeof import('../../app/subscription').default =
  require('../../app/subscription').default;

let renderer: any;

function textContent(node: any): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textContent).join('');
  return textContent(node?.children ?? []);
}

function screenText(): string {
  return textContent(renderer.toJSON());
}

function button(label: string): any {
  return renderer.root
    .findAllByType('Pressable')
    .find((node: any) => node.props.accessibilityLabel === label);
}

async function renderScreen(): Promise<void> {
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(React.createElement(SubscriptionScreen));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function emit(state: Record<string, unknown>): Promise<void> {
  await TestRenderer.act(async () => {
    mockSubscriber?.(state);
    await Promise.resolve();
  });
}

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  await initializeI18n();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSubscriber = null;
  mockInitialState = { status: 'disabled' };
  mockIsPremium = false;
  mockEntitlements = {
    subscriptionStatus: 'inactive',
    source: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    capabilities: {
      aiAssistant: false,
      contributionPaymentsEnabled: false,
    },
  };
  mockInitialize.mockImplementation(async () => {
    mockSubscriber?.(mockInitialState);
  });
  mockDispose.mockResolvedValue(undefined);
  mockPurchase.mockResolvedValue(undefined);
  mockRestore.mockResolvedValue(undefined);
  mockRetryCompletion.mockResolvedValue(undefined);
  mockRefreshEntitlements.mockResolvedValue(undefined);
  mockOpenManagement.mockResolvedValue(undefined);
  mockCreateBillingPortal.mockResolvedValue({
    portalUrl: 'https://billing.example/portal',
  });
});

afterEach(async () => {
  if (renderer) {
    await TestRenderer.act(async () => {
      renderer.unmount();
      await Promise.resolve();
    });
    renderer = null;
  }
});

describe('Android Google Play subscription UI', () => {
  test('disabled status shows coming soon and cannot purchase', async () => {
    await renderScreen();

    expect(screenText()).toContain(
      'Google Play subscriptions are coming soon.',
    );
    expect(button('Subscribe with Google Play')).toBeUndefined();
    expect(mockPurchase).not.toHaveBeenCalled();
  });

  test('renders Play-localized products and never displays nominal prices', async () => {
    mockInitialState = readyState;
    await renderScreen();

    expect(screenText()).toContain('Play Annual');
    expect(screenText()).toContain('US$49.99');
    expect(screenText()).toContain('Eligible offer: 1 week at no charge');
    expect(screenText()).not.toContain('$59.99');

    const monthly = renderer.root
      .findAllByType('Pressable')
      .find((node: any) => textContent(node) === 'Monthly');
    await TestRenderer.act(async () => monthly.props.onPress());

    expect(screenText()).toContain('Play Monthly');
    expect(screenText()).toContain('US$7.99');
    expect(screenText()).not.toContain('Eligible offer:');
  });

  test('failed offer matching keeps purchase unavailable with sanitized copy', async () => {
    mockInitialState = {
      status: 'failed',
      operation: 'initialize',
      code: 'product_configuration_unavailable',
      retryable: true,
    };
    await renderScreen();

    expect(screenText()).toContain(
      'Google Play subscriptions are unavailable',
    );
    expect(button('Subscribe with Google Play')).toBeUndefined();
  });

  test('repeated purchase taps launch one state-machine purchase', async () => {
    mockInitialState = readyState;
    mockPurchase.mockReturnValue(new Promise(() => undefined));
    await renderScreen();

    const purchase = button('Start trial with Google Play');
    purchase.props.onPress();
    purchase.props.onPress();

    expect(mockPurchase).toHaveBeenCalledTimes(1);
    expect(mockPurchase).toHaveBeenCalledWith('annual');
  });

  test.each([
    [
      { status: 'pending', plan: 'annual' },
      'Purchase pending',
    ],
    [
      {
        status: 'ready',
        plans: readyState.plans,
        outcome: 'canceled',
      },
      'Purchase canceled',
    ],
    [
      {
        status: 'failed',
        operation: 'purchase',
        code: 'verification_failed',
        retryable: true,
      },
      'Google Play subscriptions are unavailable',
    ],
  ])('renders a sanitized non-entitling operation state', async (state, copy) => {
    mockInitialState = readyState;
    await renderScreen();
    await emit(state);

    expect(screenText()).toContain(copy);
    expect(mockRefreshEntitlements).not.toHaveBeenCalled();
    expect(screenText()).not.toContain('synthetic-purchase-token');
  });

  test('uses the injected entitlement refresh after authoritative operations', async () => {
    mockInitialState = readyState;
    await renderScreen();

    const options = (createGooglePlayBillingMachine as jest.Mock).mock.calls[0][0];
    await options.api.refreshEntitlements();
    await emit({
      status: 'succeeded',
      operation: 'purchase',
      plan: 'annual',
    });

    expect(mockRefreshEntitlements).toHaveBeenCalledTimes(1);
    expect(screenText()).toContain('CircuSave confirmed your Google Play subscription.');
  });

  test('handles restore with no purchases and prevents concurrent actions', async () => {
    mockInitialState = readyState;
    await renderScreen();

    await TestRenderer.act(async () => {
      await button('Restore purchases').props.onPress();
    });
    expect(mockRestore).toHaveBeenCalledTimes(1);

    await emit({ status: 'restoring' });
    expect(button('Restore purchases').props.disabled).toBe(true);
    expect(button('Start trial with Google Play').props.disabled).toBe(true);

    await emit({
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
    expect(screenText()).toContain('No purchases to restore');
  });

  test('Google Play entitlement uses Play management instead of Stripe', async () => {
    mockIsPremium = true;
    mockEntitlements = {
      ...mockEntitlements,
      subscriptionStatus: 'active',
      source: 'google_play',
    };
    mockInitialState = readyState;
    await renderScreen();

    await TestRenderer.act(async () => {
      await button('Manage Google Play subscription').props.onPress();
    });

    expect(mockOpenManagement).toHaveBeenCalledWith(
      'com.circusave.mobile',
      undefined,
    );
    expect(mockCreateBillingPortal).not.toHaveBeenCalled();
  });

  test('Stripe entitlement retains Stripe management on Android', async () => {
    mockIsPremium = true;
    mockEntitlements = {
      ...mockEntitlements,
      subscriptionStatus: 'active',
      source: 'stripe',
    };
    await renderScreen();

    await TestRenderer.act(async () => {
      await button('Manage billing').props.onPress();
    });

    expect(mockCreateBillingPortal).toHaveBeenCalledWith(
      'authenticated-session',
    );
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      'https://billing.example/portal',
    );
    expect(mockOpenManagement).not.toHaveBeenCalled();
  });

  test('waits for old native cleanup before creating a refocused machine', async () => {
    mockInitialState = readyState;
    let finishDisposal: (() => void) | null = null;
    mockDispose.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishDisposal = resolve;
      }),
    );
    await renderScreen();

    await TestRenderer.act(async () => {
      renderer.unmount();
      await Promise.resolve();
    });
    renderer = null;
    expect(createGooglePlayBillingMachine).toHaveBeenCalledTimes(1);

    await renderScreen();
    expect(createGooglePlayBillingMachine).toHaveBeenCalledTimes(1);

    await TestRenderer.act(async () => {
      finishDisposal?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(createGooglePlayBillingMachine).toHaveBeenCalledTimes(2);
  });

  test('disposes listeners and the connection on unmount', async () => {
    mockInitialState = readyState;
    await renderScreen();

    await TestRenderer.act(async () => {
      renderer.unmount();
      await Promise.resolve();
    });
    renderer = null;

    expect(mockDispose).toHaveBeenCalledTimes(1);
    expect(mockSubscriber).toBeNull();
  });
});
