const SETUP_CIRCLE_STATUSES = new Set(['draft', 'setup', 'forming']);

/** List/badge lifecycle (distinct paused/closed — never collapsed into active). */
export type CircleListLifecycle =
  | 'setup'
  | 'active'
  | 'paused'
  | 'closed'
  | 'completed';

/** Classification for persisted circle summaries returned by the backend. */
export function isSetupCircleStatus(status: string | null | undefined): boolean {
  return SETUP_CIRCLE_STATUSES.has(String(status || '').trim().toLowerCase());
}

export function normalizeCircleStatus(
  status: string | null | undefined,
): string {
  return String(status || '')
    .trim()
    .toLowerCase();
}

/**
 * Badge / grouping lifecycle for dashboard and My Circles.
 * paused and closed remain distinct; never mapped to active.
 */
export function getCircleListLifecycle(
  status: string | null | undefined,
  potStatus?: string | null | undefined,
): CircleListLifecycle {
  const s = normalizeCircleStatus(status);
  const pot = normalizeCircleStatus(potStatus);
  if (s === 'completed' || pot === 'completed') {
    return 'completed';
  }
  if (s === 'paused') {
    return 'paused';
  }
  if (s === 'closed') {
    return 'closed';
  }
  if (s === 'active') {
    return 'active';
  }
  if (SETUP_CIRCLE_STATUSES.has(s) || !s) {
    return 'setup';
  }
  return 'active';
}

export function isActiveCircleStatus(
  status: string | null | undefined,
  potStatus?: string | null | undefined,
): boolean {
  return getCircleListLifecycle(status, potStatus) === 'active';
}

export function isPausedCircleStatus(status: string | null | undefined): boolean {
  return normalizeCircleStatus(status) === 'paused';
}

export function isClosedCircleStatus(status: string | null | undefined): boolean {
  return normalizeCircleStatus(status) === 'closed';
}

export function isCompletedCircleStatus(
  status: string | null | undefined,
  potStatus?: string | null | undefined,
): boolean {
  return getCircleListLifecycle(status, potStatus) === 'completed';
}

/** Short badge label for list cards (English product copy). */
export function circleLifecycleBadgeLabel(
  status: string | null | undefined,
  potStatus?: string | null | undefined,
): string {
  switch (getCircleListLifecycle(status, potStatus)) {
    case 'setup':
      return 'Setup';
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'closed':
      return 'Closed';
    case 'completed':
      return 'Completed';
    default:
      return 'Setup';
  }
}

export function getViewerPayoutPosition(
  detail: {
    members?: ReadonlyArray<{ id: string; userId?: string | null }> | null;
    turnOrder?: ReadonlyArray<string> | null;
  },
  userId: string,
): number | null {
  const members = Array.isArray(detail.members) ? detail.members : [];
  const turnOrder = Array.isArray(detail.turnOrder) ? detail.turnOrder : [];
  const ordered = [...members].sort((a, b) => {
    const posA = turnOrder.indexOf(a.id);
    const posB = turnOrder.indexOf(b.id);
    return (posA === -1 ? 9999 : posA) - (posB === -1 ? 9999 : posB);
  });
  const viewerIndex = ordered.findIndex((member) => member.userId === userId);
  return viewerIndex === -1 ? null : viewerIndex + 1;
}
