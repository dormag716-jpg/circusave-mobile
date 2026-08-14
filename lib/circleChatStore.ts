import type { BackendChatConversation } from './api';

export type CircleChatSnapshot = {
  conversations: BackendChatConversation[];
  unreadCount: number;
};

const snapshots = new Map<string, CircleChatSnapshot>();
const snapshotListeners = new Map<string, Set<() => void>>();
const activeClients = new Set<string>();
const ownershipListeners = new Set<() => void>();
let storeUserId = '';

function normalizeCircleId(circleId: string | null | undefined): string {
  return String(circleId || '').trim();
}

function normalizeUserId(userId: string | null | undefined): string {
  return String(userId ?? '').trim();
}

export function circleChatStoreKey(
  circleId: string,
  userId: string = storeUserId,
): string {
  const id = normalizeCircleId(circleId);
  const user = normalizeUserId(userId);
  if (!id || !user) {
    return '';
  }
  return `${user}:${id}`;
}

function notifySnapshot(circleId: string) {
  snapshotListeners.get(normalizeCircleId(circleId))?.forEach((listener) => listener());
}

function notifyAllSnapshots() {
  snapshotListeners.forEach((listeners) => {
    listeners.forEach((listener) => listener());
  });
}

export function clearCircleChatStore(): void {
  snapshots.clear();
  activeClients.clear();
  notifyAllSnapshots();
  ownershipListeners.forEach((listener) => listener());
}

/** Isolate snapshots to the signed-in user. Changing users clears store data. */
export function bindCircleChatStoreUser(userId: string | null | undefined): void {
  const next = normalizeUserId(userId);
  if (next === storeUserId) {
    return;
  }
  storeUserId = next;
  clearCircleChatStore();
}

export function publishCircleChatSnapshot(
  circleId: string,
  snapshot: CircleChatSnapshot,
): void {
  const id = normalizeCircleId(circleId);
  const key = circleChatStoreKey(id);
  if (!id || !key) {
    return;
  }
  snapshots.set(key, snapshot);
  notifySnapshot(id);
}

export function getCircleChatSnapshot(
  circleId: string,
): CircleChatSnapshot | null {
  const key = circleChatStoreKey(circleId);
  if (!key) {
    return null;
  }
  return snapshots.get(key) ?? null;
}

export function subscribeCircleChatSnapshot(
  circleId: string,
  listener: () => void,
): () => void {
  const id = normalizeCircleId(circleId);
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
  const key = circleChatStoreKey(circleId);
  if (!key || activeClients.has(key)) {
    return;
  }
  activeClients.add(key);
  ownershipListeners.forEach((listener) => listener());
}

export function releaseCircleChatClient(circleId: string): void {
  const key = circleChatStoreKey(circleId);
  if (!key || !activeClients.delete(key)) {
    return;
  }
  ownershipListeners.forEach((listener) => listener());
}

export function isCircleChatClientActive(circleId: string): boolean {
  const key = circleChatStoreKey(circleId);
  return Boolean(key) && activeClients.has(key);
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
  storeUserId = '';
}
