import type { BackendCircleDetail, BackendRoundSnapshot } from './api';

/** Warm display hint only. Never financial authority. */
export const CIRCLE_WORKSPACE_CACHE_TTL_MS = 60_000;

const FINANCIAL_PERMISSION_KEYS = [
  'canApproveContributions',
  'canReleasePayout',
  'canRemindMembers',
  'canSubmitOwnContribution',
  'canRejectContributions',
] as const;

export type CircleWorkspaceCacheEntry = {
  circleId: string;
  storedAt: number;
  detail: BackendCircleDetail | null;
  schedule: BackendRoundSnapshot | null;
};

export type CircleWorkspacePresentation = {
  circleId: string;
  detail: BackendCircleDetail | null;
  schedule: BackendRoundSnapshot | null;
};

const store = new Map<string, CircleWorkspaceCacheEntry>();
let cacheUserId = '';

function normalizeCircleId(circleId: string | null | undefined): string {
  return String(circleId ?? '').trim();
}

function normalizeUserId(userId: string | null | undefined): string {
  return String(userId ?? '').trim();
}

export function circleWorkspaceCacheKey(
  circleId: string,
  userId: string = cacheUserId,
): string {
  const id = normalizeCircleId(circleId);
  const user = normalizeUserId(userId);
  if (!id || !user) {
    return '';
  }
  return `${user}:${id}`;
}

/** Isolate warm rows to the signed-in user. Changing users clears the map. */
export function bindCircleWorkspaceCacheUser(
  userId: string | null | undefined,
): void {
  const next = normalizeUserId(userId);
  if (next === cacheUserId) {
    return;
  }
  store.clear();
  cacheUserId = next;
}

export function clearCircleWorkspaceCache(): void {
  store.clear();
}

export function evictCircleWorkspaceCache(
  circleId: string,
  userId: string = cacheUserId,
): void {
  const key = circleWorkspaceCacheKey(circleId, userId);
  if (key) {
    store.delete(key);
  }
}

export function isCircleWorkspaceCacheExpired(
  storedAt: number,
  now: number = Date.now(),
  ttlMs: number = CIRCLE_WORKSPACE_CACHE_TTL_MS,
): boolean {
  return !Number.isFinite(storedAt) || now - storedAt > ttlMs;
}

/** Cached rows may paint the shell. They must never authorize financial actions. */
export function isWorkspaceCacheAuthoritativeForPermissions(): false {
  return false;
}

/** Workspace always revalidates detail/schedule from the backend. */
export function shouldRevalidateWorkspaceFromBackend(): true {
  return true;
}

/** Round first paint uses schedule/detail, not ledger. */
export function isLedgerRequiredForRoundPresentation(): false {
  return false;
}

export function stripCachedFinancialGrants(
  schedule: BackendRoundSnapshot,
): BackendRoundSnapshot {
  const workspace = schedule.roundWorkspace;
  const permissions = workspace?.viewerPermissions;
  if (!workspace || !permissions) {
    return schedule;
  }

  const stripped = { ...permissions };
  for (const key of FINANCIAL_PERMISSION_KEYS) {
    if (key in stripped) {
      (stripped as Record<string, boolean | undefined>)[key] = false;
    }
  }

  return {
    ...schedule,
    roundWorkspace: {
      ...workspace,
      viewerPermissions: stripped,
    },
  };
}

export function seedCircleWorkspaceCache(input: {
  circleId: string;
  detail?: BackendCircleDetail | null;
  schedule?: BackendRoundSnapshot | null;
  now?: number;
  userId?: string;
}): void {
  const circleId = normalizeCircleId(input.circleId);
  const key = circleWorkspaceCacheKey(circleId, input.userId ?? cacheUserId);
  if (!circleId || !key) {
    return;
  }

  const previous = store.get(key);
  const detail =
    input.detail !== undefined ? input.detail : previous?.detail ?? null;
  const schedule =
    input.schedule !== undefined ? input.schedule : previous?.schedule ?? null;

  store.set(key, {
    circleId,
    storedAt: input.now ?? Date.now(),
    detail,
    schedule,
  });
}

export function readCircleWorkspaceCache(
  circleId: string,
  options?: { now?: number; ttlMs?: number; userId?: string },
): CircleWorkspaceCacheEntry | null {
  const id = normalizeCircleId(circleId);
  const key = circleWorkspaceCacheKey(id, options?.userId ?? cacheUserId);
  if (!id || !key) {
    return null;
  }

  const entry = store.get(key);
  if (!entry) {
    return null;
  }

  if (
    isCircleWorkspaceCacheExpired(
      entry.storedAt,
      options?.now ?? Date.now(),
      options?.ttlMs ?? CIRCLE_WORKSPACE_CACHE_TTL_MS,
    )
  ) {
    store.delete(key);
    return null;
  }

  return entry;
}

/** Synchronous first-paint snapshot. Financial grants are always stripped. */
export function readCircleWorkspacePresentation(
  circleId: string,
  options?: { now?: number; ttlMs?: number; userId?: string },
): CircleWorkspacePresentation | null {
  const entry = readCircleWorkspaceCache(circleId, options);
  if (!entry) {
    return null;
  }

  return {
    circleId: entry.circleId,
    detail: entry.detail,
    schedule: entry.schedule
      ? stripCachedFinancialGrants(entry.schedule)
      : null,
  };
}

export function resetCircleWorkspaceCacheForTests(): void {
  store.clear();
  cacheUserId = '';
}
