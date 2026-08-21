import React from 'react';

let mockContributionPaymentsEnabled = false;
let mockIsPremium = true;
const mockGetLinkedAccounts = jest.fn();
const mockRouterPush = jest.fn();

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
    Modal: host('Modal'),
    Platform: { OS: 'ios' },
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

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { appOwnership: 'standalone' },
}));

jest.mock('@stripe/stripe-react-native', () => ({
  useFinancialConnectionsSheet: () => ({
    collectFinancialConnectionsAccounts: jest.fn(),
  }),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));

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
    router: { back: jest.fn(), push: mockRouterPush },
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(effect, [effect]);
    },
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: jest.fn(), language: 'en' },
  }),
}));

jest.mock('@/components/Avatar', () => {
  const ReactModule = require('react');
  return {
    Avatar: (props: Record<string, unknown>) =>
      ReactModule.createElement('Avatar', props),
  };
});

jest.mock('../authContext', () => ({
  useAuthSession: () => ({
    session: {
      session: { token: 'token' },
      user: {
        id: 'user-1',
        name: 'Organizer',
        email: 'organizer@example.com',
        reliabilityScore: 100,
      },
    },
    signOut: jest.fn(),
  }),
}));

jest.mock('../entitlementsContext', () => ({
  useEntitlements: () => ({
    isPremium: mockIsPremium,
    entitlements: {
      subscriptionStatus: 'active',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
    refreshEntitlements: jest.fn(),
    hasCapability: (capability: string) =>
      capability === 'contributionPaymentsEnabled'
        ? mockContributionPaymentsEnabled
        : false,
  }),
}));

jest.mock('../api', () => ({
  createFinancialConnectionsSession: jest.fn(),
  cancelPremiumSubscription: jest.fn(),
  createBillingCheckout: jest.fn(),
  createBillingPortal: jest.fn(),
  getBillingPlans: jest.fn(async () => ({ plans: [] })),
  getLinkedAccounts: mockGetLinkedAccounts,
}));

jest.mock('../i18n/language-storage', () => ({
  readLanguagePreference: jest.fn(async () => 'system'),
  saveLanguagePreference: jest.fn(),
}));

jest.mock('../notifications', () => ({
  scheduleTestNotification: jest.fn(),
}));

jest.mock('../market', () => ({
  useMarket: () => ({ market: 'us', setMarket: jest.fn() }),
}));

const TestRenderer: any = require('react-test-renderer');
const SettingsScreen: typeof import('../../app/(tabs)/settings').default =
  require('../../app/(tabs)/settings').default;
const AutomatedPaymentsScreen: typeof import('../../app/automated-payments').default =
  require('../../app/automated-payments').default;
const SubscriptionScreen: typeof import('../../app/subscription').default =
  require('../../app/subscription').default;

let renderers: any[] = [];

function textContent(node: any): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textContent).join('');
  return textContent(node?.children ?? []);
}

async function render(component: React.ReactElement): Promise<any> {
  let renderer: any;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(component);
    await Promise.resolve();
    await Promise.resolve();
  });
  renderers.push(renderer);
  return renderer;
}

function visibleText(renderer: any): string {
  return renderer.root
    .findAll((node: any) => node.type === 'Text')
    .map((node: any) => textContent(node))
    .join('\n');
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockContributionPaymentsEnabled = false;
  mockIsPremium = true;
});

afterEach(() => {
  for (const renderer of renderers) {
    TestRenderer.act(() => renderer.unmount());
  }
  renderers = [];
});

test('settings hides contribution Stripe controls but keeps preferences and Premium navigation', async () => {
  const renderer = await render(React.createElement(SettingsScreen));
  const text = visibleText(renderer);

  expect(text).not.toContain('settings:automatedPayments');
  expect(text).toContain('settings:paymentPreferences');
  expect(text).toContain('settings:subscription');
  expect(text).toContain('Premium Organizer — Active');
  expect(mockGetLinkedAccounts).not.toHaveBeenCalled();

  const subscription = renderer.root
    .findAll((node: any) => node.type === 'Pressable')
    .find((node: any) => textContent(node).includes('settings:subscription'));
  TestRenderer.act(() => subscription.props.onPress());
  expect(mockRouterPush).toHaveBeenCalledWith('/subscription');
});

test('direct automated-payment navigation renders only external guidance when disabled', async () => {
  const renderer = await render(
    React.createElement(AutomatedPaymentsScreen),
  );
  const text = visibleText(renderer);

  expect(text).toContain('rails.contributionPaymentsDisabledBody');
  expect(text).not.toContain('Connect with Stripe');
  expect(text).not.toContain('Connect another account');
  expect(mockGetLinkedAccounts).not.toHaveBeenCalled();
});

test('disabled contribution capability does not alter mounted Premium subscription UI', async () => {
  mockContributionPaymentsEnabled = false;
  mockIsPremium = true;
  const renderer = await render(React.createElement(SubscriptionScreen));
  const text = visibleText(renderer);

  expect(text).toContain('Organizer Pro is active');
  expect(text).toContain('Manage billing');
  expect(text).toContain('Cancel renewal');
  expect(text).not.toContain('rails.contributionPaymentsDisabledBody');
});
