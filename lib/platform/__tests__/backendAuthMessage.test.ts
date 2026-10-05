import {
  ApiError,
  backendAuthMessage,
  fallbackNetworkMessage,
} from '../networkErrors';

describe('backendAuthMessage', () => {
  it('returns the precise backend message for a 401 sign-in failure', () => {
    const error = new ApiError('Email or password is incorrect.', 401);
    expect(backendAuthMessage(error)).toBe('Email or password is incorrect.');
  });

  it('returns the backend message for a 4xx recovery-code failure', () => {
    const error = new ApiError('Verification code is invalid or expired.', 400);
    expect(backendAuthMessage(error)).toBe(
      'Verification code is invalid or expired.',
    );
  });

  it('returns null when only the generic fallback is available', () => {
    expect(
      backendAuthMessage(
        new ApiError(fallbackNetworkMessage('http_4xx'), 400),
      ),
    ).toBeNull();
  });

  it('returns null for offline, server and non-API errors', () => {
    expect(
      backendAuthMessage(
        new ApiError(fallbackNetworkMessage('offline'), 0, undefined, {
          category: 'offline',
        }),
      ),
    ).toBeNull();
    expect(backendAuthMessage(new ApiError('boom', 500))).toBeNull();
    expect(backendAuthMessage(new Error('x'))).toBeNull();
  });
});
