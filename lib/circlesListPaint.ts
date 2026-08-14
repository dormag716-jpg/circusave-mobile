import { getCircleListLifecycle } from './circleSummary';

/** First-paint enrichment only. Cards already render from the /groups summary. */
export const CIRCLES_LIST_DETAIL_LIMIT = 5;

const DETAIL_LIFECYCLE_ORDER = ['setup', 'active', 'paused', 'closed'] as const;

export function shouldUseSilentCirclesRefresh(
  hasLastKnownState: boolean,
): boolean {
  return hasLastKnownState === true;
}

/**
 * Fetch details for the first N list-ordered circles (setup, then active,
 * then paused, then closed). Later rows keep last-known details if any.
 */
export function selectCircleDetailTargets<
  T extends { status?: string | null; pot_status?: string | null },
>(summaries: T[], limit: number = CIRCLES_LIST_DETAIL_LIMIT): T[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const buckets: Record<(typeof DETAIL_LIFECYCLE_ORDER)[number], T[]> = {
    setup: [],
    active: [],
    paused: [],
    closed: [],
  };

  for (const circle of summaries) {
    const lifecycle = getCircleListLifecycle(circle.status, circle.pot_status);
    if (
      lifecycle === 'setup' ||
      lifecycle === 'active' ||
      lifecycle === 'paused' ||
      lifecycle === 'closed'
    ) {
      buckets[lifecycle].push(circle);
    }
  }

  return DETAIL_LIFECYCLE_ORDER.flatMap((lifecycle) => buckets[lifecycle]).slice(
    0,
    safeLimit,
  );
}

/** Drop details for circles that left the list; overlay this fetch's rows. */
export function mergeRetainedCircleDetails<T>(input: {
  current: Record<string, T>;
  incoming: Record<string, T>;
  circleIds: string[];
}): Record<string, T> {
  const keep = new Set(
    input.circleIds.map((id) => String(id || '').trim()).filter(Boolean),
  );
  const next: Record<string, T> = {};
  for (const [id, value] of Object.entries(input.current)) {
    if (keep.has(id)) {
      next[id] = value;
    }
  }
  for (const [id, value] of Object.entries(input.incoming)) {
    if (keep.has(id)) {
      next[id] = value;
    }
  }
  return next;
}
