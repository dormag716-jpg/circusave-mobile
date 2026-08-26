import { ApiError } from '../api';
import { logClientError, logClientWarning, sanitizeLogMessage } from '../errorLogging';

describe('production error logging sanitization', () => {
  const originalError = console.error;
  const originalWarn = console.warn;

  afterEach(() => {
    console.error = originalError;
    console.warn = originalWarn;
  });

  it('redacts provider secrets in error messages', () => {
    const secret = `sk_live_${'n'.repeat(20)}`;
    expect(sanitizeLogMessage(`failed ${secret}`)).toBe('failed [redacted]');
    expect(sanitizeLogMessage(`Bearer tok_${'x'.repeat(24)}`)).toBe('[redacted]');
  });

  it('never logs ApiError payload objects', () => {
    const calls: unknown[][] = [];
    console.error = ((...args: unknown[]) => {
      calls.push(args);
    }) as typeof console.error;

    const secret = `sk_test_${'p'.repeat(20)}`;
    logClientError(
      'Unable to load linked accounts',
      new ApiError(`provider ${secret}`, 502, {
        client_secret: 'cs_test_should_not_appear',
        email: 'member@example.com',
      }),
      { email: 'member@example.com', circleId: 'circle-1' },
    );

    expect(calls).toHaveLength(1);
    const serialized = JSON.stringify(calls[0]);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('cs_test_should_not_appear');
    expect(serialized).not.toContain('member@example.com');
    expect(serialized).toContain('[redacted]');
    expect(serialized).toContain('circle-1');
    expect(calls[0][1]).toEqual(
      expect.objectContaining({
        status: 502,
        circleId: 'circle-1',
      }),
    );
    expect(calls[0][1]).not.toHaveProperty('payload');
  });

  it('sanitizes warning messages the same way', () => {
    const calls: unknown[][] = [];
    console.warn = ((...args: unknown[]) => {
      calls.push(args);
    }) as typeof console.warn;

    const secret = `whsec_${'q'.repeat(20)}`;
    logClientWarning('push registration failed', new Error(`denied ${secret}`));
    expect(JSON.stringify(calls)).not.toContain(secret);
    expect(JSON.stringify(calls)).toContain('[redacted]');
  });
});
