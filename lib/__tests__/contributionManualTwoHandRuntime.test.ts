import React from 'react';

const mockSubmitContribution = jest.fn();
const mockGetCircleDetail = jest.fn();
const mockGetCircleSchedule = jest.fn();
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
    Platform: { OS: 'ios' },
    Pressable: host('Pressable'),
    RefreshControl: host('RefreshControl'),
    ScrollView: host('ScrollView'),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: host('Text'),
    TextInput: host('TextInput'),
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
  useStripe: () => ({
    initPaymentSheet: jest.fn(),
    presentPaymentSheet: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => ({
    circleId: 'circle-1',
    handId: 'hand-2',
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'people:hands.handLabel') return `Hand ${options?.number}`;
      if (key === 'contributions:selectHand') return `Select ${options?.name}`;
      return key;
    },
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

jest.mock('../authContext', () => ({
  useAuthSession: () => ({
    status: 'authenticated',
    session: {
      session: { token: 'token-1' },
      user: { id: 'user-1', name: 'Member' },
    },
  }),
}));

jest.mock('../useContributionPaymentCapability', () => ({
  useContributionPaymentCapability: () => ({
    enabled: false,
    pending: false,
    preflight: jest.fn(async () => false),
    revoke: jest.fn(),
  }),
}));

jest.mock('../api', () => ({
  ApiError: class ApiError extends Error {},
  createPaymentIntent: jest.fn(),
  getCircleDetail: mockGetCircleDetail,
  getCircleSchedule: mockGetCircleSchedule,
  submitContribution: mockSubmitContribution,
}));

jest.mock('../errorLogging', () => ({
  logClientError: jest.fn(),
}));

jest.mock('../navigation', () => ({
  circleWorkspaceHref: (circleId: string) => `/circle/${circleId}`,
}));

jest.mock('@/components/PaymentDestinationList', () => {
  const ReactModule = require('react');
  return {
    PaymentDestinationList: () =>
      ReactModule.createElement('PaymentDestinationList'),
  };
});

jest.mock('@/components/DecisionSheet', () => {
  const ReactModule = require('react');
  return {
    DecisionSheet: ({
      visible,
      children,
      onPrimary,
    }: {
      visible: boolean;
      children?: React.ReactNode;
      onPrimary: () => void;
    }) =>
      visible
        ? ReactModule.createElement(
            'DecisionSheet',
            null,
            children,
            ReactModule.createElement('Pressable', {
              accessibilityLabel: 'confirm-manual-report',
              onPress: onPrimary,
            }),
          )
        : null,
  };
});

const TestRenderer: any = require('react-test-renderer');
const ContributionPaymentScreen: typeof import('../../app/payment/contribution').default =
  require('../../app/payment/contribution').default;

const circle = {
  id: 'circle-1',
  name: 'Two Hand Circle',
  contributionAmount: 100,
  frequency: 'weekly',
  currentRound: 1,
  viewerHands: [
    {
      id: 'hand-1',
      userId: 'user-1',
      full_name: 'Member',
      handNumber: 1,
      isParticipating: true,
    },
    {
      id: 'hand-2',
      userId: 'user-1',
      full_name: 'Member',
      handNumber: 2,
      isParticipating: true,
    },
  ],
  members: [],
  paymentInstructions: 'Cash',
  paymentDestinations: [{ method: 'cash', destination: 'Organizer' }],
  viewerPermissions: { canSubmitOwnContribution: true },
};

const schedule = {
  currentRound: 1,
  roundWorkspace: {
    currentRoundNumber: 1,
    viewerPermissions: { canSubmitOwnContribution: true },
  },
  contributions: [
    { memberId: 'hand-1', round: 1, status: 'rejected' },
    { memberId: 'hand-2', round: 1, status: 'due' },
  ],
};

let renderer: any;

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockGetCircleDetail.mockResolvedValue(circle);
  mockGetCircleSchedule.mockResolvedValue(schedule);
  mockSubmitContribution.mockResolvedValue({});
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(React.createElement(ContributionPaymentScreen));
    await flush();
  });
});

afterEach(() => {
  TestRenderer.act(() => renderer.unmount());
});

test('selecting rejected Hand 1 reports only Hand 1 and leaves Hand 2 unchanged', async () => {
  const handOneSelector = renderer.root.findByProps({
    accessibilityLabel: 'Select Member · Hand 1',
  });
  await TestRenderer.act(async () => {
    handOneSelector.props.onPress();
    await flush();
  });

  const reportButton = renderer.root.findByProps({
    accessibilityLabel: 'contributions:submitA11y',
  });
  await TestRenderer.act(async () => {
    reportButton.props.onPress();
    await flush();
  });

  const confirmButton = renderer.root.findByProps({
    accessibilityLabel: 'confirm-manual-report',
  });
  await TestRenderer.act(async () => {
    confirmButton.props.onPress();
    await flush();
  });

  expect(mockSubmitContribution).toHaveBeenCalledTimes(1);
  expect(mockSubmitContribution).toHaveBeenCalledWith(
    'token-1',
    'circle-1',
    'hand-1',
    expect.objectContaining({ paymentMethod: 'cash' }),
  );
  expect(mockSubmitContribution).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    'hand-2',
    expect.anything(),
  );
  expect(schedule.contributions).toEqual([
    { memberId: 'hand-1', round: 1, status: 'rejected' },
    { memberId: 'hand-2', round: 1, status: 'due' },
  ]);
});
