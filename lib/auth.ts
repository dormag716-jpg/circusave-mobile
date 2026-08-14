import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import {
  getAuthSession,
  logout as logoutApi,
  type AuthResponse,
} from './api';
import {
  evaluateStoredAuthSession,
  parseStoredAuthSessionRaw,
  runAuthSessionRestore,
  runLogoutSession,
} from './authSessionRestore';

const AUTH_SESSION_KEY = 'circusave.auth.session.v1';
let webSession: AuthResponse | null = null;

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

async function readRawStoredAuthSession(): Promise<unknown> {
  if (Platform.OS === 'web') {
    return webSession;
  }

  return parseStoredAuthSessionRaw(await readSessionValue());
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
  const evaluation = evaluateStoredAuthSession(await readRawStoredAuthSession());
  if (!evaluation.ok) {
    if (evaluation.reason !== 'missing') {
      await clearAuthSession();
    }
    return null;
  }

  return evaluation.session;
}

export async function clearAuthSession() {
  webSession = null;
  await deleteSessionValue();
}

export async function restoreAuthSession(options?: {
  onOptimistic?: (session: AuthResponse) => void;
  shouldAbort?: () => boolean;
  now?: number;
}): Promise<AuthResponse | null> {
  return runAuthSessionRestore({
    readStored: readRawStoredAuthSession,
    clearStored: clearAuthSession,
    persist: persistAuthSession,
    verifyRemote: getAuthSession,
    onOptimistic: options?.onOptimistic,
    shouldAbort: options?.shouldAbort,
    now: options?.now,
  });
}

export async function bootstrapAuthSession(options?: {
  onOptimistic?: (session: AuthResponse) => void;
  shouldAbort?: () => boolean;
  now?: number;
}): Promise<AuthResponse | null> {
  return restoreAuthSession(options);
}

export async function logoutSession() {
  return runLogoutSession({
    readStored: readRawStoredAuthSession,
    clearStored: clearAuthSession,
    logoutRemote: logoutApi,
  });
}
