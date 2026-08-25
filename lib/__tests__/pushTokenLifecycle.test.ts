jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('../api', () => ({
  registerPushToken: jest.fn(),
  unregisterPushToken: jest.fn(),
}));
jest.mock('../notifications', () => ({
  getExistingPushToken: jest.fn(),
  registerForPushNotifications: jest.fn(),
}));

import { createPushTokenLifecycle } from '../pushTokenLifecycle';

type Pending = { authToken: string; pushToken: string };

function harness(options?: {
  registeredToken?: string | null;
  pending?: Pending | null;
  requestResult?: { ok: true; token: string | null } | { ok: false; reason: string };
  unregisterFailureFor?: string;
}) {
  let registeredToken = options?.registeredToken ?? null;
  let pending = options?.pending ?? null;
  const events: string[] = [];
  const lifecycle = createPushTokenLifecycle({
    readRegisteredToken: async () => registeredToken,
    writeRegisteredToken: async (token) => {
      events.push(`store-registered:${token}`);
      registeredToken = token;
    },
    clearRegisteredToken: async () => {
      events.push('clear-registered');
      registeredToken = null;
    },
    readPendingUnregister: async () => pending,
    writePendingUnregister: async (value) => {
      events.push('queue-unregister');
      pending = value;
    },
    clearPendingUnregister: async () => {
      events.push('clear-pending');
      pending = null;
    },
    requestPushToken: async () =>
      options?.requestResult ?? {
        ok: true as const,
        token: 'ExponentPushToken[current-device]',
      },
    readExistingPushToken: async () => ({ ok: true, token: null }),
    registerRemote: async (authToken, pushToken) => {
      events.push(`register:${authToken}:${pushToken}`);
    },
    unregisterRemote: async (authToken, pushToken) => {
      events.push(`unregister:${authToken}:${pushToken}`);
      if (options?.unregisterFailureFor === authToken) {
        throw new Error('offline');
      }
    },
  });
  return {
    lifecycle,
    events,
    getPending: () => pending,
    getRegisteredToken: () => registeredToken,
  };
}

describe('push token lifecycle', () => {
  it('unregisters the exact device token before logout clears its session', async () => {
    const state = harness({
      registeredToken: 'ExponentPushToken[current-device]',
    });

    await state.lifecycle.unregisterForLogout('old-bearer');
    state.events.push('clear-session');

    expect(state.events).toEqual([
      'queue-unregister',
      'unregister:old-bearer:ExponentPushToken[current-device]',
      'clear-pending',
      'clear-registered',
      'clear-session',
    ]);
  });

  it('queues cleanup and permits local logout when offline', async () => {
    const state = harness({
      registeredToken: 'ExponentPushToken[current-device]',
      unregisterFailureFor: 'old-bearer',
    });

    await expect(
      state.lifecycle.unregisterForLogout('old-bearer'),
    ).resolves.toBe('queued');
    expect(state.getPending()).toEqual({
      authToken: 'old-bearer',
      pushToken: 'ExponentPushToken[current-device]',
    });
  });

  it('cleans the prior account before registering the installation for a new account', async () => {
    const state = harness({
      pending: {
        authToken: 'old-bearer',
        pushToken: 'ExponentPushToken[current-device]',
      },
    });

    await expect(state.lifecycle.flushPendingUnregister()).resolves.toBe(true);
    state.events.push('new-session-active');
    await expect(state.lifecycle.registerForSession('new-bearer')).resolves.toBe(
      'registered',
    );

    expect(state.events).toEqual([
      'unregister:old-bearer:ExponentPushToken[current-device]',
      'clear-pending',
      'new-session-active',
      'register:new-bearer:ExponentPushToken[current-device]',
      'store-registered:ExponentPushToken[current-device]',
    ]);
    expect(state.getPending()).toBeNull();
    expect(state.getRegisteredToken()).toBe(
      'ExponentPushToken[current-device]',
    );
  });

  it('uses only the new bearer after activation when old-session cleanup failed', async () => {
    const state = harness({
      pending: {
        authToken: 'old-bearer',
        pushToken: 'ExponentPushToken[current-device]',
      },
      unregisterFailureFor: 'old-bearer',
    });

    await expect(state.lifecycle.flushPendingUnregister()).resolves.toBe(false);
    state.events.push('new-session-active');
    await expect(
      state.lifecycle.registerForSession('new-bearer'),
    ).resolves.toBe('registered');
    expect(state.events).toEqual([
      'unregister:old-bearer:ExponentPushToken[current-device]',
      'new-session-active',
      'register:new-bearer:ExponentPushToken[current-device]',
      'unregister:new-bearer:ExponentPushToken[current-device]',
      'clear-pending',
      'register:new-bearer:ExponentPushToken[current-device]',
      'store-registered:ExponentPushToken[current-device]',
    ]);
    expect(
      state.events
        .slice(state.events.indexOf('new-session-active') + 1)
        .some((event) => event.includes('old-bearer')),
    ).toBe(false);
  });

  it('keeps notification permission denial nonfatal', async () => {
    const state = harness({
      requestResult: {
        ok: false,
        reason: 'Notification permission was not granted.',
      },
    });

    await expect(
      state.lifecycle.registerForSession('new-bearer'),
    ).resolves.toBe('permission-denied-or-unavailable');
    expect(state.events).toEqual([]);
  });

  it('serializes duplicate logout and registration operations safely', async () => {
    let releaseUnregister: () => void = () => undefined;
    let markUnregisterStarted: () => void = () => undefined;
    const unregisterStarted = new Promise<void>((resolve) => {
      markUnregisterStarted = resolve;
    });
    const unregisterRelease = new Promise<void>((resolve) => {
      releaseUnregister = resolve;
    });
    let registeredToken: string | null =
      'ExponentPushToken[current-device]';
    let pending: Pending | null = null;
    const events: string[] = [];
    const lifecycle = createPushTokenLifecycle({
      readRegisteredToken: async () => registeredToken,
      writeRegisteredToken: async (token) => {
        registeredToken = token;
      },
      clearRegisteredToken: async () => {
        registeredToken = null;
      },
      readPendingUnregister: async () => pending,
      writePendingUnregister: async (value) => {
        pending = value;
      },
      clearPendingUnregister: async () => {
        pending = null;
      },
      requestPushToken: async () => ({
        ok: true,
        token: 'ExponentPushToken[current-device]',
      }),
      readExistingPushToken: async () => ({ ok: true, token: null }),
      registerRemote: async (authToken) => {
        events.push(`register:${authToken}`);
      },
      unregisterRemote: async (authToken) => {
        events.push(`unregister:${authToken}`);
        markUnregisterStarted();
        await unregisterRelease;
      },
    });

    const logout = lifecycle.unregisterForLogout('old-bearer');
    const registration = lifecycle.registerForSession('new-bearer');
    await unregisterStarted;
    expect(events).toEqual(['unregister:old-bearer']);

    releaseUnregister();
    await Promise.all([logout, registration]);
    expect(events).toEqual([
      'unregister:old-bearer',
      'register:new-bearer',
    ]);
  });
});
