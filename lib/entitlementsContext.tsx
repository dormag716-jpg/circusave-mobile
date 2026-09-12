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
import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  getAuthoritativeEntitlements,
  getFreshContributionPaymentsCapability,
} from './api';
import { useAuthSession } from './authContext';
import { logClientWarning } from './errorLogging';
import {
  freeEntitlements,
  hasCapability,
  isPremiumPlan,
  planTierFromEntitlements,
  type EntitlementCapabilities,
  type Entitlements,
} from './entitlements';
import {
  createGooglePlayBillingMachine,
  type GooglePlayBillingState,
  type GooglePlayPlan,
  type GooglePlayPlanKey,
} from './googlePlayBillingMachine';

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
  googlePlayBillingState: GooglePlayBillingState;
  googlePlayPlans: Record<GooglePlayPlanKey, GooglePlayPlan> | null;
  initializeGooglePlayBilling: () => Promise<void>;
  purchaseGooglePlaySubscription: (plan: GooglePlayPlanKey) => Promise<void>;
  restoreGooglePlayPurchases: () => Promise<void>;
  retryGooglePlayCompletion: () => Promise<void>;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);
const CONTRIBUTION_CAPABILITY_TIMEOUT_MS = 5000;
export const GOOGLE_PLAY_RECONCILIATION_COOLDOWN_MS = 60_000;

type EntitlementRefreshFlight = {
  generation: number;
  promise: Promise<Entitlements>;
};

function isGooglePlayOperationActive(state: GooglePlayBillingState): boolean {
  return (
    state.status === 'connecting' ||
    state.status === 'loading_products' ||
    state.status === 'purchasing' ||
    state.status === 'pending' ||
    state.status === 'verifying' ||
    state.status === 'restoring'
  );
}

function shouldInitializeGooglePlay(state: GooglePlayBillingState): boolean {
  return (
    state.status === 'idle' ||
    state.status === 'disabled' ||
    state.status === 'unsupported' ||
    (state.status === 'failed' && state.operation === 'initialize')
  );
}

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { session, status: authStatus } = useAuthSession();
  const token = session?.session.token;
  const userId = session?.user.id;
  const [entitlements, setEntitlements] = useState<Entitlements>(freeEntitlements());
  const [status, setStatus] = useState<EntitlementsStatus>('idle');
  const [googlePlayBillingState, setGooglePlayBillingState] =
    useState<GooglePlayBillingState>({ status: 'idle' });
  const [googlePlayPlans, setGooglePlayPlans] = useState<Record<
    GooglePlayPlanKey,
    GooglePlayPlan
  > | null>(null);
  const appState = useRef(AppState.currentState);
  const sessionGeneration = useRef(0);
  const observedSession = useRef<{
    token: string | undefined;
    userId: string | undefined;
    status: typeof authStatus;
  } | null>(null);
  const entitlementRefreshFlight = useRef<EntitlementRefreshFlight | null>(
    null,
  );
  const contributionRefreshController = useRef<AbortController | null>(null);
  const entitlementOwnerUserId = useRef<string | null>(null);
  const billingMachine = useRef<
    ReturnType<typeof createGooglePlayBillingMachine> | null
  >(null);
  const billingMachineToken = useRef<string | null>(null);
  const billingUnsubscribe = useRef<(() => void) | null>(null);
  const billingLifecycleTail = useRef<Promise<void>>(Promise.resolve());
  const billingCreation = useRef<Promise<
    ReturnType<typeof createGooglePlayBillingMachine>
  > | null>(null);
  const foregroundReconciliation = useRef<Promise<void> | null>(null);
  const pendingForegroundReconciliation = useRef(false);
  const lastForegroundReconciliationAt = useRef<number | null>(null);
  const runForegroundReconciliationRef = useRef<() => Promise<void>>(
    async () => {},
  );

  const observed = observedSession.current;
  if (
    !observed ||
    observed.token !== token ||
    observed.userId !== userId ||
    observed.status !== authStatus
  ) {
    observedSession.current = { token, userId, status: authStatus };
    sessionGeneration.current += 1;
    entitlementRefreshFlight.current = null;
  }

  const setContributionPaymentsCapability = useCallback((enabled: boolean) => {
    setEntitlements((current) => ({
      ...current,
      capabilities: {
        ...current.capabilities,
        contributionPaymentsEnabled: enabled,
      },
    }));
  }, []);

  const refreshEntitlements = useCallback((): Promise<Entitlements> => {
    const observedAuth = observedSession.current;
    const accessToken = String(observedAuth?.token ?? '').trim();
    if (!accessToken || observedAuth?.status !== 'authenticated') {
      const free = freeEntitlements();
      setEntitlements(free);
      setStatus('idle');
      return Promise.resolve(free);
    }

    const generation = sessionGeneration.current;
    const existing = entitlementRefreshFlight.current;
    if (existing?.generation === generation) {
      return existing.promise;
    }
    setStatus('loading');
    const promise = getAuthoritativeEntitlements(accessToken)
      .then((next) => {
        if (generation !== sessionGeneration.current) {
          return freeEntitlements();
        }
        setEntitlements(next);
        setStatus('ready');
        return next;
      })
      .catch(() => {
        if (generation === sessionGeneration.current) {
          setStatus('error');
        }
        throw new Error('Unable to refresh entitlements.');
      })
      .finally(() => {
        if (entitlementRefreshFlight.current?.promise === promise) {
          entitlementRefreshFlight.current = null;
        }
      });
    entitlementRefreshFlight.current = { generation, promise };
    return promise;
  }, []);

  const queueBillingLifecycle = useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      const run = billingLifecycleTail.current.then(operation, operation);
      billingLifecycleTail.current = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    [],
  );

  const disposeGooglePlayBilling = useCallback(async () => {
    pendingForegroundReconciliation.current = false;
    foregroundReconciliation.current = null;
    lastForegroundReconciliationAt.current = null;
    const machine = billingMachine.current;
    billingMachine.current = null;
    billingMachineToken.current = null;
    billingCreation.current = null;
    billingUnsubscribe.current?.();
    billingUnsubscribe.current = null;
    setGooglePlayPlans(null);
    setGooglePlayBillingState({ status: 'idle' });
    if (machine) {
      await queueBillingLifecycle(() => machine.dispose());
    }
  }, [queueBillingLifecycle]);

  const ensureGooglePlayBillingMachine = useCallback(async () => {
    const observedAuth = observedSession.current;
    const accessToken = String(observedAuth?.token ?? '').trim();
    const generation = sessionGeneration.current;
    if (
      Platform.OS !== 'android' ||
      observedAuth?.status !== 'authenticated' ||
      !accessToken
    ) {
      throw new Error('Google Play billing is unavailable.');
    }
    if (
      billingMachine.current &&
      billingMachineToken.current === accessToken
    ) {
      return billingMachine.current;
    }
    if (billingCreation.current) {
      return billingCreation.current;
    }

    const creation = queueBillingLifecycle(async () => {
      if (
        generation !== sessionGeneration.current ||
        observedSession.current?.token !== accessToken
      ) {
        throw new Error('Google Play billing is unavailable.');
      }
      const previous = billingMachine.current;
      billingUnsubscribe.current?.();
      billingUnsubscribe.current = null;
      billingMachine.current = null;
      billingMachineToken.current = null;
      if (previous) {
        await previous.dispose();
      }
      if (
        generation !== sessionGeneration.current ||
        observedSession.current?.token !== accessToken
      ) {
        throw new Error('Google Play billing is unavailable.');
      }

      const machine = createGooglePlayBillingMachine({
        authToken: accessToken,
        api: { refreshEntitlements: () => refreshEntitlements() },
      });
      billingMachine.current = machine;
      billingMachineToken.current = accessToken;
      billingUnsubscribe.current = machine.subscribe((next) => {
        if (
          billingMachine.current !== machine ||
          generation !== sessionGeneration.current
        ) {
          return;
        }
        setGooglePlayBillingState(next);
        if (next.status === 'ready') {
          setGooglePlayPlans(next.plans);
        }
        if (
          pendingForegroundReconciliation.current &&
          !isGooglePlayOperationActive(next)
        ) {
          pendingForegroundReconciliation.current = false;
          queueMicrotask(() => {
            void runForegroundReconciliationRef.current();
          });
        }
      });
      return machine;
    }).finally(() => {
      if (billingCreation.current === creation) {
        billingCreation.current = null;
      }
    });
    billingCreation.current = creation;
    return creation;
  }, [queueBillingLifecycle, refreshEntitlements]);

  const initializeGooglePlayBilling = useCallback(async () => {
    const machine = await ensureGooglePlayBillingMachine();
    const current = machine.getState();
    if (shouldInitializeGooglePlay(current)) {
      await machine.initialize();
    }
  }, [ensureGooglePlayBillingMachine]);

  const purchaseGooglePlaySubscription = useCallback(
    async (plan: GooglePlayPlanKey) => {
      const machine = await ensureGooglePlayBillingMachine();
      await machine.purchase(plan);
    },
    [ensureGooglePlayBillingMachine],
  );

  const restoreGooglePlayPurchases = useCallback(async () => {
    const machine = await ensureGooglePlayBillingMachine();
    if (shouldInitializeGooglePlay(machine.getState())) {
      await machine.initialize();
    }
    const current = machine.getState();
    if (
      current.status === 'disabled' ||
      current.status === 'unsupported'
    ) {
      await refreshEntitlements();
      return;
    }
    if (
      current.status === 'failed' &&
      current.operation === 'initialize'
    ) {
      await refreshEntitlements();
      return;
    }
    await machine.restore();
  }, [ensureGooglePlayBillingMachine, refreshEntitlements]);

  const retryGooglePlayCompletion = useCallback(async () => {
    const machine = await ensureGooglePlayBillingMachine();
    await machine.retryCompletion();
  }, [ensureGooglePlayBillingMachine]);

  const runForegroundReconciliation = useCallback(async () => {
    const observedAuth = observedSession.current;
    if (
      Platform.OS !== 'android' ||
      observedAuth?.status !== 'authenticated' ||
      !String(observedAuth.token ?? '').trim()
    ) {
      return;
    }
    if (foregroundReconciliation.current) {
      return foregroundReconciliation.current;
    }
    const currentMachineState = billingMachine.current?.getState();
    if (
      currentMachineState &&
      isGooglePlayOperationActive(currentMachineState)
    ) {
      pendingForegroundReconciliation.current = true;
      return;
    }
    const now = Date.now();
    if (
      lastForegroundReconciliationAt.current !== null &&
      now - lastForegroundReconciliationAt.current <
        GOOGLE_PLAY_RECONCILIATION_COOLDOWN_MS
    ) {
      return;
    }
    lastForegroundReconciliationAt.current = now;

    const run = (async () => {
      const machine = await ensureGooglePlayBillingMachine();
      if (shouldInitializeGooglePlay(machine.getState())) {
        await machine.initialize();
      }
      const current = machine.getState();
      if (
        current.status === 'disabled' ||
        current.status === 'unsupported'
      ) {
        await refreshEntitlements();
        return;
      }
      if (
        current.status === 'failed' &&
        current.operation === 'initialize'
      ) {
        await refreshEntitlements();
        return;
      }
      if (isGooglePlayOperationActive(current)) {
        pendingForegroundReconciliation.current = true;
        return;
      }
      await machine.reconcile();
    })()
      .catch(() => {
        logClientWarning(
          'Google Play foreground reconciliation failed.',
          new Error('Google Play foreground reconciliation failed.'),
        );
      })
      .finally(() => {
        if (foregroundReconciliation.current === run) {
          foregroundReconciliation.current = null;
        }
      });
    foregroundReconciliation.current = run;
    return run;
  }, [ensureGooglePlayBillingMachine, refreshEntitlements]);
  runForegroundReconciliationRef.current = runForegroundReconciliation;

  const refreshContributionPaymentsCapability = useCallback(async () => {
    const observedAuth = observedSession.current;
    const accessToken = String(observedAuth?.token ?? '').trim();
    if (!accessToken || observedAuth?.status !== 'authenticated') {
      setContributionPaymentsCapability(false);
      return false;
    }

    const generation = sessionGeneration.current;
    contributionRefreshController.current?.abort();
    const controller = new AbortController();
    contributionRefreshController.current = controller;
    const timeout = setTimeout(
      () => controller.abort(),
      CONTRIBUTION_CAPABILITY_TIMEOUT_MS,
    );
    try {
      const enabled = await getFreshContributionPaymentsCapability(
        accessToken,
        controller.signal,
      );
      if (generation !== sessionGeneration.current) {
        return false;
      }
      setContributionPaymentsCapability(enabled);
      return enabled;
    } catch {
      if (generation === sessionGeneration.current) {
        setContributionPaymentsCapability(false);
      }
      return false;
    } finally {
      clearTimeout(timeout);
      if (contributionRefreshController.current === controller) {
        contributionRefreshController.current = null;
      }
    }
  }, [setContributionPaymentsCapability]);

  const revokeContributionPaymentsCapability = useCallback(() => {
    setContributionPaymentsCapability(false);
  }, [setContributionPaymentsCapability]);

  // Load on login / session change.
  useEffect(() => {
    const authenticatedUserId =
      authStatus === 'authenticated' && userId ? userId : null;
    if (
      authenticatedUserId &&
      entitlementOwnerUserId.current !== authenticatedUserId
    ) {
      contributionRefreshController.current?.abort();
      contributionRefreshController.current = null;
      entitlementOwnerUserId.current = authenticatedUserId;
      setEntitlements(freeEntitlements());
      setStatus('loading');
    } else if (authStatus === 'unauthenticated' || authStatus === 'error') {
      contributionRefreshController.current?.abort();
      contributionRefreshController.current = null;
      entitlementOwnerUserId.current = null;
    }
    if (
      billingMachine.current &&
      billingMachineToken.current !== String(token ?? '').trim()
    ) {
      void disposeGooglePlayBilling().catch(() => {
        logClientWarning(
          'Google Play billing cleanup failed.',
          new Error('Google Play billing cleanup failed.'),
        );
      });
    }
    if (authStatus === 'authenticated' && token) {
      void refreshEntitlements().catch(() => {
        logClientWarning(
          'Entitlement synchronization failed.',
          new Error('Entitlement synchronization failed.'),
        );
      });
      return;
    }
    entitlementRefreshFlight.current = null;
    setEntitlements(freeEntitlements());
    setStatus(authStatus === 'loading' ? 'loading' : 'idle');
    void disposeGooglePlayBilling().catch(() => {
      logClientWarning(
        'Google Play billing cleanup failed.',
        new Error('Google Play billing cleanup failed.'),
      );
    });
  }, [
    authStatus,
    disposeGooglePlayBilling,
    refreshEntitlements,
    token,
    userId,
  ]);

  useEffect(
    () => () => {
      sessionGeneration.current += 1;
      observedSession.current = null;
      entitlementRefreshFlight.current = null;
      contributionRefreshController.current?.abort();
      contributionRefreshController.current = null;
      pendingForegroundReconciliation.current = false;
      foregroundReconciliation.current = null;
      billingUnsubscribe.current?.();
      billingUnsubscribe.current = null;
      const machine = billingMachine.current;
      billingMachine.current = null;
      billingMachineToken.current = null;
      billingCreation.current = null;
      if (machine) {
        void queueBillingLifecycle(() => machine.dispose()).catch(() => {
          logClientWarning(
            'Google Play billing cleanup failed.',
            new Error('Google Play billing cleanup failed.'),
          );
        });
      }
    },
    [queueBillingLifecycle],
  );

  // One authenticated lifecycle owner handles both entitlement refresh and Play reconciliation.
  useEffect(() => {
    if (authStatus !== 'authenticated' || !token) {
      return undefined;
    }
    appState.current = AppState.currentState;
    const onChange = (next: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        next === 'active'
      ) {
        if (Platform.OS === 'android') {
          void runForegroundReconciliation();
        } else {
          void refreshEntitlements().catch(() => {
            logClientWarning(
              'Entitlement synchronization failed.',
              new Error('Entitlement synchronization failed.'),
            );
          });
        }
      }
      appState.current = next;
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [
    authStatus,
    refreshEntitlements,
    runForegroundReconciliation,
    token,
  ]);

  const sessionEntitlements = useMemo(
    () =>
      authStatus === 'authenticated' &&
      Boolean(userId) &&
      entitlementOwnerUserId.current === userId
        ? entitlements
        : freeEntitlements(),
    [authStatus, entitlements, userId],
  );

  const value = useMemo<EntitlementsContextValue>(
    () => ({
      entitlements: sessionEntitlements,
      status,
      isPremium: isPremiumPlan(sessionEntitlements),
      refreshEntitlements,
      refreshContributionPaymentsCapability,
      revokeContributionPaymentsCapability,
      hasCapability: (capability) =>
        hasCapability(sessionEntitlements, capability),
      planTier: planTierFromEntitlements(sessionEntitlements),
      googlePlayBillingState,
      googlePlayPlans,
      initializeGooglePlayBilling,
      purchaseGooglePlaySubscription,
      restoreGooglePlayPurchases,
      retryGooglePlayCompletion,
    }),
    [
      googlePlayBillingState,
      googlePlayPlans,
      initializeGooglePlayBilling,
      purchaseGooglePlaySubscription,
      refreshContributionPaymentsCapability,
      refreshEntitlements,
      restoreGooglePlayPurchases,
      retryGooglePlayCompletion,
      revokeContributionPaymentsCapability,
      sessionEntitlements,
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
