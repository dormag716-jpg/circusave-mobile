import type { BackendChatConversation } from './api';

export type CircleChatSnapshot = {
  conversations: BackendChatConversation[];
  unreadCount: number;
};

const snapshots = new Map<string, CircleChatSnapshot>();
const snapshotListeners = new Map<string, Set<() => void>>();
const activeClients = new Set<string>();
const ownershipListeners = new Set<() => void>();

function notifySnapshot(circleId: string) {
  snapshotListeners.get(circleId)?.forEach((listener) => listener());
}

export function publishCircleChatSnapshot(
  circleId: string,
  snapshot: CircleChatSnapshot,
): void {
  const id = String(circleId || '').trim();
  if (!id) {
    return;
  }
  snapshots.set(id, snapshot);
  notifySnapshot(id);
}

export function getCircleChatSnapshot(
  circleId: string,
): CircleChatSnapshot | null {
  const id = String(circleId || '').trim();
  if (!id) {
    return null;
  }
  return snapshots.get(id) ?? null;
}

export function subscribeCircleChatSnapshot(
  circleId: string,
  listener: () => void,
): () => void {
  const id = String(circleId || '').trim();
  if (!id) {
    return () => {};
  }
  const listeners = snapshotListeners.get(id) ?? new Set<() => void>();
  listeners.add(listener);
  snapshotListeners.set(id, listeners);
  return () => {
    listeners.delete(listener);
  };
}

export function claimCircleChatClient(circleId: string): void {
  const id = String(circleId || '').trim();
  if (!id || activeClients.has(id)) {
    return;
  }
  activeClients.add(id);
  ownershipListeners.forEach((listener) => listener());
}

export function releaseCircleChatClient(circleId: string): void {
  const id = String(circleId || '').trim();
  if (!id || !activeClients.delete(id)) {
    return;
  }
  ownershipListeners.forEach((listener) => listener());
}

export function isCircleChatClientActive(circleId: string): boolean {
  return activeClients.has(String(circleId || '').trim());
}

export function subscribeCircleChatOwnership(listener: () => void): () => void {
  ownershipListeners.add(listener);
  return () => {
    ownershipListeners.delete(listener);
  };
}

export function resetCircleChatStoreForTests(): void {
  snapshots.clear();
  snapshotListeners.clear();
  activeClients.clear();
  ownershipListeners.clear();
}
