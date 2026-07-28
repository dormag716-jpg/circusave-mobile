/**
 * Activity load gate: logout / missing token must be quiet no-ops.
 * Mirrors behavior used by app/(tabs)/activity.tsx via shouldLoadActivity.
 */

import { shouldLoadActivity } from '../activityAuthGate';

type LoadFlags = {
  apiCalls: number;
  missingTokenLogs: number;
  setErrorCalls: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
};

/**
 * Minimal model of Activity loadActivity auth branch + authenticated fetch.
 * Used so node tests do not mount React Native screens.
 */
async function runLoadActivity(
  input: {
    status?: string;
    token?: string | null;
    isRefresh?: boolean;
    api?: () => Promise<void>;
  },
  flags: LoadFlags,
): Promise<void> {
  if (!shouldLoadActivity({ status: input.status, token: input.token })) {
    // Quiet path — matches Activity after fix
    flags.loading = false;
    flags.refreshing = false;
    return;
  }

  if (input.isRefresh) {
    flags.refreshing = true;
  } else {
    flags.loading = true;
  }
  flags.error = null;

  try {
    flags.apiCalls += 1;
    if (input.api) {
      await input.api();
    }
  } catch (err) {
    console.error('Unable to load activity', err);
    flags.setErrorCalls += 1;
    flags.error = 'loadActivity failed';
  } finally {
    flags.loading = false;
    flags.refreshing = false;
  }
}

function freshFlags(): LoadFlags {
  return {
    apiCalls: 0,
    missingTokenLogs: 0,
    setErrorCalls: 0,
    loading: true,
    refreshing: false,
    error: null,
  };
}

describe('shouldLoadActivity', () => {
  test('token present and authenticated -> load', () => {
    expect(
      shouldLoadActivity({ status: 'authenticated', token: 'tok_abc' }),
    ).toBe(true);
  });

  test('token missing on initial render -> no load', () => {
    expect(shouldLoadActivity({ status: 'unauthenticated', token: null })).toBe(
      false,
    );
    expect(shouldLoadActivity({ status: 'loading', token: undefined })).toBe(
      false,
    );
    expect(shouldLoadActivity({ token: '' })).toBe(false);
  });

  test('authenticated status without token -> no load', () => {
    expect(shouldLoadActivity({ status: 'authenticated', token: null })).toBe(
      false,
    );
  });

  test('token present but status unauthenticated -> no load (logout race)', () => {
    expect(
      shouldLoadActivity({ status: 'unauthenticated', token: 'stale' }),
    ).toBe(false);
  });
});

describe('Activity loadActivity logout race model', () => {
  test('token present -> activity API called', async () => {
    const flags = freshFlags();
    const api = jest.fn(async () => undefined);
    await runLoadActivity(
      { status: 'authenticated', token: 'tok_1', api },
      flags,
    );
    expect(api).toHaveBeenCalledTimes(1);
    expect(flags.apiCalls).toBe(1);
    expect(flags.error).toBeNull();
    expect(flags.loading).toBe(false);
  });

  test('token missing on initial render -> no API call', async () => {
    const flags = freshFlags();
    const api = jest.fn(async () => undefined);
    await runLoadActivity(
      { status: 'unauthenticated', token: undefined, api },
      flags,
    );
    expect(api).not.toHaveBeenCalled();
    expect(flags.apiCalls).toBe(0);
    expect(flags.error).toBeNull();
    expect(flags.loading).toBe(false);
  });

  test('token removed after render -> no second API call', async () => {
    const flags = freshFlags();
    const api = jest.fn(async () => undefined);

    await runLoadActivity(
      { status: 'authenticated', token: 'tok_1', api },
      flags,
    );
    expect(flags.apiCalls).toBe(1);

    await runLoadActivity(
      { status: 'unauthenticated', token: undefined, api },
      flags,
    );
    expect(flags.apiCalls).toBe(1);
    expect(api).toHaveBeenCalledTimes(1);
  });

  test('logout transition does not log missing access token', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const flags = freshFlags();
    await runLoadActivity(
      { status: 'unauthenticated', token: undefined },
      flags,
    );
    const missingLogs = errorSpy.mock.calls.filter((args) =>
      String(args[0] ?? '').includes('missing access token'),
    );
    expect(missingLogs).toHaveLength(0);
    errorSpy.mockRestore();
  });

  test('logout transition does not set Activity error state', async () => {
    const flags = freshFlags();
    flags.error = null;
    await runLoadActivity(
      { status: 'unauthenticated', token: null },
      flags,
    );
    expect(flags.error).toBeNull();
    expect(flags.setErrorCalls).toBe(0);
  });

  test('authenticated API failure still logs and shows error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const flags = freshFlags();
    await runLoadActivity(
      {
        status: 'authenticated',
        token: 'tok_1',
        api: async () => {
          throw new Error('network down');
        },
      },
      flags,
    );
    expect(flags.error).toBe('loadActivity failed');
    expect(flags.setErrorCalls).toBe(1);
    expect(
      errorSpy.mock.calls.some((args) =>
        String(args[0] ?? '').includes('Unable to load activity'),
      ),
    ).toBe(true);
    errorSpy.mockRestore();
  });

  test('loading/refreshing flags stop safely when token disappears', async () => {
    const flags = freshFlags();
    flags.loading = true;
    flags.refreshing = true;
    await runLoadActivity(
      { status: 'unauthenticated', token: undefined, isRefresh: true },
      flags,
    );
    expect(flags.loading).toBe(false);
    expect(flags.refreshing).toBe(false);
  });
});
