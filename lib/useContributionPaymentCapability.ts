import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useEntitlements } from './entitlementsContext';

export type ContributionPaymentCapabilityState =
  | 'pending'
  | 'enabled'
  | 'disabled';

export function useContributionPaymentCapability() {
  const {
    refreshContributionPaymentsCapability,
    revokeContributionPaymentsCapability,
  } = useEntitlements();
  const [state, setState] =
    useState<ContributionPaymentCapabilityState>('pending');

  const resolveCapability = useCallback(async () => {
    try {
      return await refreshContributionPaymentsCapability();
    } catch {
      return false;
    }
  }, [refreshContributionPaymentsCapability]);

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
    state,
    enabled: state === 'enabled',
    preflight: refresh,
    revoke,
  };
}
