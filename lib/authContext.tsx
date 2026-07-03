import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Href } from 'expo-router';

import {
  bootstrapAuthSession,
  logoutSession,
  persistAuthSession,
} from './auth';
import type { AuthResponse } from './api';
import { registerPushToken } from './api';
import { registerForPushNotifications } from './notifications';

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

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [postAuthTarget, setPostAuthTarget] = useState<Href | null>(null);

  async function refreshSession() {
    setStatus('loading');
    setError(null);

    try {
      const nextSession = await bootstrapAuthSession();
      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'unauthenticated');
      return nextSession;
    } catch (refreshError) {
      setStatus('error');
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Unable to verify the current session.',
      );
      return null;
    }
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      status,
      error,
      postAuthTarget,
      setPostAuthTarget,
      setAuthenticatedSession: async (nextSession) => {
        await persistAuthSession(nextSession);
        setSession(nextSession);
        setStatus('authenticated');
        setError(null);

        // Register push token with the backend after every successful login.
        // Fire-and-forget: a failure here must never block the user from using the app.
        void (async () => {
          try {
            const result = await registerForPushNotifications();
            if (result.ok && result.token !== null && nextSession.session.token) {
              await registerPushToken(nextSession.session.token, result.token);
            }
          } catch {
            // Silent — push token registration is best-effort
          }
        })();
      },
      refreshSession,
      signOut: async () => {
        try {
          await logoutSession();
        } finally {
          setPostAuthTarget(null);
          setSession(null);
          setStatus('unauthenticated');
          setError(null);
        }
      },
    }),
    [error, postAuthTarget, session, status],
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
