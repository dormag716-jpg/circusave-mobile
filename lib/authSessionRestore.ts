import { ApiError, type AuthResponse } from './api';

export type AuthRestorePhase =
  | 'restoring'
  | 'authenticated-local'
  | 'authenticated-verified'
  | 'unauthenticated';

export type StoredAuthRejectReason = 'missing' | 'malformed' | 'expired';

export type StoredAuthEvaluation =
  | { ok: true; session: AuthResponse }
  | { ok: false; reason: StoredAuthRejectReason };

export type AuthVerifyFailureResolution =
  | { action: 'clear' }
  | { action: 'keep-local'; session: AuthResponse }
  | { action: 'error' };

export function publicAuthStatusFromRestorePhase(
  phase: AuthRestorePhase,
): 'loading' | 'authenticated' | 'unauthenticated' {
  if (phase === 'restoring') {
    return 'loading';
  }
  if (phase === 'unauthenticated') {
    return 'unauthenticated';
  }
  return 'authenticated';
}

export function parseStoredAuthSessionRaw(
  raw: string | null | undefined,
): unknown {
  if (raw == null || String(raw).trim() === '') {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { __unparseable: true };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readNestedString(
  value: Record<string, unknown>,
  key: string,
): string {
  return String(value[key] ?? '').trim();
}

export function parseSessionExpiryMs(expiresAt: string): number | null {
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) ? expiresAtMs : null;
}

export function isStoredAuthSessionExpired(
  expiresAt: string,
  now: number = Date.now(),
): boolean {
  const expiresAtMs = parseSessionExpiryMs(expiresAt);
  return expiresAtMs == null || expiresAtMs <= now;
}

export function evaluateStoredAuthSession(
  stored: unknown,
  now: number = Date.now(),
): StoredAuthEvaluation {
  if (stored == null) {
    return { ok: false, reason: 'missing' };
  }
  if (!isRecord(stored) || !isRecord(stored.user) || !isRecord(stored.session)) {
    return { ok: false, reason: 'malformed' };
  }

  const userId = readNestedString(stored.user, 'id');
  const sessionId = readNestedString(stored.session, 'id');
  const token = readNestedString(stored.session, 'token');
  const expiresAt = readNestedString(stored.session, 'expires_at');

  if (!userId || !sessionId || !token || !expiresAt) {
    return { ok: false, reason: 'malformed' };
  }
  if (parseSessionExpiryMs(expiresAt) == null) {
    return { ok: false, reason: 'malformed' };
  }
  if (isStoredAuthSessionExpired(expiresAt, now)) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, session: stored as AuthResponse };
}

export function shouldOptimisticRestore(
  evaluation: StoredAuthEvaluation,
): boolean {
  return evaluation.ok;
}

export function isInvalidAuthSessionError(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  if (error.status === 401 || error.status === 403) {
    return true;
  }
  if (!isRecord(error.payload)) {
    return false;
  }
  const code = String(
    error.payload.code ??
      error.payload.error ??
      error.payload.error_code ??
      error.payload.errorCode ??
      '',
  )
    .trim()
    .toLowerCase();
  return (
    code === 'session_invalid' ||
    code === 'invalid_session' ||
    code === 'session-invalid'
  );
}

export function resolveAuthSessionVerifyFailure(input: {
  stored: AuthResponse;
  error: unknown;
  now?: number;
}): AuthVerifyFailureResolution {
  if (isInvalidAuthSessionError(input.error)) {
    return { action: 'clear' };
  }

  const stillUsable = evaluateStoredAuthSession(
    input.stored,
    input.now ?? Date.now(),
  );
  if (stillUsable.ok) {
    return { action: 'keep-local', session: stillUsable.session };
  }
  return { action: 'error' };
}

export async function runAuthSessionRestore(input: {
  readStored: () => Promise<unknown>;
  clearStored: () => Promise<void>;
  persist: (session: AuthResponse) => Promise<AuthResponse>;
  verifyRemote: (token: string) => Promise<AuthResponse>;
  onOptimistic?: (session: AuthResponse) => void;
  shouldAbort?: () => boolean;
  now?: number;
}): Promise<AuthResponse | null> {
  const now = input.now ?? Date.now();
  const evaluation = evaluateStoredAuthSession(await input.readStored(), now);
  if (!evaluation.ok) {
    if (evaluation.reason !== 'missing') {
      await input.clearStored();
    }
    return null;
  }

  if (shouldOptimisticRestore(evaluation)) {
    input.onOptimistic?.(evaluation.session);
  }

  const token = String(evaluation.session.session.token || '').trim();
  try {
    const remote = await input.verifyRemote(token);
    if (input.shouldAbort?.()) {
      return null;
    }
    return input.persist({
      user: remote.user,
      session: {
        ...remote.session,
        token,
      },
    });
  } catch (error) {
    if (input.shouldAbort?.()) {
      return null;
    }
    const resolution = resolveAuthSessionVerifyFailure({
      stored: evaluation.session,
      error,
      now,
    });
    if (resolution.action === 'clear') {
      await input.clearStored();
      return null;
    }
    if (resolution.action === 'keep-local') {
      return resolution.session;
    }
    throw error;
  }
}

export async function runLogoutSession(input: {
  readStored: () => Promise<unknown>;
  clearStored: () => Promise<void>;
  logoutRemote: (token: string) => Promise<void>;
}): Promise<void> {
  const evaluation = evaluateStoredAuthSession(await input.readStored());
  const token = evaluation.ok
    ? String(evaluation.session.session.token || '').trim()
    : '';

  try {
    if (token) {
      await input.logoutRemote(token);
    }
  } catch (error) {
    if (!isInvalidAuthSessionError(error)) {
      throw error;
    }
  } finally {
    await input.clearStored();
  }
}
