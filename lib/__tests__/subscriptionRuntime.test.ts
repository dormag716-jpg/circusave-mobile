import React from 'react';

const asyncStorageValues = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => asyncStorageValues.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      asyncStorageValues.set(key, value);
    }),
  },
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { package: 'com.circusave.mobile' },
    },
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

let mockIsPremium = false;
let mockEntitlements = {
  subscriptionStatus: 'inactive',
  source: 'none' as string | null,
  currentPeriodEnd: null as string | null,
  cancelAtPeriodEnd: false,
  capabilities: {
    aiAssistant: false,
    contributionPaymentsEnabled: false,
  },
};

const mockRefreshEntitlements = jest.fn();
const mockRefreshContributionPaymentsCapability = jest.fn();
const mockInitializeGooglePlayBilling = jest.fn();
const mockPurchaseGooglePlaySubscription = jest.fn();
const mockRestoreGooglePlayPurchases = jest.fn();
const mockRetryGooglePlayCompletion = jest.fn();
const mockCreateBillingCheckout = jest.fn();
const mockCreateBillingPortal = jest.fn();
const mockCancelPremiumSubscription = jest.fn();
const mockGetBillingPlans = jest.fn();
const mockAlert = jest.fn();
let mockCheckoutParam: string | undefined;
let mockPlatform: 'ios' | 'web' = 'ios';

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
    Alert: { alert: mockAlert },
    Linking: {
      canOpenURL: jest.fn(async () => true),
      openURL: jest.fn(async () => undefined),
    },
    Platform: {
      get OS() {
        return mockPlatform;
      },
    },
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: { create: (styles: unknown) => styles },
    useWindowDimensions: () => ({ width: 412, height: 915, fontScale: 1 }),
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

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ checkout: mockCheckoutParam }),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  openBrowserAsync: jest.fn(),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));

jest.mock('../auth/authContext', () => ({
  useAuthSession: () => ({
    session: { session: { token: 'token' } },
    status: 'authenticated',
  }),
}));

jest.mock('../billing/entitlementsContext', () => ({
  useEntitlements: () => ({
    entitlements: mockEntitlements,
    isPremium: mockIsPremium,
    refreshEntitlements: mockRefreshEntitlements,
    googlePlayBillingState: { status: 'idle' },
    googlePlayPlans: null,
    initializeGooglePlayBilling: mockInitializeGooglePlayBilling,
    purchaseGooglePlaySubscription: mockPurchaseGooglePlaySubscription,
    restoreGooglePlayPurchases: mockRestoreGooglePlayPurchases,
    retryGooglePlayCompletion: mockRetryGooglePlayCompletion,
    refreshContributionPaymentsCapability:
      mockRefreshContributionPaymentsCapability,
    hasCapability: (capability: string) =>
      capability === 'contributionPaymentsEnabled'
        ? mockEntitlements.capabilities.contributionPaymentsEnabled
        : capability === 'aiAssistant'
          ? mockEntitlements.capabilities.aiAssistant
          : false,
  }),
}));

jest.mock('../api', () => ({
  cancelPremiumSubscription: mockCancelPremiumSubscription,
  createBillingCheckout: mockCreateBillingCheckout,
  createBillingPortal: mockCreateBillingPortal,
  getBillingPlans: mockGetBillingPlans,
}));

const TestRenderer: any = require('react-test-renderer');
const {
  initializeI18n,
  changeLanguagePreference,
}: typeof import('../i18n') = require('../i18n');
const SubscriptionScreen: typeof import('../../app/subscription').default =
  require('../../app/subscription').default;

let renderer: any;

function textContent(node: any): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textContent).join('');
  return textContent(node?.children ?? []);
}

function visibleText(): string {
  return renderer.root
    .findAll((node: any) => node.type === 'Text')
    .map((node: any) => textContent(node))
    .join('\n');
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function mount(): Promise<void> {
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(React.createElement(SubscriptionScreen));
    await flush();
  });
}

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  asyncStorageValues.clear();
  await initializeI18n();
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockPlatform = 'ios';
  await changeLanguagePreference('en');
  mockIsPremium = false;
  mockEntitlements = {
    subscriptionStatus: 'inactive',
    source: 'none',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    capabilities: {
      aiAssistant: false,
      contributionPaymentsEnabled: false,
    },
  };
  mockCheckoutParam = undefined;
  mockRefreshEntitlements.mockResolvedValue(mockEntitlements);
});

afterEach(() => {
  if (renderer) {
    TestRenderer.act(() => renderer.unmount());
    renderer = undefined;
  }
});

test('iOS free user sees StoreKit-unavailable copy and never starts Stripe checkout', async () => {
  await mount();

  expect(visibleText()).toContain(
    'Organizer Pro subscriptions are not yet available on iPhone.',
  );
  // The three plans are listed with their limits, but nothing can be bought.
  expect(visibleText()).toContain('Choose your plan');
  expect(visibleText()).toContain('Member Pro');
  expect(visibleText()).toContain('Organizer Pro');
  expect(visibleText()).not.toContain('We could not load a purchasable plan');
  expect(visibleText()).not.toContain('$59.99');
  expect(visibleText()).not.toContain('$7.99');
  expect(visibleText()).not.toContain('Start my 7-day free trial');
  expect(visibleText()).not.toContain('Secure checkout by Stripe');
  expect(visibleText()).not.toContain('Manage billing');
  expect(mockCreateBillingCheckout).not.toHaveBeenCalled();
  expect(mockCreateBillingPortal).not.toHaveBeenCalled();
  expect(mockCancelPremiumSubscription).not.toHaveBeenCalled();
  expect(mockInitializeGooglePlayBilling).not.toHaveBeenCalled();
  expect(mockGetBillingPlans).not.toHaveBeenCalled();
});

test('web free user sees web-specific copy and no iOS billing claims', async () => {
  mockPlatform = 'web';
  await mount();

  expect(visibleText()).toContain(
    'Organizer Pro subscriptions are not available on the web.',
  );
  expect(visibleText()).toContain(
    'Paid Organizer Pro billing is available only in the mobile app.',
  );
  expect(visibleText()).not.toContain(
    'Organizer Pro subscriptions are not yet available on iPhone.',
  );
  expect(visibleText()).not.toContain('iPhone subscriptions');
  expect(mockCreateBillingCheckout).not.toHaveBeenCalled();
});

test('hero title and tagline follow the selected language', async () => {
  await changeLanguagePreference('es');
  await mount();

  expect(visibleText()).toContain('Elige tu plan');
  expect(visibleText()).toContain(
    'Empieza gratis. Sube de plan cuando tus círculos crezcan.',
  );
  expect(visibleText()).not.toContain('Choose your plan');
  expect(visibleText()).not.toContain(
    'Run multiple circles with less chasing',
  );
});

test('old Stripe success deep link grants nothing locally', async () => {
  mockCheckoutParam = 'success';
  await mount();

  expect(mockRefreshEntitlements).not.toHaveBeenCalled();
  expect(visibleText()).not.toContain('Organizer Pro is active');
  expect(visibleText()).not.toContain('Activating Organizer Pro');
  expect(visibleText()).toContain(
    'Organizer Pro subscriptions are not yet available on iPhone.',
  );
  expect(mockCreateBillingCheckout).not.toHaveBeenCalled();
});

test('iOS admin entitlement unlocks Premium without Stripe or Play management', async () => {
  mockIsPremium = true;
  mockEntitlements = {
    ...mockEntitlements,
    source: 'admin',
    subscriptionStatus: 'active',
    capabilities: {
      aiAssistant: true,
      contributionPaymentsEnabled: false,
    },
  };
  await mount();

  expect(visibleText()).toContain('Organizer Pro is active');
  expect(visibleText()).toContain('Your subscription is active and ready.');
  expect(visibleText()).not.toContain('Manage billing');
  expect(visibleText()).not.toContain('Cancel renewal');
  expect(visibleText()).not.toContain('Manage Google Play subscription');
  expect(visibleText()).not.toContain('Secure checkout by Stripe');
  expect(mockCreateBillingPortal).not.toHaveBeenCalled();
  expect(mockCancelPremiumSubscription).not.toHaveBeenCalled();
  expect(mockInitializeGooglePlayBilling).not.toHaveBeenCalled();
});

test('expired entitlement stays free without Stripe trial or prices', async () => {
  mockIsPremium = false;
  mockEntitlements.subscriptionStatus = 'expired';
  mockEntitlements.source = 'stripe';
  mockEntitlements.capabilities.aiAssistant = false;
  await mount();

  expect(visibleText()).not.toContain('Start my 7-day free trial');
  expect(visibleText()).not.toContain('Organizer Pro is active');
  expect(visibleText()).not.toContain('Your subscription is active and ready.');
  expect(visibleText()).toContain(
    'Organizer Pro subscriptions are not yet available on iPhone.',
  );
  expect(mockEntitlements.capabilities.aiAssistant).toBe(false);
});

test('contribution false leaves Premium UI unchanged and never opens Stripe billing', async () => {
  mockIsPremium = true;
  mockEntitlements.source = 'admin';
  mockEntitlements.subscriptionStatus = 'active';
  mockEntitlements.capabilities.aiAssistant = true;
  mockEntitlements.capabilities.contributionPaymentsEnabled = false;
  mockRefreshEntitlements.mockResolvedValue({
    ...mockEntitlements,
    capabilities: {
      ...mockEntitlements.capabilities,
      contributionPaymentsEnabled: false,
    },
  });
  await mount();

  expect(visibleText()).toContain('Organizer Pro is active');
  expect(visibleText()).not.toContain('Manage billing');
  expect(visibleText()).not.toContain('Cancel renewal');
  expect(mockRefreshContributionPaymentsCapability).not.toHaveBeenCalled();
  expect(mockCreateBillingPortal).not.toHaveBeenCalled();
  expect(mockEntitlements.capabilities.contributionPaymentsEnabled).toBe(false);
});
