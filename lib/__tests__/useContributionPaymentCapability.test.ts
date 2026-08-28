import React from 'react';

const mockRefreshContributionPaymentsCapability = jest.fn();
const mockRevokeContributionPaymentsCapability = jest.fn();
const mockCreatePaymentIntent = jest.fn();
const mockInitPaymentSheet = jest.fn();
const mockPresentPaymentSheet = jest.fn();

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
const {
  runStripeContributionPayment,
}: typeof import('../stripeContributionPayment') = require('../stripeContributionPayment');

let latest:
  | ReturnType<typeof useContributionPaymentCapability>
  | undefined;
let renderers: any[] = [];

function Harness() {
  const capability = useContributionPaymentCapability();
  latest = capability;
  const startPayment = async () => {
    if (!(await capability.preflight())) {
      return;
    }
    const outcome = await runStripeContributionPayment(
      {
        token: 'token',
        circleId: 'circle-1',
        roundNumber: 1,
        handId: 'hand-1',
        contributionPaymentsEnabled: true,
      },
      {
        createPaymentIntent: mockCreatePaymentIntent,
        initPaymentSheet: mockInitPaymentSheet,
        presentPaymentSheet: mockPresentPaymentSheet,
        loadHandStatus: jest.fn(async () => 'confirmed'),
        pollMaxAttempts: 1,
      },
    );
    if (outcome.kind === 'disabled') {
      capability.revoke();
    }
  };
  return React.createElement(
    'Screen',
    { state: capability.state },
    capability.enabled
      ? React.createElement('StripeAction', { onPress: startPayment })
      : null,
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
  mockCreatePaymentIntent.mockResolvedValue({
    clientSecret: 'client-secret-placeholder',
    paymentIntentId: 'pi-placeholder',
    handId: 'hand-1',
  });
  mockInitPaymentSheet.mockResolvedValue({});
  mockPresentPaymentSheet.mockResolvedValue({});
});

afterEach(() => {
  for (const renderer of renderers) {
    TestRenderer.act(() => renderer.unmount());
  }
  renderers = [];
});

test('focus refresh pending hides Stripe while manual remains available', async () => {
  let resolveRefresh!: (enabled: boolean) => void;
  mockRefreshContributionPaymentsCapability.mockReturnValue(
    new Promise<boolean>((resolve) => {
      resolveRefresh = resolve;
    }),
  );
  const renderer = await renderHarness();

  expect(renderer.root.findAllByType('StripeAction')).toHaveLength(0);
  expect(renderer.root.findAllByType('ManualAction')).toHaveLength(1);
  expect(latest?.state).toBe('pending');

  await TestRenderer.act(async () => {
    resolveRefresh(false);
    await flush();
  });
  expect(latest?.state).toBe('disabled');
  expect(renderer.root.findAllByType('StripeAction')).toHaveLength(0);
});

test('focus failure fails closed and does not loop', async () => {
  mockRefreshContributionPaymentsCapability.mockRejectedValue(
    new Error('network down'),
  );
  const renderer = await renderHarness();

  expect(latest?.state).toBe('disabled');
  expect(renderer.root.findAllByType('StripeAction')).toHaveLength(0);
  expect(renderer.root.findAllByType('ManualAction')).toHaveLength(1);
  expect(mockRefreshContributionPaymentsCapability).toHaveBeenCalledTimes(1);
});

test('fresh explicit true exposes Stripe', async () => {
  mockRefreshContributionPaymentsCapability.mockResolvedValue(true);
  const renderer = await renderHarness();

  expect(latest?.state).toBe('enabled');
  expect(renderer.root.findAllByType('StripeAction')).toHaveLength(1);
  expect(renderer.root.findAllByType('ManualAction')).toHaveLength(1);

  await TestRenderer.act(async () => {
    await renderer.root.findByType('StripeAction').props.onPress();
    await flush();
  });
  expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
  expect(mockInitPaymentSheet).toHaveBeenCalledTimes(1);
  expect(mockPresentPaymentSheet).toHaveBeenCalledTimes(1);
});

test('stale prior true followed by fresh false revokes Stripe', async () => {
  mockRefreshContributionPaymentsCapability
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  const renderer = await renderHarness();
  expect(renderer.root.findAllByType('StripeAction')).toHaveLength(1);

  let enabled = true;
  await TestRenderer.act(async () => {
    enabled = (await latest?.preflight()) ?? true;
    await flush();
  });

  expect(enabled).toBe(false);
  expect(latest?.state).toBe('disabled');
  expect(renderer.root.findAllByType('StripeAction')).toHaveLength(0);
  expect(renderer.root.findAllByType('ManualAction')).toHaveLength(1);
  expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
  expect(mockInitPaymentSheet).not.toHaveBeenCalled();
  expect(mockPresentPaymentSheet).not.toHaveBeenCalled();
});

test('server revocation immediately switches the mounted UI to manual', async () => {
  mockRefreshContributionPaymentsCapability.mockResolvedValue(true);
  const renderer = await renderHarness();
  expect(renderer.root.findAllByType('StripeAction')).toHaveLength(1);

  TestRenderer.act(() => latest?.revoke());

  expect(mockRevokeContributionPaymentsCapability).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType('StripeAction')).toHaveLength(0);
  expect(renderer.root.findAllByType('ManualAction')).toHaveLength(1);
});

test('action-time fresh false never starts Stripe dependencies', async () => {
  mockRefreshContributionPaymentsCapability
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  const renderer = await renderHarness();

  await TestRenderer.act(async () => {
    await renderer.root.findByType('StripeAction').props.onPress();
    await flush();
  });

  expect(renderer.root.findAllByType('StripeAction')).toHaveLength(0);
  expect(renderer.root.findAllByType('ManualAction')).toHaveLength(1);
  expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
  expect(mockInitPaymentSheet).not.toHaveBeenCalled();
  expect(mockPresentPaymentSheet).not.toHaveBeenCalled();
});

test('backend disabled response revokes mounted Stripe UI without generic retry', async () => {
  mockRefreshContributionPaymentsCapability.mockResolvedValue(true);
  mockCreatePaymentIntent.mockRejectedValue({
    status: 503,
    payload: { code: 'contribution_payments_disabled' },
  });
  const renderer = await renderHarness();

  await TestRenderer.act(async () => {
    await renderer.root.findByType('StripeAction').props.onPress();
    await flush();
  });

  expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
  expect(mockInitPaymentSheet).not.toHaveBeenCalled();
  expect(mockPresentPaymentSheet).not.toHaveBeenCalled();
  expect(mockRevokeContributionPaymentsCapability).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType('StripeAction')).toHaveLength(0);
  expect(renderer.root.findAllByType('ManualAction')).toHaveLength(1);
});
