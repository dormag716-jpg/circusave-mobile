import React from 'react';

const mockRefreshContributionPaymentsCapability = jest.fn();
const mockRevokeContributionPaymentsCapability = jest.fn();

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(effect, [effect]);
    },
  };
});

jest.mock('../entitlementsContext', () => ({
  useEntitlements: () => ({
    refreshContributionPaymentsCapability:
      mockRefreshContributionPaymentsCapability,
    revokeContributionPaymentsCapability:
      mockRevokeContributionPaymentsCapability,
  }),
}));

jest.mock('../authContext', () => ({
  useAuthSession: () => ({
    status: 'authenticated',
    session: { session: { token: 'token' } },
  }),
}));

const TestRenderer: any = require('react-test-renderer');
const {
  useContributionPaymentCapability,
}: typeof import('../useContributionPaymentCapability') = require('../useContributionPaymentCapability');

let latest:
  | ReturnType<typeof useContributionPaymentCapability>
  | undefined;
let renderers: any[] = [];

function Harness() {
  const capability = useContributionPaymentCapability();
  latest = capability;
  return React.createElement(
    'Screen',
    { state: capability.state },
    React.createElement('ManualAction'),
  );
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function renderHarness(): Promise<any> {
  let renderer: any;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(React.createElement(Harness));
    await flush();
  });
  renderers.push(renderer);
  return renderer;
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

beforeEach(() => {
  jest.clearAllMocks();
  latest = undefined;
});

afterEach(() => {
  for (const renderer of renderers) {
    TestRenderer.act(() => renderer.unmount());
  }
  renderers = [];
});

test('focus refresh pending keeps only manual recording available', async () => {
  let resolveRefresh!: (enabled: boolean) => void;
  mockRefreshContributionPaymentsCapability.mockReturnValue(
    new Promise<boolean>((resolve) => {
      resolveRefresh = resolve;
    }),
  );
  const renderer = await renderHarness();

  expect(renderer.root.findAllByType('ManualAction')).toHaveLength(1);
  expect(latest?.state).toBe('pending');
  expect(latest?.enabled).toBe(false);

  await TestRenderer.act(async () => {
    resolveRefresh(false);
    await flush();
  });
  expect(latest?.state).toBe('disabled');
  expect(latest?.enabled).toBe(false);
});

test('focus failure fails closed and does not loop', async () => {
  mockRefreshContributionPaymentsCapability.mockRejectedValue(
    new Error('network down'),
  );
  const renderer = await renderHarness();

  expect(latest?.state).toBe('disabled');
  expect(latest?.enabled).toBe(false);
  expect(renderer.root.findAllByType('ManualAction')).toHaveLength(1);
  expect(mockRefreshContributionPaymentsCapability).toHaveBeenCalledTimes(1);
});

test('fresh explicit true does not start in-app contribution payment', async () => {
  mockRefreshContributionPaymentsCapability.mockResolvedValue(true);
  const renderer = await renderHarness();

  expect(latest?.state).toBe('enabled');
  expect(renderer.root.findAllByType('ManualAction')).toHaveLength(1);
  expect(renderer.root.findAll((node: any) => node.type === 'StripeAction')).toHaveLength(
    0,
  );
});

test('stale prior true followed by fresh false stays manual-only', async () => {
  mockRefreshContributionPaymentsCapability
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  const renderer = await renderHarness();
  expect(latest?.enabled).toBe(true);

  let enabled = true;
  await TestRenderer.act(async () => {
    enabled = (await latest?.preflight()) ?? true;
    await flush();
  });

  expect(enabled).toBe(false);
  expect(latest?.state).toBe('disabled');
  expect(renderer.root.findAllByType('ManualAction')).toHaveLength(1);
});

test('server revocation immediately disables the capability without Stripe UI', async () => {
  mockRefreshContributionPaymentsCapability.mockResolvedValue(true);
  const renderer = await renderHarness();
  expect(latest?.enabled).toBe(true);

  TestRenderer.act(() => latest?.revoke());

  expect(mockRevokeContributionPaymentsCapability).toHaveBeenCalledTimes(1);
  expect(latest?.enabled).toBe(false);
  expect(renderer.root.findAllByType('ManualAction')).toHaveLength(1);
});
