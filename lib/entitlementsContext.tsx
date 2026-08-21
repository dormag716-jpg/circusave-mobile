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

import {
  getEntitlements,
  getFreshContributionPaymentsCapability,
} from './api';
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
  refreshContributionPaymentsCapability: () => Promise<boolean>;
  revokeContributionPaymentsCapability: () => void;
  hasCapability: (capability: keyof EntitlementCapabilities) => boolean;
  planTier: 'free' | 'premium';
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);
const CONTRIBUTION_CAPABILITY_TIMEOUT_MS = 5000;

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { session, status: authStatus } = useAuthSession();
  const token = session?.session.token;
  const [entitlements, setEntitlements] = useState<Entitlements>(freeEntitlements());
  const [status, setStatus] = useState<EntitlementsStatus>('idle');
  const appState = useRef(AppState.currentState);

  const setContributionPaymentsCapability = useCallback((enabled: boolean) => {
    setEntitlements((current) => ({
      ...current,
      capabilities: {
        ...current.capabilities,
        contributionPaymentsEnabled: enabled,
      },
    }));
  }, []);

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

  const refreshContributionPaymentsCapability = useCallback(async () => {
    const accessToken = String(token ?? '').trim();
    if (!accessToken || authStatus !== 'authenticated') {
      setContributionPaymentsCapability(false);
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      CONTRIBUTION_CAPABILITY_TIMEOUT_MS,
    );
    try {
      const enabled = await getFreshContributionPaymentsCapability(
        accessToken,
        controller.signal,
      );
      setContributionPaymentsCapability(enabled);
      return enabled;
    } catch {
      setContributionPaymentsCapability(false);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }, [
    authStatus,
    setContributionPaymentsCapability,
    token,
  ]);

  const revokeContributionPaymentsCapability = useCallback(() => {
    setContributionPaymentsCapability(false);
  }, [setContributionPaymentsCapability]);

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
      refreshContributionPaymentsCapability,
      revokeContributionPaymentsCapability,
      hasCapability: (capability) => hasCapability(entitlements, capability),
      planTier: planTierFromEntitlements(entitlements),
    }),
    [
      entitlements,
      refreshContributionPaymentsCapability,
      refreshEntitlements,
      revokeContributionPaymentsCapability,
      status,
    ],
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
