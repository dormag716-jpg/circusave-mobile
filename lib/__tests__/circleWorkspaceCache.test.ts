import { canShowBackendGatedAction } from '../startCircleReadiness';
import type { BackendCircleDetail, BackendRoundSnapshot } from '../api';
import {
  CIRCLE_WORKSPACE_CACHE_TTL_MS,
  bindCircleWorkspaceCacheUser,
  circleWorkspaceCacheKey,
  clearCircleWorkspaceCache,
  evictCircleWorkspaceCache,
  isLedgerRequiredForRoundPresentation,
  isWorkspaceCacheAuthoritativeForPermissions,
  readCircleWorkspaceCache,
  readCircleWorkspacePresentation,
  resetCircleWorkspaceCacheForTests,
  seedCircleWorkspaceCache,
  shouldRevalidateWorkspaceFromBackend,
  stripCachedFinancialGrants,
} from '../circleWorkspaceCache';

function detail(id: string, name: string): BackendCircleDetail {
  return {
    id,
    name,
    contributionAmount: 50,
    currentRound: 2,
    frequency: 'weekly',
    members: [],
    organizerId: 'org-1',
    startDate: '2026-01-01',
    status: 'active',
    turnOrder: [],
  };
}

function schedule(
  groupId: string,
  grants: boolean,
): BackendRoundSnapshot {
  return {
    contributions: [],
    currentRound: 2,
    groupId,
    schedule: [{ round: 2, payoutDate: '2026-02-01' }],
    roundWorkspace: {
      currentRoundNumber: 2,
      viewerPermissions: {
        canApproveContributions: grants,
        canReleasePayout: grants,
        canRemindMembers: grants,
        canSubmitOwnContribution: grants,
      },
    },
  };
}

describe('circle workspace warm cache', () => {
  beforeEach(() => {
    resetCircleWorkspaceCacheForTests();
    bindCircleWorkspaceCacheUser('usr_test');
  });

  it('seeds presentation by circle ID without leaking another circle', () => {
    seedCircleWorkspaceCache({
      circleId: 'circle-a',
      detail: detail('circle-a', 'Alpha'),
      schedule: schedule('circle-a', true),
    });
    seedCircleWorkspaceCache({
      circleId: 'circle-b',
      detail: detail('circle-b', 'Beta'),
      schedule: schedule('circle-b', true),
    });

    const alpha = readCircleWorkspacePresentation('circle-a');
    const beta = readCircleWorkspacePresentation('circle-b');

    expect(alpha?.circleId).toBe('circle-a');
    expect(alpha?.detail?.name).toBe('Alpha');
    expect(beta?.circleId).toBe('circle-b');
    expect(beta?.detail?.name).toBe('Beta');
    expect(readCircleWorkspaceCache('circle-a')?.circleId).toBe('circle-a');
    expect(readCircleWorkspaceCache('missing')).toBeNull();
  });

  it('can seed a workspace header and Round snapshot from warm cache', () => {
    seedCircleWorkspaceCache({
      circleId: 'circle-a',
      detail: detail('circle-a', 'Alpha'),
      schedule: schedule('circle-a', true),
    });

    const presentation = readCircleWorkspacePresentation('circle-a');
    expect(presentation?.detail?.name).toBe('Alpha');
    expect(presentation?.detail?.currentRound).toBe(2);
    expect(presentation?.schedule?.schedule).toHaveLength(1);
    expect(isLedgerRequiredForRoundPresentation()).toBe(false);
  });

  it('never treats cached or expired rows as authorization truth', () => {
    seedCircleWorkspaceCache({
      circleId: 'circle-a',
      detail: detail('circle-a', 'Alpha'),
      schedule: schedule('circle-a', true),
      now: 1_000,
    });

    expect(isWorkspaceCacheAuthoritativeForPermissions()).toBe(false);

    const presentation = readCircleWorkspacePresentation('circle-a', {
      now: 1_000,
    });
    const cachedPerms = presentation?.schedule?.roundWorkspace?.viewerPermissions;
    expect(cachedPerms?.canSubmitOwnContribution).toBe(false);
    expect(cachedPerms?.canApproveContributions).toBe(false);
    expect(cachedPerms?.canReleasePayout).toBe(false);
    expect(cachedPerms?.canRemindMembers).toBe(false);
    expect(
      canShowBackendGatedAction(cachedPerms?.canSubmitOwnContribution),
    ).toBe(false);
    expect(canShowBackendGatedAction(cachedPerms?.canReleasePayout, true)).toBe(
      false,
    );

    expect(
      readCircleWorkspacePresentation('circle-a', {
        now: 1_000 + CIRCLE_WORKSPACE_CACHE_TTL_MS + 1,
      }),
    ).toBeNull();
  });

  it('still requires a backend revalidation after a warm seed', () => {
    seedCircleWorkspaceCache({
      circleId: 'circle-a',
      detail: detail('circle-a', 'Alpha'),
    });

    expect(shouldRevalidateWorkspaceFromBackend()).toBe(true);
    expect(readCircleWorkspacePresentation('circle-a')?.detail?.name).toBe(
      'Alpha',
    );
  });

  it('keeps mutation/permission gates backend-derived after strip', () => {
    const backend = schedule('circle-a', true);
    const cached = stripCachedFinancialGrants(backend);

    expect(
      canShowBackendGatedAction(
        backend.roundWorkspace?.viewerPermissions?.canApproveContributions,
      ),
    ).toBe(true);
    expect(
      canShowBackendGatedAction(
        cached.roundWorkspace?.viewerPermissions?.canApproveContributions,
      ),
    ).toBe(false);
    expect(
      canShowBackendGatedAction(
        backend.roundWorkspace?.viewerPermissions?.canReleasePayout,
        true,
      ),
    ).toBe(true);
    expect(
      canShowBackendGatedAction(
        cached.roundWorkspace?.viewerPermissions?.canReleasePayout,
        true,
      ),
    ).toBe(false);
  });

  it('does not seed or read without a bound user', () => {
    resetCircleWorkspaceCacheForTests();
    seedCircleWorkspaceCache({
      circleId: 'circle-a',
      detail: detail('circle-a', 'Alpha'),
    });
    expect(readCircleWorkspacePresentation('circle-a')).toBeNull();
    expect(circleWorkspaceCacheKey('circle-a', '')).toBe('');
  });

  it('does not first-paint another user from the same circle id', () => {
    seedCircleWorkspaceCache({
      circleId: 'circle-a',
      detail: detail('circle-a', 'Ada Circle'),
      schedule: schedule('circle-a', true),
    });
    expect(readCircleWorkspacePresentation('circle-a')?.detail?.name).toBe(
      'Ada Circle',
    );

    bindCircleWorkspaceCacheUser('usr_other');
    expect(readCircleWorkspacePresentation('circle-a')).toBeNull();

    seedCircleWorkspaceCache({
      circleId: 'circle-a',
      detail: detail('circle-a', 'Other Circle'),
    });
    expect(readCircleWorkspacePresentation('circle-a')?.detail?.name).toBe(
      'Other Circle',
    );

    bindCircleWorkspaceCacheUser('usr_test');
    expect(readCircleWorkspacePresentation('circle-a')).toBeNull();
  });

  it('keeps the same user warm after a same-user rebind and clears on explicit reset', () => {
    seedCircleWorkspaceCache({
      circleId: 'circle-a',
      detail: detail('circle-a', 'Alpha'),
    });
    bindCircleWorkspaceCacheUser('usr_test');
    expect(readCircleWorkspacePresentation('circle-a')?.detail?.name).toBe(
      'Alpha',
    );

    clearCircleWorkspaceCache();
    expect(readCircleWorkspacePresentation('circle-a')).toBeNull();
  });

  it('evicts only the inaccessible circle for the current user', () => {
    seedCircleWorkspaceCache({
      circleId: 'circle-a',
      detail: detail('circle-a', 'Alpha'),
    });
    seedCircleWorkspaceCache({
      circleId: 'circle-b',
      detail: detail('circle-b', 'Beta'),
    });

    evictCircleWorkspaceCache('circle-a');

    expect(readCircleWorkspacePresentation('circle-a')).toBeNull();
    expect(readCircleWorkspacePresentation('circle-b')?.detail?.name).toBe(
      'Beta',
    );
  });
});
