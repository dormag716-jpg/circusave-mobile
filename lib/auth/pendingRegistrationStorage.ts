/**
 * Lets the person come back to the code screen after the app is closed mid sign-up.
 *
 * Only four things are kept, on this device only: the sign-up id, the email address, when the next
 * code may be requested, and when the whole sign-up expires. The password, the emailed code, the
 * development code and any token are never written. Fields are copied one by one, so nothing else
 * can slip in, and anything read back is checked before it is trusted.
 */

export type PersistedPendingRegistration = {
  signupId: string;
  email: string;
  resendAvailableAtMs: number;
  /** When the Backend stops accepting this sign-up; null if the Backend did not say. */
  signupExpiresAtMs: number | null;
};

export type PendingStorageAdapter = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
};

export const PENDING_REGISTRATION_KEY = 'circusave.pendingRegistration.v1';
/** The Backend deletes sign-ups a day after they expire; so does the app. */
export const PENDING_REGISTRATION_KEEP_MS = 24 * 60 * 60 * 1000;
const MAX_FIELD_LENGTH = 320;

function secureStoreAdapter(): PendingStorageAdapter {
  // Loaded on first use so tests and builds that never persist do not need the native module.
  const load = () => require('expo-secure-store') as typeof import('expo-secure-store');
  return {
    read: () => load().getItemAsync(PENDING_REGISTRATION_KEY),
    write: (value) =>
      load().setItemAsync(PENDING_REGISTRATION_KEY, value, {
        keychainAccessible: load().WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    remove: () => load().deleteItemAsync(PENDING_REGISTRATION_KEY),
  };
}

let adapter: PendingStorageAdapter | null = null;

function storage(): PendingStorageAdapter {
  adapter ??= secureStoreAdapter();
  return adapter;
}

/** For tests. Pass null to go back to the device's secure storage. */
export function setPendingStorageAdapter(next: PendingStorageAdapter | null): void {
  adapter = next;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_FIELD_LENGTH;
}

/** The only shape that is ever stored. Returns null for anything incomplete or odd. */
export function sanitizePending(value: unknown): PersistedPendingRegistration | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const resend = Number(record.resendAvailableAtMs);
  const expiry = record.signupExpiresAtMs;
  if (!isText(record.signupId) || !isText(record.email) || !Number.isFinite(resend)) {
    return null;
  }
  return {
    signupId: record.signupId,
    email: record.email,
    resendAvailableAtMs: resend,
    signupExpiresAtMs:
      typeof expiry === 'number' && Number.isFinite(expiry) && expiry > 0 ? expiry : null,
  };
}

export async function savePendingRegistration(value: PersistedPendingRegistration): Promise<void> {
  const clean = sanitizePending(value);
  if (!clean) {
    return;
  }
  try {
    await storage().write(JSON.stringify(clean));
  } catch {
    // Resuming is a convenience; a storage failure must never block sign-up.
  }
}

export async function forgetPendingRegistration(): Promise<void> {
  try {
    await storage().remove();
  } catch {
    // Nothing to do: there is no secret here to leave behind.
  }
}

/**
 * The saved sign-up, or null. A sign-up that expired more than a day ago is deleted and ignored.
 * One that expired recently is returned, so the screen can say so and offer a fresh start.
 */
export async function loadPendingRegistration(
  nowMs: number = Date.now(),
): Promise<PersistedPendingRegistration | null> {
  let raw: string | null = null;
  try {
    raw = await storage().read();
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await forgetPendingRegistration();
    return null;
  }
  const clean = sanitizePending(parsed);
  if (!clean) {
    await forgetPendingRegistration();
    return null;
  }
  if (
    clean.signupExpiresAtMs !== null &&
    nowMs - clean.signupExpiresAtMs > PENDING_REGISTRATION_KEEP_MS
  ) {
    await forgetPendingRegistration();
    return null;
  }
  return clean;
}
