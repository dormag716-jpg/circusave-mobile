import {
  bindCircleChatStoreUser,
  clearCircleChatStore,
} from './circleChatStore';
import {
  bindCircleWorkspaceCacheUser,
  clearCircleWorkspaceCache,
} from './circleWorkspaceCache';

/**
 * Warm workspace + chat maps are presentation-only and user-scoped.
 * Bind on every session apply so a later account cannot first-paint the last user.
 */
export function bindUserPresentationCaches(
  userId: string | null | undefined,
): void {
  bindCircleWorkspaceCacheUser(userId);
  bindCircleChatStoreUser(userId);
}

export function clearUserPresentationCaches(): void {
  clearCircleWorkspaceCache();
  clearCircleChatStore();
}
