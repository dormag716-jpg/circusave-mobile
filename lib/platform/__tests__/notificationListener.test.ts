const mockListeners: Array<(response: unknown) => void> = [];
const mockRemove = jest.fn();
const mockGetLast = jest.fn();
const mockClearLast = jest.fn();

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: (listener: (response: unknown) => void) => {
    mockListeners.push(listener);
    return { remove: mockRemove };
  },
  getLastNotificationResponse: () => mockGetLast(),
  clearLastNotificationResponse: () => mockClearLast(),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone' },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock('../../i18n', () => ({
  i18n: { t: (key: string) => key },
}));

import { setupNotificationListener } from '../notifications';

let counter = 0;

function response(data: Record<string, unknown>, id = `n-${++counter}`) {
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: {
      date: 1_700_000_000_000,
      request: { identifier: id, content: { data } },
    },
  };
}

const paymentPush = {
  link: '/groups/c_test_circle_1/round',
  circle_id: 'c_test_circle_1',
  member_id: 'm_1',
  notification_type: 'payment_submitted',
};

beforeEach(() => {
  mockListeners.length = 0;
  mockRemove.mockClear();
  mockGetLast.mockReset().mockReturnValue(null);
  mockClearLast.mockClear();
});

describe('setupNotificationListener', () => {
  it('opens the Round tab when a payment push is tapped while the app is running', async () => {
    const onNavigate = jest.fn();
    await setupNotificationListener(onNavigate);

    mockListeners[0](response(paymentPush));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith({
      screen: 'workspace',
      circleId: 'c_test_circle_1',
      tab: 'round',
      conversationId: undefined,
    });
  });

  it('still opens a chat push on the conversation it names', async () => {
    const onNavigate = jest.fn();
    await setupNotificationListener(onNavigate);

    mockListeners[0](
      response({
        screen: 'workspace',
        circleId: 'c_1',
        conversationId: 'conv_3',
        notification_type: 'chat_message',
      }),
    );

    expect(onNavigate).toHaveBeenCalledWith({
      screen: 'workspace',
      circleId: 'c_1',
      tab: undefined,
      conversationId: 'conv_3',
    });
  });

  it('follows a tap that launched the app from a killed state, then clears it', async () => {
    mockGetLast.mockReturnValue(response(paymentPush));
    const onNavigate = jest.fn();

    await setupNotificationListener(onNavigate);

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ circleId: 'c_test_circle_1', tab: 'round' }),
    );
    expect(mockClearLast).toHaveBeenCalledTimes(1);
  });

  it('does not replay the same tap when the listener is set up again after an auth change', async () => {
    const launchTap = response(paymentPush, 'launch-tap');
    mockGetLast.mockReturnValue(launchTap);
    const first = jest.fn();
    await setupNotificationListener(first);

    // Auth state changed, the controller subscribes again, and the response is
    // still reported as the last one.
    const second = jest.fn();
    await setupNotificationListener(second);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('does not navigate twice if the listener delivers the same tap as the cold-start read', async () => {
    const tap = response(paymentPush, 'same-tap');
    mockGetLast.mockReturnValue(tap);
    const onNavigate = jest.fn();
    await setupNotificationListener(onNavigate);

    mockListeners[0](tap);

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('treats two different taps as two navigations', async () => {
    const onNavigate = jest.fn();
    await setupNotificationListener(onNavigate);

    mockListeners[0](response(paymentPush));
    mockListeners[0](response({ ...paymentPush, notification_type: 'round_started' }));

    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it('ignores a push that does not name a safe circle', async () => {
    const onNavigate = jest.fn();
    await setupNotificationListener(onNavigate);

    mockListeners[0](response({ notification_type: 'payment_submitted' }));
    mockListeners[0](response({ circle_id: '../../login' }));

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('does nothing at start when there is no last response', async () => {
    const onNavigate = jest.fn();
    await setupNotificationListener(onNavigate);

    expect(onNavigate).not.toHaveBeenCalled();
    expect(mockClearLast).not.toHaveBeenCalled();
  });
});
