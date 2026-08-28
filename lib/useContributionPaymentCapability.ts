import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { shouldLoadAuthenticatedScreen } from './activityAuthGate';
import { useAuthSession } from './authContext';
import { useEntitlements } from './entitlementsContext';

export type ContributionPaymentCapabilityState =
  | 'pending'
  | 'enabled'
  | 'disabled';

export function useContributionPaymentCapability() {
  const { session, status } = useAuthSession();
  const {
    refreshContributionPaymentsCapability,
    revokeContributionPaymentsCapability,
  } = useEntitlements();
  const [state, setState] =
    useState<ContributionPaymentCapabilityState>('pending');
  const moneyAvailable = shouldLoadAuthenticatedScreen({
    status,
    token: session?.session.token,
  });

  const resolveCapability = useCallback(async () => {
    if (!shouldLoadAuthenticatedScreen({ status, token: session?.session.token })) {
      revokeContributionPaymentsCapability();
      return false;
    }
    try {
      return await refreshContributionPaymentsCapability();
    } catch {
      return false;
    }
  }, [
    refreshContributionPaymentsCapability,
    revokeContributionPaymentsCapability,
    session?.session.token,
    status,
  ]);

  const refresh = useCallback(async () => {
    setState('pending');
    const enabled = await resolveCapability();
    setState(enabled ? 'enabled' : 'disabled');
    return enabled;
  }, [resolveCapability]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setState('pending');
      void resolveCapability().then((enabled) => {
        if (active) {
          setState(enabled ? 'enabled' : 'disabled');
        }
      });
      return () => {
        active = false;
      };
    }, [resolveCapability]),
  );

  const revoke = useCallback(() => {
    revokeContributionPaymentsCapability();
    setState('disabled');
  }, [revokeContributionPaymentsCapability]);

  return {
    state: moneyAvailable ? state : 'disabled',
    enabled: moneyAvailable && state === 'enabled',
    preflight: refresh,
    revoke,
  };
}
