import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { registerPushToken, unregisterPushToken } from './api';
import {
  getExistingPushToken,
  registerForPushNotifications,
  type NotificationResult,
} from './notifications';

const REGISTERED_PUSH_TOKEN_KEY = 'circusave.push.registered.v1';
const PENDING_UNREGISTER_KEY = 'circusave.push.pending-unregister.v1';
const PUSH_NETWORK_TIMEOUT_MS = 8000;

type PendingUnregister = {
  authToken: string;
  pushToken: string;
};

type PushTokenLifecycleDependencies = {
  readRegisteredToken: () => Promise<string | null>;
  writeRegisteredToken: (pushToken: string) => Promise<void>;
  clearRegisteredToken: () => Promise<void>;
  readPendingUnregister: () => Promise<PendingUnregister | null>;
  writePendingUnregister: (pending: PendingUnregister) => Promise<void>;
  clearPendingUnregister: () => Promise<void>;
  requestPushToken: () => Promise<NotificationResult>;
  readExistingPushToken: () => Promise<NotificationResult>;
  registerRemote: (authToken: string, pushToken: string) => Promise<unknown>;
  unregisterRemote: (authToken: string, pushToken: string) => Promise<unknown>;
};

export type PushRegistrationResult =
  | 'registered'
  | 'permission-denied-or-unavailable'
  | 'pending-cleanup';

export type PushUnregisterResult = 'removed' | 'queued' | 'no-token';

let webRegisteredToken: string | null = null;
let webPendingUnregister: PendingUnregister | null = null;

function isPendingUnregister(value: unknown): value is PendingUnregister {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<PendingUnregister>;
  return (
    typeof candidate.authToken === 'string' &&
    candidate.authToken.length > 0 &&
    typeof candidate.pushToken === 'string' &&
    candidate.pushToken.length > 0
  );
}

async function readSecureValue(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return key === REGISTERED_PUSH_TOKEN_KEY
      ? webRegisteredToken
      : webPendingUnregister
        ? JSON.stringify(webPendingUnregister)
        : null;
  }
  return SecureStore.getItemAsync(key);
}

async function writeSecureValue(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (key === REGISTERED_PUSH_TOKEN_KEY) {
      webRegisteredToken = value;
    } else {
      webPendingUnregister = JSON.parse(value) as PendingUnregister;
    }
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function clearSecureValue(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (key === REGISTERED_PUSH_TOKEN_KEY) {
      webRegisteredToken = null;
    } else {
      webPendingUnregister = null;
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export function createPushTokenLifecycle(
  dependencies: PushTokenLifecycleDependencies,
) {
  let operationTail: Promise<void> = Promise.resolve();

  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = operationTail.then(operation, operation);
    operationTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function flushPendingInternal(): Promise<boolean> {
    const pending = await dependencies.readPendingUnregister();
    if (!pending) {
      return true;
    }
    try {
      await dependencies.unregisterRemote(
        pending.authToken,
        pending.pushToken,
      );
      await dependencies.clearPendingUnregister();
      return true;
    } catch {
      return false;
    }
  }

  async function claimAndClearPendingWithCurrentSession(
    authToken: string,
  ): Promise<boolean> {
    const pending = await dependencies.readPendingUnregister();
    if (!pending) {
      return true;
    }
    try {
      // Registration already atomically reassigns an exact token. Claiming the
      // stored installation token lets the current session remove it safely
      // when the prior logout session was revoked before cleanup could retry.
      await dependencies.registerRemote(authToken, pending.pushToken);
      await dependencies.unregisterRemote(authToken, pending.pushToken);
      await dependencies.clearPendingUnregister();
      return true;
    } catch {
      return false;
    }
  }

  return {
    flushPendingUnregister(): Promise<boolean> {
      return exclusive(flushPendingInternal);
    },

    registerForSession(authToken: string): Promise<PushRegistrationResult> {
      return exclusive(async () => {
        if (!(await claimAndClearPendingWithCurrentSession(authToken))) {
          return 'pending-cleanup';
        }
        const result = await dependencies.requestPushToken();
        if (!result.ok || result.token === null) {
          return 'permission-denied-or-unavailable';
        }
        await dependencies.registerRemote(authToken, result.token);
        await dependencies.writeRegisteredToken(result.token);
        return 'registered';
      });
    },

    unregisterForLogout(authToken: string): Promise<PushUnregisterResult> {
      return exclusive(async () => {
        let pushToken = await dependencies.readRegisteredToken();
        if (!pushToken) {
          const existing = await dependencies.readExistingPushToken();
          pushToken = existing.ok ? existing.token : null;
        }
        if (!pushToken) {
          return 'no-token';
        }

        await dependencies.writePendingUnregister({ authToken, pushToken });
        try {
          await dependencies.unregisterRemote(authToken, pushToken);
          await dependencies.clearPendingUnregister();
          await dependencies.clearRegisteredToken();
          return 'removed';
        } catch {
          return 'queued';
        }
      });
    },
  };
}

const lifecycle = createPushTokenLifecycle({
  readRegisteredToken: () => readSecureValue(REGISTERED_PUSH_TOKEN_KEY),
  writeRegisteredToken: (pushToken) =>
    writeSecureValue(REGISTERED_PUSH_TOKEN_KEY, pushToken),
  clearRegisteredToken: () => clearSecureValue(REGISTERED_PUSH_TOKEN_KEY),
  readPendingUnregister: async () => {
    const raw = await readSecureValue(PENDING_UNREGISTER_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return isPendingUnregister(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  writePendingUnregister: (pending) =>
    writeSecureValue(PENDING_UNREGISTER_KEY, JSON.stringify(pending)),
  clearPendingUnregister: () => clearSecureValue(PENDING_UNREGISTER_KEY),
  requestPushToken: registerForPushNotifications,
  readExistingPushToken: getExistingPushToken,
  registerRemote: (authToken, pushToken) => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      PUSH_NETWORK_TIMEOUT_MS,
    );
    return registerPushToken(authToken, pushToken, controller.signal).finally(
      () => clearTimeout(timeout),
    );
  },
  unregisterRemote: (authToken, pushToken) => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      PUSH_NETWORK_TIMEOUT_MS,
    );
    return unregisterPushToken(authToken, pushToken, controller.signal).finally(
      () => clearTimeout(timeout),
    );
  },
});

export const flushPendingPushTokenUnregister =
  lifecycle.flushPendingUnregister;
export const registerPushTokenForSession = lifecycle.registerForSession;
export const unregisterPushTokenForLogout = lifecycle.unregisterForLogout;
