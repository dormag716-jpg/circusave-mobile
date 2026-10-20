import { ApiError } from '@/lib/platform/networkErrors';
import {
  clearRegistrationVerification,
  describeRegistrationError,
  normalizeCodeInput,
  readRegistrationVerification,
  readVerificationRequired,
  registrationErrorMessage,
  secondsUntil,
  stageRegistrationVerification,
} from '../registrationVerification';

describe('readVerificationRequired', () => {
  it('reads the Backend response', () => {
    expect(
      readVerificationRequired({
        status: 'verification_required',
        signupId: 'sup_abc',
        expiresAt: '2026-10-19T12:10:00Z',
        resendAfterSeconds: 30,
      }),
    ).toEqual({
      status: 'verification_required',
      signupId: 'sup_abc',
      expiresAt: '2026-10-19T12:10:00Z',
      resendAfterSeconds: 30,
    });
  });

  it('keeps the development-only code but does not require it', () => {
    expect(
      readVerificationRequired({ status: 'verification_required', signupId: 's', devCode: '123456' })
        ?.devCode,
    ).toBe('123456');
  });

  it('defaults a missing or bad resend delay', () => {
    expect(
      readVerificationRequired({ status: 'verification_required', signupId: 's', resendAfterSeconds: 'x' })
        ?.resendAfterSeconds,
    ).toBe(30);
  });

  it('returns null for an older Backend that returns a session, or anything else', () => {
    expect(readVerificationRequired({ user: {}, session: {} })).toBeNull();
    expect(readVerificationRequired({ status: 'verification_required' })).toBeNull();
    expect(readVerificationRequired(null)).toBeNull();
    expect(readVerificationRequired([])).toBeNull();
  });
});

describe('describeRegistrationError', () => {
  it('maps every Backend reason', () => {
    expect(describeRegistrationError(new ApiError('x', 401, { reason: 'code_invalid', attemptsRemaining: 3 }))).toEqual({
      kind: 'wrongCode',
      attemptsRemaining: 3,
    });
    expect(describeRegistrationError(new ApiError('x', 401, { reason: 'code_invalid' }))).toEqual({
      kind: 'wrongCode',
    });
    expect(describeRegistrationError(new ApiError('x', 401, { reason: 'code_expired' }))).toEqual({
      kind: 'expiredCode',
    });
    expect(describeRegistrationError(new ApiError('x', 429, { reason: 'too_many_attempts' }))).toEqual({
      kind: 'tooManyAttempts',
    });
    expect(describeRegistrationError(new ApiError('x', 409, { reason: 'already_registered' }))).toEqual({
      kind: 'alreadyRegistered',
    });
  });

  it('carries the wait time for rate limits and early resends', () => {
    const limited = new ApiError('x', 429, { reason: 'rate_limited' }, { retryAfterSeconds: 90 });
    expect(describeRegistrationError(limited)).toEqual({ kind: 'rateLimited', retryAfterSeconds: 90 });
    const soon = new ApiError('x', 429, { reason: 'resend_too_soon' }, { retryAfterSeconds: 12 });
    expect(describeRegistrationError(soon)).toEqual({ kind: 'resendTooSoon', retryAfterSeconds: 12 });
  });

  it('treats an unlabelled 429 as rate limited and offline as a network problem', () => {
    expect(describeRegistrationError(new ApiError('x', 429)).kind).toBe('rateLimited');
    expect(describeRegistrationError(new ApiError('x', 0, undefined, { category: 'offline' })).kind).toBe(
      'network',
    );
    expect(describeRegistrationError(new ApiError('x', 0, undefined, { category: 'timeout' })).kind).toBe(
      'network',
    );
  });

  it('never exposes the server message for unknown failures', () => {
    expect(describeRegistrationError(new ApiError('Internal detail', 500))).toEqual({ kind: 'generic' });
    expect(describeRegistrationError(new Error('boom'))).toEqual({ kind: 'generic' });
  });
});

describe('pending sign-up state and countdown', () => {
  afterEach(() => clearRegistrationVerification());

  it('stores the sign-up id, a normalized email and when resend opens, and clears', () => {
    stageRegistrationVerification({
      signupId: 'sup_1',
      email: '  Person@Example.COM ',
      resendAfterSeconds: 30,
      nowMs: 1_000_000,
    });
    expect(readRegistrationVerification()).toEqual({
      signupId: 'sup_1',
      email: 'person@example.com',
      resendAvailableAtMs: 1_030_000,
    });
    clearRegistrationVerification();
    expect(readRegistrationVerification()).toBeNull();
  });

  it('counts down in whole seconds and never goes negative', () => {
    expect(secondsUntil(10_000, 1_000)).toBe(9);
    expect(secondsUntil(10_000, 9_500)).toBe(1);
    expect(secondsUntil(10_000, 10_000)).toBe(0);
    expect(secondsUntil(10_000, 20_000)).toBe(0);
  });

  it('keeps only up to six digits of the code', () => {
    expect(normalizeCodeInput('12 34-56789')).toBe('123456');
    expect(normalizeCodeInput('abc')).toBe('');
  });
});

describe('registrationErrorMessage', () => {
  const t = (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key;

  it('picks the right text and passes the numbers', () => {
    expect(registrationErrorMessage({ kind: 'wrongCode' }, t)).toBe('verify.errors.wrongCode');
    expect(registrationErrorMessage({ kind: 'wrongCode', attemptsRemaining: 2 }, t)).toBe(
      'verify.errors.wrongCodeLeft:{"count":2}',
    );
    expect(registrationErrorMessage({ kind: 'expiredCode' }, t)).toBe('verify.errors.expiredCode');
    expect(registrationErrorMessage({ kind: 'tooManyAttempts' }, t)).toBe('verify.errors.tooManyAttempts');
    expect(registrationErrorMessage({ kind: 'resendTooSoon', retryAfterSeconds: 12 }, t)).toBe(
      'verify.errors.resendTooSoon:{"seconds":12}',
    );
    expect(registrationErrorMessage({ kind: 'alreadyRegistered' }, t)).toBe('verify.errors.alreadyRegistered');
    expect(registrationErrorMessage({ kind: 'network' }, t)).toBe('verify.errors.network');
    expect(registrationErrorMessage({ kind: 'generic' }, t)).toBe('verify.errors.generic');
  });

  it('shows rate limits in seconds, in minutes for long waits, or generally', () => {
    expect(registrationErrorMessage({ kind: 'rateLimited', retryAfterSeconds: 45 }, t)).toBe(
      'verify.errors.rateLimitedSeconds:{"seconds":45}',
    );
    expect(registrationErrorMessage({ kind: 'rateLimited', retryAfterSeconds: 3000 }, t)).toBe(
      'verify.errors.rateLimitedMinutes:{"minutes":50}',
    );
    expect(registrationErrorMessage({ kind: 'rateLimited' }, t)).toBe('verify.errors.rateLimited');
  });
});
