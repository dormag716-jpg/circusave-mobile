import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import type { Href } from 'expo-router';

import {
  logoutSession,
  persistAuthSession,
  restoreAuthSession,
} from './auth';
import type { AuthResponse } from './api';
import {
  flushPendingPushTokenUnregister,
  registerPushTokenForSession,
  unregisterPushTokenForLogout,
} from './pushTokenLifecycle';
import { bindUserPresentationCaches } from './userPresentationCaches';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

type AuthContextValue = {
  session: AuthResponse | null;
  status: AuthStatus;
  error: string | null;
  postAuthTarget: Href | null;
  setPostAuthTarget: (href: Href | null) => void;
  setAuthenticatedSession: (session: AuthResponse) => Promise<void>;
  refreshSession: () => Promise<AuthResponse | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function enqueueAuthTransition(
  tail: MutableRefObject<Promise<void>>,
  operation: () => Promise<void>,
): Promise<void> {
  const run = tail.current.then(operation, operation);
  tail.current = run.catch(() => undefined);
  return run;
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [postAuthTarget, setPostAuthTarget] = useState<Href | null>(null);
  const restoreGeneration = useRef(0);
  const authTransitionTail = useRef<Promise<void>>(Promise.resolve());

  const runRestore = useCallback(async (showLoading: boolean) => {
    const generation = ++restoreGeneration.current;
    if (showLoading) {
      setStatus('loading');
      setError(null);
    }

    try {
      const nextSession = await restoreAuthSession({
        onOptimistic: (localSession) => {
          if (generation !== restoreGeneration.current) {
            return;
          }
          bindUserPresentationCaches(localSession.user.id);
          setSession(localSession);
          setStatus('authenticated');
          setError(null);
        },
        shouldAbort: () => generation !== restoreGeneration.current,
      });
      if (generation !== restoreGeneration.current) {
        return nextSession;
      }
      bindUserPresentationCaches(nextSession?.user.id ?? null);
      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'unauthenticated');
      setError(null);
      return nextSession;
    } catch (refreshError) {
      if (generation !== restoreGeneration.current) {
        return null;
      }
      setStatus((current) =>
        current === 'authenticated' ? 'authenticated' : 'error',
      );
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Unable to verify the current session.',
      );
      return null;
    }
  }, []);

  const refreshSession = useCallback(() => runRestore(false), [runRestore]);

  useEffect(() => {
    void runRestore(true);
  }, [runRestore]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      status,
      error,
      postAuthTarget,
      setPostAuthTarget,
      setAuthenticatedSession: async (nextSession) => {
        return enqueueAuthTransition(authTransitionTail, async () => {
          restoreGeneration.current += 1;
          const nextAuthToken = String(nextSession.session.token || '').trim();
          try {
            await flushPendingPushTokenUnregister();
          } catch {
            // Authentication remains available while cleanup stays queued.
          }

          bindUserPresentationCaches(nextSession.user.id);
          await persistAuthSession(nextSession);
          setSession(nextSession);
          setStatus('authenticated');
          setError(null);

          if (nextAuthToken) {
            try {
              await registerPushTokenForSession(nextAuthToken);
            } catch {
              // Permission denial, offline registration, and provider failures are nonfatal.
            }
          }
        });
      },
      refreshSession,
      signOut: async () => {
        return enqueueAuthTransition(authTransitionTail, async () => {
          restoreGeneration.current += 1;
          const authToken = String(session?.session.token || '').trim();
          if (authToken) {
            try {
              await unregisterPushTokenForLogout(authToken);
            } catch {
              // The lifecycle writes its pending marker before the network request.
            }
          }
          try {
            await logoutSession();
          } catch {
            // Local logout is authoritative for device access when offline.
          } finally {
            bindUserPresentationCaches(null);
            setPostAuthTarget(null);
            setSession(null);
            setStatus('unauthenticated');
            setError(null);
          }
        });
      },
    }),
    [error, postAuthTarget, refreshSession, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthSession must be used inside AuthSessionProvider.');
  }
  return context;
}
