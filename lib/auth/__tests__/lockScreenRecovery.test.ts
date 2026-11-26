import { ApiError } from '../../platform/networkErrors';
import {
  acknowledgePasswordResetCodeEntry,
  openExistingRecoveryCode,
  passwordResetPhase,
  readFreshPasswordResetCodeEntry,
  stagePasswordResetCodeEntry,
} from '../passwordResetEntry';
import {
  continueLockScreenRecovery,
  requestLockScreenRecovery,
} from '../lockScreenRecovery';

function deps(overrides: {
  requestPasswordReset?: (input: { email: string }) => Promise<{ accepted: boolean }>;
} = {}) {
  const requestPasswordReset = jest.fn(
    overrides.requestPasswordReset ?? (async () => ({ accepted: true })),
  );
  const stage = jest.fn();
  const signOut = jest.fn(async () => undefined);
  return { requestPasswordReset, stagePasswordResetCodeEntry: stage, signOut };
}

afterEach(() => {
  acknowledgePasswordResetCodeEntry();
});

describe('lock screen password recovery', () => {
  it('emails a code, stages the code step and then signs out', async () => {
    const d = deps();
    const outcome = await continueLockScreenRecovery({ email: ' Member@Example.com ', ...d });

    expect(outcome).toBe('ready');
    expect(d.requestPasswordReset).toHaveBeenCalledWith({ email: 'Member@Example.com' });
    expect(d.stagePasswordResetCodeEntry).toHaveBeenCalledWith('Member@Example.com');
    expect(d.signOut).toHaveBeenCalledTimes(1);
    // Staging happens before the sign-out so login opens on the code step.
    expect(d.stagePasswordResetCodeEntry.mock.invocationCallOrder[0]).toBeLessThan(
      d.signOut.mock.invocationCallOrder[0],
    );
  });

  it('hands the login screen the code step for the same email', async () => {
    const outcome = await requestLockScreenRecovery({
      email: 'Member@Example.com',
      requestPasswordReset: async () => ({ accepted: true }),
      stagePasswordResetCodeEntry,
    });

    expect(outcome).toBe('ready');
    const staged = readFreshPasswordResetCodeEntry();
    expect(staged?.email).toBe('member@example.com');
    // Login shows the code step, not another email request.
    expect(passwordResetPhase({ codeEntryReady: true, codeVerified: false })).toBe('code');
    expect(openExistingRecoveryCode({ email: staged?.email ?? '' })).toEqual({
      codeEntryReady: true,
    });
  });

  it.each([
    ['a missing email', null, undefined, 'no_email'],
    ['a rejected request', 'a@b.co', async () => ({ accepted: false }), 'failed'],
    [
      'rate limiting',
      'a@b.co',
      async () => {
        throw new ApiError('slow down', 429, undefined, { category: 'http_429' });
      },
      'rate_limited',
    ],
    [
      'being offline',
      'a@b.co',
      async () => {
        throw new ApiError('offline', 0, undefined, { category: 'offline' });
      },
      'network',
    ],
    [
      'a server error',
      'a@b.co',
      async () => {
        throw new ApiError('boom', 500, undefined, { category: 'http_5xx' });
      },
      'failed',
    ],
    [
      'an unexpected error',
      'a@b.co',
      async () => {
        throw new Error('weird');
      },
      'failed',
    ],
  ])('leaves the app locked after %s', async (_name, email, request, expected) => {
    const d = deps(request ? { requestPasswordReset: request } : {});
    const outcome = await continueLockScreenRecovery({ email, ...d });

    expect(outcome).toBe(expected);
    expect(d.signOut).not.toHaveBeenCalled();
    expect(d.stagePasswordResetCodeEntry).not.toHaveBeenCalled();
    expect(readFreshPasswordResetCodeEntry()).toBeNull();
  });

});
