import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getEntitlements } from './api';
import { useAuthSession } from './authContext';
import {
  freeEntitlements,
  hasCapability,
  isPremiumPlan,
  planTierFromEntitlements,
  type EntitlementCapabilities,
  type Entitlements,
} from './entitlements';

type EntitlementsStatus = 'idle' | 'loading' | 'ready' | 'error';

type EntitlementsContextValue = {
  entitlements: Entitlements;
  status: EntitlementsStatus;
  isPremium: boolean;
  refreshEntitlements: () => Promise<Entitlements>;
  hasCapability: (capability: keyof EntitlementCapabilities) => boolean;
  planTier: 'free' | 'premium';
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { session, status: authStatus } = useAuthSession();
  const token = session?.session.token;
  const [entitlements, setEntitlements] = useState<Entitlements>(freeEntitlements());
  const [status, setStatus] = useState<EntitlementsStatus>('idle');
  const appState = useRef(AppState.currentState);

  const refreshEntitlements = useCallback(async () => {
    const accessToken = String(token ?? '').trim();
    if (!accessToken || authStatus !== 'authenticated') {
      const free = freeEntitlements();
      setEntitlements(free);
      setStatus('idle');
      return free;
    }

    setStatus('loading');
    try {
      const next = await getEntitlements(accessToken);
      setEntitlements(next);
      setStatus('ready');
      return next;
    } catch {
      // Fail closed to free — never keep a stale Premium unlock.
      const free = freeEntitlements();
      setEntitlements(free);
      setStatus('error');
      return free;
    }
  }, [authStatus, token]);

  // Load on login / session change.
  useEffect(() => {
    if (authStatus === 'authenticated' && token) {
      void refreshEntitlements();
      return;
    }
    setEntitlements(freeEntitlements());
    setStatus(authStatus === 'loading' ? 'loading' : 'idle');
  }, [authStatus, token, refreshEntitlements]);

  // Refresh when app returns to foreground.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        next === 'active' &&
        authStatus === 'authenticated' &&
        token
      ) {
        void refreshEntitlements();
      }
      appState.current = next;
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [authStatus, token, refreshEntitlements]);

  const value = useMemo<EntitlementsContextValue>(
    () => ({
      entitlements,
      status,
      isPremium: isPremiumPlan(entitlements),
      refreshEntitlements,
      hasCapability: (capability) => hasCapability(entitlements, capability),
      planTier: planTierFromEntitlements(entitlements),
    }),
    [entitlements, refreshEntitlements, status],
  );

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export function useEntitlements() {
  const context = useContext(EntitlementsContext);
  if (!context) {
    throw new Error('useEntitlements must be used inside EntitlementsProvider.');
  }
  return context;
}
