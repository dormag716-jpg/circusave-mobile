import React from 'react';

const mockGetEntitlements = jest.fn();
const mockGetFreshContributionPaymentsCapability = jest.fn();

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('../authContext', () => ({
  useAuthSession: () => ({
    status: 'authenticated',
    session: {
      session: { token: 'token' },
      user: { id: 'user-1' },
    },
  }),
}));

jest.mock('../api', () => ({
  getEntitlements: mockGetEntitlements,
  getFreshContributionPaymentsCapability:
    mockGetFreshContributionPaymentsCapability,
}));

const TestRenderer: any = require('react-test-renderer');
const {
  EntitlementsProvider,
  useEntitlements,
}: typeof import('../entitlementsContext') = require('../entitlementsContext');

let latest: ReturnType<typeof useEntitlements> | undefined;
let renderer: any;

function Consumer() {
  latest = useEntitlements();
  return React.createElement('EntitlementsState', {
    isPremium: latest.isPremium,
    contributionPaymentsEnabled: latest.hasCapability(
      'contributionPaymentsEnabled',
    ),
  });
}

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
  latest = undefined;
  mockGetEntitlements.mockResolvedValue({
    plan: 'premium',
    subscriptionStatus: 'active',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    source: 'stripe',
    capabilities: {
      multiCircle: true,
      maxParticipatingHands: 50,
      maxOpenCircles: null,
      aiAssistant: true,
      aiIntroAvailable: false,
      draftPayoutPdf: true,
      finalPayoutPdf: true,
      advancedReports: true,
      premiumReminders: true,
      fullActivityHistory: true,
      contributionPaymentsEnabled: true,
    },
  });
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
});

afterEach(() => {
  if (renderer) {
    TestRenderer.act(() => renderer.unmount());
  }
});

test('contribution refresh failure revokes only contribution payments', async () => {
  mockGetFreshContributionPaymentsCapability.mockRejectedValue(
    new Error('network down'),
  );

  let enabled = true;
  await TestRenderer.act(async () => {
    enabled =
      (await latest?.refreshContributionPaymentsCapability()) ?? true;
    await flush();
  });

  expect(enabled).toBe(false);
  expect(latest?.isPremium).toBe(true);
  expect(latest?.hasCapability('advancedReports')).toBe(true);
  expect(latest?.hasCapability('aiAssistant')).toBe(true);
  expect(latest?.hasCapability('contributionPaymentsEnabled')).toBe(false);
});

test('invalid and missing fresh capability values fail closed without removing Premium', async () => {
  mockGetFreshContributionPaymentsCapability.mockResolvedValue(false);

  await TestRenderer.act(async () => {
    await latest?.refreshContributionPaymentsCapability();
    await flush();
  });

  expect(latest?.isPremium).toBe(true);
  expect(latest?.hasCapability('fullActivityHistory')).toBe(true);
  expect(latest?.hasCapability('contributionPaymentsEnabled')).toBe(false);
});

test('contribution capability timeout fails closed without downgrading Premium', async () => {
  jest.useFakeTimers();
  mockGetFreshContributionPaymentsCapability.mockImplementation(
    (_token: string, signal?: AbortSignal) =>
      new Promise<boolean>((_resolve, reject) => {
        signal?.addEventListener('abort', () =>
          reject(new Error('request aborted')),
        );
      }),
  );

  let refreshPromise!: Promise<boolean>;
  await TestRenderer.act(async () => {
    refreshPromise =
      latest?.refreshContributionPaymentsCapability() ??
      Promise.resolve(false);
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
  });
  await expect(refreshPromise).resolves.toBe(false);

  expect(latest?.isPremium).toBe(true);
  expect(latest?.hasCapability('aiAssistant')).toBe(true);
  expect(latest?.hasCapability('contributionPaymentsEnabled')).toBe(false);
  jest.useRealTimers();
});
