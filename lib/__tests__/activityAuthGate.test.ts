/**
 * Authenticated-screen load gate: logout / missing token must be quiet no-ops.
 * Used by Activity, dashboard, circles, completed-circles, workspace, contribution.
 */

import {
  areMoneyActionsAvailable,
  shouldLoadActivity,
  shouldLoadAuthenticatedScreen,
} from '../activityAuthGate';

type LoadFlags = {
  apiCalls: number;
  setErrorCalls: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  consoleErrors: string[];
};

/**
 * Minimal model of an authenticated screen load branch + fetch.
 * Used so node tests do not mount React Native screens.
 */
async function runAuthenticatedLoad(
  input: {
    status?: string;
    token?: string | null;
    isRefresh?: boolean;
    api?: () => Promise<void>;
    /** When true, simulate legacy missing-token error path (for contrast). */
    legacyErrorOnMissing?: boolean;
  },
  flags: LoadFlags,
): Promise<void> {
  if (
    !shouldLoadAuthenticatedScreen({
      status: input.status,
      token: input.token,
    })
  ) {
    // Quiet path — matches fixed screens after logout cleanup
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
    console.error('Unable to load screen', err);
    flags.consoleErrors.push('Unable to load screen');
    flags.setErrorCalls += 1;
    flags.error = 'load failed';
  } finally {
    flags.loading = false;
    flags.refreshing = false;
  }
}

function freshFlags(): LoadFlags {
  return {
    apiCalls: 0,
    setErrorCalls: 0,
    loading: true,
    refreshing: false,
    error: null,
    consoleErrors: [],
  };
}

describe('shouldLoadAuthenticatedScreen', () => {
  test('token present and authenticated -> load', () => {
    expect(
      shouldLoadAuthenticatedScreen({
        status: 'authenticated',
        token: 'tok_abc',
      }),
    ).toBe(true);
  });

  test('token missing on initial render -> no load', () => {
    expect(
      shouldLoadAuthenticatedScreen({
        status: 'unauthenticated',
        token: null,
      }),
    ).toBe(false);
    expect(
      shouldLoadAuthenticatedScreen({ status: 'loading', token: undefined }),
    ).toBe(false);
    expect(shouldLoadAuthenticatedScreen({ token: '' })).toBe(false);
  });

  test('authenticated status without token -> no load', () => {
    expect(
      shouldLoadAuthenticatedScreen({
        status: 'authenticated',
        token: null,
      }),
    ).toBe(false);
  });

  test('token present but status unauthenticated -> no load (logout race)', () => {
    expect(
      shouldLoadAuthenticatedScreen({
        status: 'unauthenticated',
        token: 'stale',
      }),
    ).toBe(false);
  });

  test('money actions follow the same authenticated-token gate', () => {
    expect(
      areMoneyActionsAvailable({ status: 'authenticated', token: 'tok' }),
    ).toBe(true);
    expect(
      areMoneyActionsAvailable({ status: 'unauthenticated', token: 'tok' }),
    ).toBe(false);
  });

  test('shouldLoadActivity remains an alias', () => {
    expect(
      shouldLoadActivity({ status: 'authenticated', token: 't' }),
    ).toBe(true);
    expect(shouldLoadActivity({ status: 'unauthenticated', token: 't' })).toBe(
      false,
    );
  });
});

describe.each([
  'activity',
  'dashboard',
  'circles',
  'completed-circles',
  'workspace',
  'contribution',
] as const)('authenticated load model (%s)', (screen) => {
  test(`${screen}: authenticated + token → API called`, async () => {
    const flags = freshFlags();
    const api = jest.fn(async () => undefined);
    await runAuthenticatedLoad(
      { status: 'authenticated', token: 'tok_1', api },
      flags,
    );
    expect(api).toHaveBeenCalledTimes(1);
    expect(flags.apiCalls).toBe(1);
    expect(flags.error).toBeNull();
    expect(flags.loading).toBe(false);
  });

  test(`${screen}: missing token initially → no API call`, async () => {
    const flags = freshFlags();
    const api = jest.fn(async () => undefined);
    await runAuthenticatedLoad(
      { status: 'unauthenticated', token: undefined, api },
      flags,
    );
    expect(api).not.toHaveBeenCalled();
    expect(flags.apiCalls).toBe(0);
    expect(flags.error).toBeNull();
  });

  test(`${screen}: token removed after render → no second API call`, async () => {
    const flags = freshFlags();
    const api = jest.fn(async () => undefined);
    await runAuthenticatedLoad(
      { status: 'authenticated', token: 'tok_1', api },
      flags,
    );
    await runAuthenticatedLoad(
      { status: 'unauthenticated', token: undefined, api },
      flags,
    );
    expect(api).toHaveBeenCalledTimes(1);
    expect(flags.apiCalls).toBe(1);
  });

  test(`${screen}: logout transition → no console.error for missing token`, async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const flags = freshFlags();
    await runAuthenticatedLoad(
      { status: 'unauthenticated', token: undefined },
      flags,
    );
    const missingLogs = errorSpy.mock.calls.filter((args) =>
      /missing (access )?token|sessionMissing|session is missing/i.test(
        String(args[0] ?? ''),
      ),
    );
    expect(missingLogs).toHaveLength(0);
    errorSpy.mockRestore();
  });

  test(`${screen}: logout transition → no user-visible session error`, async () => {
    const flags = freshFlags();
    await runAuthenticatedLoad(
      { status: 'unauthenticated', token: null },
      flags,
    );
    expect(flags.error).toBeNull();
    expect(flags.setErrorCalls).toBe(0);
  });

  test(`${screen}: loading/refreshing stops when token disappears`, async () => {
    const flags = freshFlags();
    flags.loading = true;
    flags.refreshing = true;
    await runAuthenticatedLoad(
      { status: 'unauthenticated', token: undefined, isRefresh: true },
      flags,
    );
    expect(flags.loading).toBe(false);
    expect(flags.refreshing).toBe(false);
  });

  test(`${screen}: real authenticated API failure still shows error`, async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const flags = freshFlags();
    await runAuthenticatedLoad(
      {
        status: 'authenticated',
        token: 'tok_1',
        api: async () => {
          throw new Error('network down');
        },
      },
      flags,
    );
    expect(flags.error).toBe('load failed');
    expect(flags.setErrorCalls).toBe(1);
    expect(
      errorSpy.mock.calls.some((args) =>
        String(args[0] ?? '').includes('Unable to load screen'),
      ),
    ).toBe(true);
    errorSpy.mockRestore();
  });
});
