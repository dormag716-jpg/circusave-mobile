import { useCallback, useEffect, useRef, useState } from 'react';

import { createAppleBillingGateway } from './appleBilling';
import {
  createAppleBillingMachine,
  type AppleBillingMachine,
  type AppleBillingState,
} from './appleBillingMachine';
import type { Entitlements } from './entitlements';
import type { GooglePlayPlan, GooglePlayTierPlanKey } from './googlePlayBillingMachine';

/**
 * Apple (StoreKit 2) purchase state for the subscription screen. It does
 * nothing unless `enabled` (iPhone, signed in). Access always follows the
 * backend entitlement, never the store's local answer.
 */
export function useAppleBilling(options: {
  enabled: boolean;
  token: string | undefined;
  refreshEntitlements: () => Promise<Entitlements>;
}) {
  const { enabled, token, refreshEntitlements } = options;
  const [state, setState] = useState<AppleBillingState>({ status: 'idle' });
  const [plans, setPlans] = useState<Partial<Record<GooglePlayTierPlanKey, GooglePlayPlan>>>({});
  const machine = useRef<AppleBillingMachine | null>(null);
  const refreshRef = useRef(refreshEntitlements);
  refreshRef.current = refreshEntitlements;

  useEffect(() => {
    if (!enabled || !token) {
      setPlans({});
      setState({ status: 'idle' });
      return undefined;
    }
    const created = createAppleBillingMachine({
      authToken: token,
      gateway: createAppleBillingGateway(),
      refreshEntitlements: () => refreshRef.current(),
    });
    machine.current = created;
    const unsubscribe = created.subscribe((next) => {
      setState(next);
      if (next.status === 'ready') setPlans(next.plans);
    });
    void created.initialize();
    return () => {
      unsubscribe();
      machine.current = null;
      void created.dispose().catch(() => undefined);
    };
  }, [enabled, token]);

  const purchase = useCallback(
    (key: GooglePlayTierPlanKey) => machine.current?.purchase(key),
    [],
  );
  const restore = useCallback(() => machine.current?.restore(), []);
  const reload = useCallback(() => machine.current?.initialize(), []);
  const dismiss = useCallback(() => machine.current?.dismiss(), []);

  return { state, plans, purchase, restore, reload, dismiss };
}
