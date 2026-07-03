import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import {
  ApiError,
  getAuthSession,
  logout as logoutApi,
  type AuthResponse,
} from './api';

const AUTH_SESSION_KEY = 'circusave.auth.session.v1';
let webSession: AuthResponse | null = null;

function isExpired(expiresAt: string) {
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
}

async function writeSessionValue(value: string) {
  if (Platform.OS === 'web') {
    return;
  }

  await SecureStore.setItemAsync(AUTH_SESSION_KEY, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function readSessionValue() {
  if (Platform.OS === 'web') {
    return null;
  }

  return SecureStore.getItemAsync(AUTH_SESSION_KEY);
}

async function deleteSessionValue() {
  if (Platform.OS === 'web') {
    return;
  }

  await SecureStore.deleteItemAsync(AUTH_SESSION_KEY);
}

export async function persistAuthSession(session: AuthResponse) {
  if (!session.session.token) {
    throw new Error('Cannot persist an authentication session without a bearer token.');
  }

  webSession = session;
  await writeSessionValue(JSON.stringify(session));
  return session;
}

export async function readStoredAuthSession(): Promise<AuthResponse | null> {
  if (Platform.OS === 'web') {
    return webSession;
  }

  const stored = await readSessionValue();
  if (!stored) {
    return null;
  }

  try {
    const session = JSON.parse(stored) as AuthResponse;
    if (
      !session?.user?.id ||
      !session.session?.id ||
      !session.session.token ||
      !session.session.expires_at
    ) {
      await clearAuthSession();
      return null;
    }

    if (isExpired(session.session.expires_at)) {
      await clearAuthSession();
      return null;
    }

    return session;
  } catch {
    await clearAuthSession();
    return null;
  }
}

export async function clearAuthSession() {
  webSession = null;
  await deleteSessionValue();
}

export async function bootstrapAuthSession(): Promise<AuthResponse | null> {
  const stored = await readStoredAuthSession();
  const token = stored?.session.token;
  if (!stored || !token) {
    return null;
  }

  try {
    const remote = await getAuthSession(token);
    return persistAuthSession({
      user: remote.user,
      session: {
        ...remote.session,
        token,
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearAuthSession();
      return null;
    }
    throw error;
  }
}

export async function logoutSession() {
  const stored = await readStoredAuthSession();
  const token = stored?.session.token;

  try {
    if (token) {
      await logoutApi(token);
    }
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) {
      throw error;
    }
  } finally {
    await clearAuthSession();
  }
}
