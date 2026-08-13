/**
 * Dashboard first-paint and focus-refresh policy.
 * Empty "no circles" UI must not appear while a load is still pending.
 */

export function shouldUseSilentDashboardRefresh(hasLastKnownState: boolean): boolean {
  return hasLastKnownState;
}

export function shouldShowDashboardSkeleton(input: {
  loading: boolean;
  hasSnapshot: boolean;
}): boolean {
  return input.loading && !input.hasSnapshot;
}

export function shouldShowDashboardEmptyCircles(input: {
  hasSnapshot: boolean;
  activeCircleCount: number;
}): boolean {
  return input.hasSnapshot && input.activeCircleCount === 0;
}

/**
 * Reserve Pay/Review height after summary is known but before schedule
 * details arrive. Do not invent a Pay/Review CTA from the count alone.
 */
export function shouldReserveDashboardActionSlot(input: {
  detailsReady: boolean;
  pendingContributions: number;
}): boolean {
  return (
    !input.detailsReady &&
    Number.isFinite(input.pendingContributions) &&
    input.pendingContributions > 0
  );
}
