import { ApiError } from '@/lib/platform/networkErrors';

/**
 * Registration now ends with an emailed code. The Backend returns
 * `verification_required` and creates no account and no session until the code
 * is proven. These helpers keep the app side small and testable.
 */

export type RegistrationVerificationRequired = {
  status: 'verification_required';
  signupId: string;
  expiresAt: string;
  resendAfterSeconds: number;
  /** Only a local development Backend returns this. It is never shown. */
  devCode?: string;
};

const DEFAULT_RESEND_SECONDS = 30;

export function readVerificationRequired(
  payload: unknown,
): RegistrationVerificationRequired | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const signupId = typeof record.signupId === 'string' ? record.signupId.trim() : '';
  if (record.status !== 'verification_required' || !signupId) {
    return null;
  }
  const resend = Number(record.resendAfterSeconds);
  return {
    status: 'verification_required',
    signupId,
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : '',
    resendAfterSeconds:
      Number.isFinite(resend) && resend >= 0 ? Math.floor(resend) : DEFAULT_RESEND_SECONDS,
    ...(typeof record.devCode === 'string' ? { devCode: record.devCode } : {}),
  };
}

// ---------------------------------------------------------------- errors

export type RegistrationErrorKind =
  | 'wrongCode'
  | 'expiredCode'
  | 'tooManyAttempts'
  | 'rateLimited'
  | 'resendTooSoon'
  | 'alreadyRegistered'
  | 'network'
  | 'generic';

export type RegistrationErrorView = {
  kind: RegistrationErrorKind;
  /** Seconds to wait, when the Backend gave one. */
  retryAfterSeconds?: number;
  /** Wrong guesses left, when the Backend gave it. */
  attemptsRemaining?: number;
};

/**
 * Turns a Backend failure into something the screen can show in the user's
 * language. The Backend sends a machine-readable `reason`; its English message
 * is never shown directly.
 */
export function describeRegistrationError(error: unknown): RegistrationErrorView {
  if (!(error instanceof ApiError)) {
    return { kind: 'generic' };
  }
  if (error.category === 'offline' || error.category === 'timeout' || error.status === 0) {
    return { kind: 'network' };
  }
  const payload =
    error.payload && typeof error.payload === 'object' && !Array.isArray(error.payload)
      ? (error.payload as Record<string, unknown>)
      : {};
  const retry =
    typeof error.retryAfterSeconds === 'number' && error.retryAfterSeconds > 0
      ? Math.ceil(error.retryAfterSeconds)
      : undefined;
  switch (payload.reason) {
    case 'code_invalid': {
      const left = Number(payload.attemptsRemaining);
      return {
        kind: 'wrongCode',
        ...(Number.isFinite(left) && left > 0 ? { attemptsRemaining: Math.floor(left) } : {}),
      };
    }
    case 'code_expired':
      return { kind: 'expiredCode' };
    case 'too_many_attempts':
      return { kind: 'tooManyAttempts' };
    case 'rate_limited':
      return { kind: 'rateLimited', retryAfterSeconds: retry };
    case 'resend_too_soon':
      return { kind: 'resendTooSoon', retryAfterSeconds: retry };
    case 'already_registered':
      return { kind: 'alreadyRegistered' };
    default:
      return error.status === 429
        ? { kind: 'rateLimited', retryAfterSeconds: retry }
        : { kind: 'generic' };
  }
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The text to show for a failure, in the user's language (keys live in auth.json `verify.errors`). */
export function registrationErrorMessage(view: RegistrationErrorView, t: Translate): string {
  switch (view.kind) {
    case 'wrongCode':
      return view.attemptsRemaining
        ? t('verify.errors.wrongCodeLeft', { count: view.attemptsRemaining })
        : t('verify.errors.wrongCode');
    case 'expiredCode':
      return t('verify.errors.expiredCode');
    case 'tooManyAttempts':
      return t('verify.errors.tooManyAttempts');
    case 'rateLimited': {
      const wait = view.retryAfterSeconds;
      if (!wait) {
        return t('verify.errors.rateLimited');
      }
      return wait >= 120
        ? t('verify.errors.rateLimitedMinutes', { minutes: Math.ceil(wait / 60) })
        : t('verify.errors.rateLimitedSeconds', { seconds: wait });
    }
    case 'resendTooSoon':
      return t('verify.errors.resendTooSoon', { seconds: view.retryAfterSeconds ?? 30 });
    case 'alreadyRegistered':
      return t('verify.errors.alreadyRegistered');
    case 'network':
      return t('verify.errors.network');
    default:
      return t('verify.errors.generic');
  }
}

// ----------------------------------------------------- in-memory sign-up state

export type PendingRegistrationView = {
  signupId: string;
  email: string;
  /** When the next code may be requested (ms since epoch). */
  resendAvailableAtMs: number;
};

// Held in memory only. The password is never kept here or on the phone; if the app is
// closed the person simply starts again.
let pending: PendingRegistrationView | null = null;

export function stageRegistrationVerification(input: {
  signupId: string;
  email: string;
  resendAfterSeconds: number;
  nowMs?: number;
}): void {
  pending = {
    signupId: input.signupId,
    email: input.email.trim().toLowerCase(),
    resendAvailableAtMs: (input.nowMs ?? Date.now()) + Math.max(input.resendAfterSeconds, 0) * 1000,
  };
}

export function readRegistrationVerification(): PendingRegistrationView | null {
  return pending;
}

export function clearRegistrationVerification(): void {
  pending = null;
}

/** Whole seconds left until `targetMs`, never below zero. */
export function secondsUntil(targetMs: number, nowMs: number = Date.now()): number {
  return Math.max(Math.ceil((targetMs - nowMs) / 1000), 0);
}

export function normalizeCodeInput(text: string): string {
  return text.replace(/\D/g, '').slice(0, 6);
}
