import type { ReactNode } from 'react';

export function ContributionCapabilityGate({
  enabled,
  children,
}: {
  enabled: boolean;
  children?: ReactNode;
}) {
  return enabled ? children : null;
}
