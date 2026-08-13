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

function normalizeCircleId(circleId: string | null | undefined): string {
  return String(circleId ?? '').trim();
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
}): void {
  const circleId = normalizeCircleId(input.circleId);
  if (!circleId) {
    return;
  }

  const previous = store.get(circleId);
  const detail =
    input.detail !== undefined ? input.detail : previous?.detail ?? null;
  const schedule =
    input.schedule !== undefined ? input.schedule : previous?.schedule ?? null;

  store.set(circleId, {
    circleId,
    storedAt: input.now ?? Date.now(),
    detail,
    schedule,
  });
}

export function readCircleWorkspaceCache(
  circleId: string,
  options?: { now?: number; ttlMs?: number },
): CircleWorkspaceCacheEntry | null {
  const id = normalizeCircleId(circleId);
  if (!id) {
    return null;
  }

  const entry = store.get(id);
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
    store.delete(id);
    return null;
  }

  return entry;
}

/** Synchronous first-paint snapshot. Financial grants are always stripped. */
export function readCircleWorkspacePresentation(
  circleId: string,
  options?: { now?: number; ttlMs?: number },
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
}
