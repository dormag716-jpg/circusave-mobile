import { readFileSync } from 'fs';
import path from 'path';

import {
  bindCircleChatStoreUser,
  getCircleChatSnapshot,
  publishCircleChatSnapshot,
  resetCircleChatStoreForTests,
} from '../circleChatStore';
import {
  bindCircleWorkspaceCacheUser,
  readCircleWorkspacePresentation,
  resetCircleWorkspaceCacheForTests,
  seedCircleWorkspaceCache,
} from '../circleWorkspaceCache';
import {
  bindUserPresentationCaches,
  clearUserPresentationCaches,
} from '../userPresentationCaches';
import type { BackendCircleDetail } from '../api';

function detail(id: string, name: string): BackendCircleDetail {
  return {
    id,
    name,
    contributionAmount: 50,
    currentRound: 1,
    frequency: 'weekly',
    members: [],
    organizerId: 'org-1',
    startDate: '2026-01-01',
    status: 'active',
    turnOrder: [],
  };
}

describe('user presentation caches', () => {
  beforeEach(() => {
    resetCircleWorkspaceCacheForTests();
    resetCircleChatStoreForTests();
  });

  it('binds both stores to one user and clears both on account change', () => {
    bindUserPresentationCaches('usr_a');
    seedCircleWorkspaceCache({
      circleId: 'circle-1',
      detail: detail('circle-1', 'Ada'),
    });
    publishCircleChatSnapshot('circle-1', {
      conversations: [],
      unreadCount: 2,
    });

    expect(readCircleWorkspacePresentation('circle-1')?.detail?.name).toBe(
      'Ada',
    );
    expect(getCircleChatSnapshot('circle-1')?.unreadCount).toBe(2);

    bindUserPresentationCaches('usr_a');
    expect(readCircleWorkspacePresentation('circle-1')?.detail?.name).toBe(
      'Ada',
    );

    bindUserPresentationCaches('usr_b');
    expect(readCircleWorkspacePresentation('circle-1')).toBeNull();
    expect(getCircleChatSnapshot('circle-1')).toBeNull();
  });

  it('clears both stores without requiring a different user id', () => {
    bindCircleWorkspaceCacheUser('usr_a');
    bindCircleChatStoreUser('usr_a');
    seedCircleWorkspaceCache({
      circleId: 'circle-1',
      detail: detail('circle-1', 'Ada'),
    });
    publishCircleChatSnapshot('circle-1', {
      conversations: [],
      unreadCount: 1,
    });

    clearUserPresentationCaches();
    expect(readCircleWorkspacePresentation('circle-1')).toBeNull();
    expect(getCircleChatSnapshot('circle-1')).toBeNull();
  });

  it('auth session bind/clears presentation caches on restore, login, and logout', () => {
    const source = readFileSync(
      path.join(__dirname, '..', 'authContext.tsx'),
      'utf8',
    );
    expect(source).toMatch(/bindUserPresentationCaches\(localSession\.user\.id\)/);
    expect(source).toMatch(
      /bindUserPresentationCaches\(nextSession\?\.user\.id \?\? null\)/,
    );
    expect(source).toMatch(/bindUserPresentationCaches\(nextSession\.user\.id\)/);
    expect(source).toMatch(/bindUserPresentationCaches\(null\)/);
  });
});
