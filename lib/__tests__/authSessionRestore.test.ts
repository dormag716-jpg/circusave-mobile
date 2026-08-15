import { ApiError, type AuthResponse } from '../api';
import {
  evaluateStoredAuthSession,
  isInvalidAuthSessionError,
  publicAuthStatusFromRestorePhase,
  resolveAuthSessionVerifyFailure,
  runAuthSessionRestore,
  runLogoutSession,
  shouldOptimisticRestore,
} from '../authSessionRestore';
import {
  getHttpGetCachePolicy,
  shouldUseHttpGetCache,
} from '../httpGetCache';

const NOW = Date.parse('2026-08-13T12:00:00.000Z');

function validSession(overrides?: {
  expiresAt?: string;
  token?: string;
  userId?: string;
}): AuthResponse {
  return {
    user: {
      id: overrides?.userId ?? 'usr_1',
      name: 'Ada',
      email: 'ada@example.com',
      role: 'member',
      created_at: '2026-01-01T00:00:00Z',
      last_login_at: null,
    },
    session: {
      id: 'sess_1',
      user_id: 'usr_1',
      token_type: 'Bearer',
      token: overrides?.token ?? 'tok_live',
      created_at: '2026-01-01T00:00:00Z',
      expires_at: overrides?.expiresAt ?? '2026-08-14T12:00:00.000Z',
    },
  };
}

function remoteSession(token?: string): AuthResponse {
  const session = validSession({ token: token ?? 'tok_remote' });
  return {
    user: { ...session.user, name: 'Ada Verified' },
    session: {
      ...session.session,
      expires_at: '2026-08-20T12:00:00.000Z',
      token,
    },
  };
}

describe('stored session evaluation', () => {
  it('accepts a structurally valid, unexpired session for optimistic restore', () => {
    const evaluation = evaluateStoredAuthSession(validSession(), NOW);
    expect(evaluation).toEqual({ ok: true, session: validSession() });
    expect(shouldOptimisticRestore(evaluation)).toBe(true);
    expect(publicAuthStatusFromRestorePhase('authenticated-local')).toBe(
      'authenticated',
    );
  });

  it('does not optimistically authenticate an expired stored session', () => {
    const evaluation = evaluateStoredAuthSession(
      validSession({ expiresAt: '2026-08-13T11:59:59.000Z' }),
      NOW,
    );
    expect(evaluation).toEqual({ ok: false, reason: 'expired' });
    expect(shouldOptimisticRestore(evaluation)).toBe(false);
    expect(publicAuthStatusFromRestorePhase('unauthenticated')).toBe(
      'unauthenticated',
    );
  });

  it('does not optimistically authenticate a malformed stored session', () => {
    expect(evaluateStoredAuthSession('not-json', NOW)).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(
      evaluateStoredAuthSession({ user: { id: 'usr_1' }, session: {} }, NOW),
    ).toEqual({ ok: false, reason: 'malformed' });
    expect(
      evaluateStoredAuthSession(
        validSession({ token: '', expiresAt: 'not-a-date' }),
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'malformed' });
    expect(
      evaluateStoredAuthSession(
        validSession({ expiresAt: 'not-a-date' }),
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'malformed' });
    expect(evaluateStoredAuthSession(null, NOW)).toEqual({
      ok: false,
      reason: 'missing',
    });
  });
});

describe('optimistic restore + /auth/session verification', () => {
  it('paints authenticated-local before /auth/session finishes', async () => {
    const stored = validSession();
    let resolveVerify: (value: AuthResponse) => void = () => {};
    const verifyRemote = jest.fn(
      () =>
        new Promise<AuthResponse>((resolve) => {
          resolveVerify = resolve;
        }),
    );
    const persist = jest.fn(async (session: AuthResponse) => session);
    let paintedResolver: (session: AuthResponse) => void = () => {};
    const paintedLocal = new Promise<AuthResponse>((resolve) => {
      paintedResolver = resolve;
    });

    const pending = runAuthSessionRestore({
      readStored: async () => stored,
      clearStored: jest.fn(async () => undefined),
      persist,
      verifyRemote,
      now: NOW,
      onOptimistic: (session) => {
        paintedResolver(session);
      },
    });

    const painted = await paintedLocal;
    expect(painted.session.token).toBe('tok_live');
    expect(verifyRemote).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
    expect(publicAuthStatusFromRestorePhase('authenticated-local')).toBe(
      'authenticated',
    );

    resolveVerify(remoteSession());
    const verified = await pending;

    expect(persist).toHaveBeenCalledTimes(1);
    expect(verified?.user.name).toBe('Ada Verified');
    expect(verified?.session.token).toBe('tok_live');
    expect(publicAuthStatusFromRestorePhase('authenticated-verified')).toBe(
      'authenticated',
    );
  });

  it('preserves the session after a successful backend validation', async () => {
    const persist = jest.fn(async (session: AuthResponse) => session);
    const verified = await runAuthSessionRestore({
      readStored: async () => validSession(),
      clearStored: jest.fn(async () => undefined),
      persist,
      verifyRemote: async () => remoteSession(),
      now: NOW,
    });

    expect(verified?.session.token).toBe('tok_live');
    expect(verified?.session.expires_at).toBe('2026-08-20T12:00:00.000Z');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not call /auth/session for expired or malformed stored sessions', async () => {
    const verifyRemote = jest.fn(async () => remoteSession());
    const persist = jest.fn(async (session: AuthResponse) => session);
    const clearStored = jest.fn(async () => undefined);

    await expect(
      runAuthSessionRestore({
        readStored: async () =>
          validSession({ expiresAt: '2026-08-01T00:00:00.000Z' }),
        clearStored,
        persist,
        verifyRemote,
        now: NOW,
      }),
    ).resolves.toBeNull();

    await expect(
      runAuthSessionRestore({
        readStored: async () => ({ user: {}, session: {} }),
        clearStored,
        persist,
        verifyRemote,
        now: NOW,
      }),
    ).resolves.toBeNull();

    expect(verifyRemote).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(clearStored).toHaveBeenCalledTimes(2);
  });

  it('clears local session and signs out on 401', async () => {
    const clearStored = jest.fn(async () => undefined);
    const persist = jest.fn(async (session: AuthResponse) => session);
    const onOptimistic = jest.fn();

    await expect(
      runAuthSessionRestore({
        readStored: async () => validSession(),
        clearStored,
        persist,
        verifyRemote: async () => {
          throw new ApiError('Unauthorized', 401);
        },
        onOptimistic,
        now: NOW,
      }),
    ).resolves.toBeNull();

    expect(onOptimistic).toHaveBeenCalledTimes(1);
    expect(clearStored).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
    expect(isInvalidAuthSessionError(new ApiError('Forbidden', 403))).toBe(
      true,
    );
  });

  it('clears on 403 and session-invalid payloads', async () => {
    const clearStored = jest.fn(async () => undefined);

    await expect(
      runAuthSessionRestore({
        readStored: async () => validSession(),
        clearStored,
        persist: jest.fn(async (session) => session),
        verifyRemote: async () => {
          throw new ApiError('Forbidden', 403);
        },
        now: NOW,
      }),
    ).resolves.toBeNull();

    await expect(
      runAuthSessionRestore({
        readStored: async () => validSession(),
        clearStored,
        persist: jest.fn(async (session) => session),
        verifyRemote: async () => {
          throw new ApiError('Session gone', 409, { code: 'session_invalid' });
        },
        now: NOW,
      }),
    ).resolves.toBeNull();

    expect(clearStored).toHaveBeenCalledTimes(2);
  });

  it('keeps a still-valid local session on transient network failure without persisting', async () => {
    const persist = jest.fn(async (session: AuthResponse) => session);
    const clearStored = jest.fn(async () => undefined);
    const stored = validSession();

    const kept = await runAuthSessionRestore({
      readStored: async () => stored,
      clearStored,
      persist,
      verifyRemote: async () => {
        throw new Error('network down');
      },
      now: NOW,
    });

    expect(kept).toEqual(stored);
    expect(persist).not.toHaveBeenCalled();
    expect(clearStored).not.toHaveBeenCalled();
    expect(
      resolveAuthSessionVerifyFailure({
        stored,
        error: new Error('network down'),
        now: NOW,
      }),
    ).toEqual({ action: 'keep-local', session: stored });
  });

  it('does not grant expired access after a transient network failure', async () => {
    const expired = validSession({ expiresAt: '2026-08-13T00:00:00.000Z' });
    const persist = jest.fn(async (session: AuthResponse) => session);
    const verifyRemote = jest.fn(async () => {
      throw new Error('network down');
    });

    await expect(
      runAuthSessionRestore({
        readStored: async () => expired,
        clearStored: jest.fn(async () => undefined),
        persist,
        verifyRemote,
        now: NOW,
      }),
    ).resolves.toBeNull();

    expect(verifyRemote).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(
      resolveAuthSessionVerifyFailure({
        stored: expired,
        error: new Error('network down'),
        now: NOW,
      }),
    ).toEqual({ action: 'error' });
  });

  it('does not persist a late verify after logout abort', async () => {
    const persist = jest.fn(async (session: AuthResponse) => session);
    let resolveVerify: (value: AuthResponse) => void = () => {};
    let aborted = false;
    let verifyStartedResolver: () => void = () => {};
    const verifyStarted = new Promise<void>((resolve) => {
      verifyStartedResolver = resolve;
    });

    const pending = runAuthSessionRestore({
      readStored: async () => validSession(),
      clearStored: jest.fn(async () => undefined),
      persist,
      verifyRemote: () =>
        new Promise<AuthResponse>((resolve) => {
          resolveVerify = resolve;
          verifyStartedResolver();
        }),
      shouldAbort: () => aborted,
      now: NOW,
    });

    await verifyStarted;
    aborted = true;
    resolveVerify(remoteSession());
    await expect(pending).resolves.toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });
});

describe('logout clears local session', () => {
  it('clears stored session after a successful logout', async () => {
    const clearStored = jest.fn(async () => undefined);
    const logoutRemote = jest.fn(async () => undefined);

    await runLogoutSession({
      // runLogoutSession uses Date.now(); the default fixture expires 2026-08-14.
      readStored: async () =>
        validSession({ expiresAt: '2099-01-01T00:00:00.000Z' }),
      clearStored,
      logoutRemote,
    });

    expect(logoutRemote).toHaveBeenCalledWith('tok_live');
    expect(clearStored).toHaveBeenCalledTimes(1);
  });

  it('clears stored session even when the logout API returns 401', async () => {
    const clearStored = jest.fn(async () => undefined);

    await runLogoutSession({
      readStored: async () =>
        validSession({ expiresAt: '2099-01-01T00:00:00.000Z' }),
      clearStored,
      logoutRemote: async () => {
        throw new ApiError('Unauthorized', 401);
      },
    });

    expect(clearStored).toHaveBeenCalledTimes(1);
  });

  it('clears stored session when no usable local session remains', async () => {
    const clearStored = jest.fn(async () => undefined);
    const logoutRemote = jest.fn(async () => undefined);

    await runLogoutSession({
      readStored: async () => null,
      clearStored,
      logoutRemote,
    });

    expect(logoutRemote).not.toHaveBeenCalled();
    expect(clearStored).toHaveBeenCalledTimes(1);
  });
});

describe('/auth/session cache policy', () => {
  it('does not cache or dedupe /auth/session', () => {
    expect(getHttpGetCachePolicy('/auth/session')).toEqual({
      dedupe: false,
      persist: false,
    });
    expect(shouldUseHttpGetCache('GET', '/auth/session')).toBe(false);
  });
});
