import React from 'react';

let mockIsPremium = false;
let mockEntitlements = {
  subscriptionStatus: 'inactive',
  currentPeriodEnd: null as string | null,
  cancelAtPeriodEnd: false,
  capabilities: {
    aiAssistant: false,
    contributionPaymentsEnabled: false,
  },
};

const mockRefreshEntitlements = jest.fn();
const mockRefreshContributionPaymentsCapability = jest.fn();
const mockCreateBillingCheckout = jest.fn();
const mockCreateBillingPortal = jest.fn();
const mockCancelPremiumSubscription = jest.fn();
const mockGetBillingPlans = jest.fn();
const mockOpenBrowserAsync = jest.fn();
const mockAlert = jest.fn();

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

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: mockOpenBrowserAsync,
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));

jest.mock('../authContext', () => ({
  useAuthSession: () => ({
    session: { session: { token: 'token' } },
  }),
}));

jest.mock('../entitlementsContext', () => ({
  useEntitlements: () => ({
    entitlements: mockEntitlements,
    isPremium: mockIsPremium,
    refreshEntitlements: mockRefreshEntitlements,
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
const SubscriptionScreen: typeof import('../../app/subscription').default =
  require('../../app/subscription').default;

let renderer: any;

const premiumPlan = {
  id: 'premium',
  name: 'Organizer Pro',
  tagline: 'Premium organizer tools.',
  monthlyPriceCents: 799,
  annualPriceCents: 5999,
  annualSavingsCents: 3589,
  trialDays: 7,
  features: [
    'Unlimited open circles',
    'Ongoing AI organizer assistance',
  ],
};

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

function pressable(label: string): any {
  const match = renderer.root
    .findAll((node: any) => node.type === 'Pressable')
    .find((node: any) => textContent(node).includes(label));
  if (!match) throw new Error(`Pressable not found: ${label}`);
  return match;
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

async function press(label: string): Promise<void> {
  await TestRenderer.act(async () => {
    pressable(label).props.onPress();
    await flush();
  });
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockIsPremium = false;
  mockEntitlements = {
    subscriptionStatus: 'inactive',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    capabilities: {
      aiAssistant: false,
      contributionPaymentsEnabled: false,
    },
  };
  mockGetBillingPlans.mockResolvedValue({ plans: [premiumPlan] });
  mockCreateBillingCheckout.mockResolvedValue({
    checkoutUrl: 'https://billing.example/checkout',
  });
  mockCreateBillingPortal.mockResolvedValue({
    portalUrl: 'https://billing.example/portal',
  });
  mockOpenBrowserAsync.mockResolvedValue({ type: 'dismiss' });
  mockRefreshEntitlements.mockResolvedValue(mockEntitlements);
  mockCancelPremiumSubscription.mockResolvedValue(undefined);
});

afterEach(() => {
  if (renderer) {
    TestRenderer.act(() => renderer.unmount());
    renderer = undefined;
  }
});

test('free user sees the authoritative monthly and annual catalog prices and derived savings', async () => {
  await mount();

  expect(visibleText()).toContain('$\n59.99\n/year');
  expect(visibleText()).toContain('$5.00/month');
  expect(visibleText()).toContain('SAVE 37%');

  await press('Monthly');

  expect(visibleText()).toContain('$\n7.99\n/month');
  expect(visibleText()).not.toContain('$\n59.99\n/year');
});

test.each([
  ['monthly' as const, 'Monthly'],
  ['annual' as const, 'Annual'],
])(
  '%s selection creates interval-only checkout and opens its URL',
  async (interval, label) => {
    await mount();
    await press(label);
    await press('Start my 7-day free trial');

    expect(mockCreateBillingCheckout).toHaveBeenCalledWith(
      'token',
      interval,
      'subscriptionScreen',
    );
    expect(mockCreateBillingCheckout.mock.calls[0]).toHaveLength(3);
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      'https://billing.example/checkout',
      { presentationStyle: 'pageSheet' },
    );
  },
);

test.each(['cancel', 'dismiss'])(
  'browser %s alone keeps the user free and refreshes only after browser return',
  async (browserResult) => {
    let returnFromBrowser!: (value: { type: string }) => void;
    mockOpenBrowserAsync.mockReturnValue(
      new Promise((resolve) => {
        returnFromBrowser = resolve;
      }),
    );
    await mount();

    await TestRenderer.act(async () => {
      pressable('Start my 7-day free trial').props.onPress();
      await flush();
    });

    expect(mockRefreshEntitlements).not.toHaveBeenCalled();

    await TestRenderer.act(async () => {
      returnFromBrowser({ type: browserResult });
      await flush();
    });

    expect(mockRefreshEntitlements).toHaveBeenCalledTimes(1);
    expect(visibleText()).toContain('Start my 7-day free trial');
    expect(visibleText()).not.toContain('Organizer Pro is active');
    expect(visibleText()).not.toContain('All organizer tools unlocked');
  },
);

test('Manage billing requests the authenticated portal, opens it, and refreshes on return', async () => {
  mockIsPremium = true;
  mockEntitlements.subscriptionStatus = 'active';
  await mount();

  await press('Manage billing');

  expect(mockCreateBillingPortal).toHaveBeenCalledWith('token');
  expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
    'https://billing.example/portal',
  );
  expect(mockRefreshEntitlements).toHaveBeenCalledTimes(1);
});

test('cancel renewal preserves access wording through the paid period', async () => {
  mockIsPremium = true;
  mockEntitlements.subscriptionStatus = 'active';
  mockEntitlements.currentPeriodEnd = '2026-09-30T00:00:00Z';
  await mount();

  await press('Cancel renewal');

  expect(mockAlert).toHaveBeenCalledWith(
    'Keep your organizer tools?',
    expect.stringContaining(
      'Organizer Pro access will continue until the end of the paid period.',
    ),
    expect.any(Array),
  );

  const actions = mockAlert.mock.calls[0][2] as Array<{
    text: string;
    onPress?: () => Promise<void>;
  }>;
  const cancel = actions.find((action) => action.text === 'Cancel renewal');
  await TestRenderer.act(async () => {
    await cancel?.onPress?.();
    await flush();
  });

  expect(mockCancelPremiumSubscription).toHaveBeenCalledWith('token');
  expect(mockRefreshEntitlements).toHaveBeenCalledTimes(1);
  expect(mockAlert).toHaveBeenLastCalledWith(
    'Renewal canceled',
    'Your Organizer Pro access remains active through the current period.',
  );
});

test('expired entitlement renders the free offer without active Premium or unlocked-AI assumptions', async () => {
  mockIsPremium = false;
  mockEntitlements.subscriptionStatus = 'expired';
  mockEntitlements.capabilities.aiAssistant = false;
  await mount();

  expect(visibleText()).toContain('Start my 7-day free trial');
  expect(visibleText()).not.toContain('Organizer Pro is active');
  expect(visibleText()).not.toContain('All organizer tools unlocked');
  expect(mockEntitlements.capabilities.aiAssistant).toBe(false);
});

test('contribution false leaves Premium UI unchanged and Premium refresh never enables it', async () => {
  mockIsPremium = true;
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
  expect(visibleText()).toContain('Manage billing');
  expect(visibleText()).toContain('Cancel renewal');

  await press('Manage billing');

  expect(mockRefreshContributionPaymentsCapability).not.toHaveBeenCalled();
  expect(mockEntitlements.capabilities.contributionPaymentsEnabled).toBe(false);
  expect(visibleText()).toContain('Organizer Pro is active');
});
