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
jest.mock('../platform/notifications', () => ({
  getExistingPushToken: jest.fn(),
  registerForPushNotifications: jest.fn(),
}));

import { createPushTokenLifecycle } from '../platform/pushTokenLifecycle';

type Pending = { authToken: string; pushToken: string };
type TokenResult = { ok: true; token: string | null } | { ok: false; reason: string };

const DEVICE = 'ExponentPushToken[current-device]';
const existing: TokenResult = { ok: true, token: DEVICE };

function harness(options?: {
  registeredToken?: string | null;
  pending?: Pending | null;
  existingResult?: TokenResult;
  registerFailures?: number;
}) {
  let registeredToken = options?.registeredToken ?? null;
  let pending = options?.pending ?? null;
  let registerFailures = options?.registerFailures ?? 0;
  let existingReads = 0;
  let requestCalls = 0;
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
    requestPushToken: async () => {
      requestCalls += 1;
      return { ok: true as const, token: DEVICE };
    },
    readExistingPushToken: async () => {
      existingReads += 1;
      return options?.existingResult ?? { ok: true, token: null };
    },
    registerRemote: async (authToken, pushToken) => {
      if (registerFailures > 0) {
        registerFailures -= 1;
        throw new Error('offline');
      }
      events.push(`register:${authToken}:${pushToken}`);
    },
    unregisterRemote: async (authToken, pushToken) => {
      events.push(`unregister:${authToken}:${pushToken}`);
    },
  });
  return {
    lifecycle,
    events,
    getPending: () => pending,
    getRegisteredToken: () => registeredToken,
    existingReads: () => existingReads,
    requestCalls: () => requestCalls,
  };
}

const registers = (events: string[]) => events.filter((event) => event.startsWith('register:'));

describe('push registration for a restored session', () => {
  it('registers this device when the session was restored and nothing is stored', async () => {
    const state = harness({ existingResult: existing });

    await expect(state.lifecycle.ensureRegisteredForSession('bearer')).resolves.toBe(
      'registered',
    );
    expect(state.events).toEqual([`register:bearer:${DEVICE}`, `store-registered:${DEVICE}`]);
    expect(state.getRegisteredToken()).toBe(DEVICE);
  });

  it('makes no network request when the stored token already matches the device', async () => {
    const state = harness({ existingResult: existing, registeredToken: DEVICE });

    await expect(state.lifecycle.ensureRegisteredForSession('bearer')).resolves.toBe(
      'already-registered',
    );
    expect(state.events).toEqual([]);
  });

  it('registers again when the device token changed since it was stored', async () => {
    const state = harness({
      existingResult: existing,
      registeredToken: 'ExponentPushToken[old-device]',
    });

    await expect(state.lifecycle.ensureRegisteredForSession('bearer')).resolves.toBe(
      'registered',
    );
    expect(state.events).toEqual([`register:bearer:${DEVICE}`, `store-registered:${DEVICE}`]);
  });

  it('checks a session once per app run, not on every foreground', async () => {
    const state = harness({ existingResult: existing });

    await state.lifecycle.ensureRegisteredForSession('bearer');
    await expect(state.lifecycle.ensureRegisteredForSession('bearer')).resolves.toBe(
      'already-registered',
    );
    await state.lifecycle.ensureRegisteredForSession('bearer');

    expect(state.existingReads()).toBe(1);
    expect(registers(state.events)).toHaveLength(1);
  });

  it('never asks for notification permission', async () => {
    const state = harness({ existingResult: existing });
    await state.lifecycle.ensureRegisteredForSession('bearer');
    expect(state.requestCalls()).toBe(0);

    const denied = harness({
      existingResult: { ok: false, reason: 'Notification permission was not granted.' },
    });
    await expect(denied.lifecycle.ensureRegisteredForSession('bearer')).resolves.toBe(
      'permission-denied-or-unavailable',
    );
    expect(denied.requestCalls()).toBe(0);
    expect(denied.events).toEqual([]);
  });

  it('does nothing when no token is available', async () => {
    const state = harness({ existingResult: { ok: true, token: null } });
    await expect(state.lifecycle.ensureRegisteredForSession('bearer')).resolves.toBe(
      'permission-denied-or-unavailable',
    );
    expect(state.events).toEqual([]);
  });

  it('retries after a failed registration instead of remembering it as done', async () => {
    const state = harness({ existingResult: existing, registerFailures: 1 });

    await expect(state.lifecycle.ensureRegisteredForSession('bearer')).rejects.toThrow(
      'offline',
    );
    expect(state.getRegisteredToken()).toBeNull();

    await expect(state.lifecycle.ensureRegisteredForSession('bearer')).resolves.toBe(
      'registered',
    );
    expect(state.events).toEqual([`register:bearer:${DEVICE}`, `store-registered:${DEVICE}`]);
  });

  it('drops the work when a login, logout or newer restore took over', async () => {
    const before = harness({ existingResult: existing });
    await expect(
      before.lifecycle.ensureRegisteredForSession('bearer', () => false),
    ).resolves.toBe('superseded');
    expect(before.existingReads()).toBe(0);
    expect(before.events).toEqual([]);

    const during = harness({ existingResult: existing });
    let checks = 0;
    await expect(
      during.lifecycle.ensureRegisteredForSession('bearer', () => {
        checks += 1;
        return checks < 2; // current at the start, superseded right before the request
      }),
    ).resolves.toBe('superseded');
    expect(during.events).toEqual([]);
    expect(during.getRegisteredToken()).toBeNull();
  });

  it('does not repeat the registration a login just made', async () => {
    const state = harness({ existingResult: existing });

    await expect(state.lifecycle.registerForSession('bearer')).resolves.toBe('registered');
    await expect(state.lifecycle.ensureRegisteredForSession('bearer')).resolves.toBe(
      'already-registered',
    );

    expect(registers(state.events)).toHaveLength(1);
    expect(state.existingReads()).toBe(0);
  });

  it('settles a prior account cleanup before registering the restored session', async () => {
    const state = harness({
      existingResult: existing,
      pending: { authToken: 'old-bearer', pushToken: 'ExponentPushToken[old-device]' },
    });

    await expect(state.lifecycle.ensureRegisteredForSession('bearer')).resolves.toBe(
      'registered',
    );
    expect(state.events).toEqual([
      'register:bearer:ExponentPushToken[old-device]',
      'unregister:bearer:ExponentPushToken[old-device]',
      'clear-pending',
      `register:bearer:${DEVICE}`,
      `store-registered:${DEVICE}`,
    ]);
    expect(state.getPending()).toBeNull();
  });

  it('keeps logout removing the exact registered token, and lets a later session register again', async () => {
    const state = harness({ existingResult: existing });

    await state.lifecycle.ensureRegisteredForSession('bearer');
    await expect(state.lifecycle.unregisterForLogout('bearer')).resolves.toBe('removed');
    expect(state.events).toContain(`unregister:bearer:${DEVICE}`);
    expect(state.events).toContain('clear-registered');
    expect(state.getRegisteredToken()).toBeNull();

    await expect(state.lifecycle.ensureRegisteredForSession('next-bearer')).resolves.toBe(
      'registered',
    );
    expect(state.events).toContain(`register:next-bearer:${DEVICE}`);
  });

  it('registers once when two restores run at the same time', async () => {
    const state = harness({ existingResult: existing });

    const results = await Promise.all([
      state.lifecycle.ensureRegisteredForSession('bearer'),
      state.lifecycle.ensureRegisteredForSession('bearer'),
    ]);

    expect([...results].sort()).toEqual(['already-registered', 'registered']);
    expect(registers(state.events)).toHaveLength(1);
  });
});
