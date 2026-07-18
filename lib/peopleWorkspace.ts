/**
 * UI-only compatibility helpers for the current mobile circle payload.
 * These do not adapt current API rows into the intended normalized domain model.
 */
export type CurrentApiHandLike = Readonly<{
  id: string;
  userId?: string | null;
  isParticipating?: boolean;
}>;

export type CurrentApiMemberGroup<T extends CurrentApiHandLike> = Readonly<{
  /** Compatibility grouping key only; not a normalized MembershipId. */
  key: string;
  hands: readonly T[];
  connectedUserId: string | null;
}>;

/**
 * Groups connected API hand rows by userId for compact presentation. Unclaimed
 * rows stay separate because their real membership relationship is unverified.
 */
export function groupCurrentApiHandsForDisplay<T extends CurrentApiHandLike>(
  hands: readonly T[],
): readonly CurrentApiMemberGroup<T>[] {
  const groups = new Map<string, { hands: T[]; connectedUserId: string | null }>();
  for (const hand of hands) {
    const userId = String(hand.userId || '').trim() || null;
    const key = userId ? `user:${userId}` : `unclaimed-hand:${hand.id}`;
    const group = groups.get(key) ?? { hands: [], connectedUserId: userId };
    group.hands.push(hand);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
}

export type PayoutOrderValidation = Readonly<{
  valid: boolean;
  missingHandIds: readonly string[];
  duplicateHandIds: readonly string[];
  unknownHandIds: readonly string[];
}>;

/** Structural UI validation only. The backend remains authoritative. */
export function validateCurrentPayoutOrder(
  hands: readonly CurrentApiHandLike[],
  turnOrder: readonly string[],
): PayoutOrderValidation {
  const participatingIds = hands
    .filter((hand) => hand.isParticipating !== false)
    .map((hand) => hand.id);
  const participating = new Set(participatingIds);
  const counts = new Map<string, number>();
  for (const id of turnOrder) counts.set(id, (counts.get(id) ?? 0) + 1);

  const missingHandIds = participatingIds.filter((id) => !counts.has(id));
  const duplicateHandIds = [...counts.entries()]
    .filter(([id, count]) => participating.has(id) && count > 1)
    .map(([id]) => id);
  const unknownHandIds = [...counts.keys()].filter((id) => !participating.has(id));

  return {
    valid:
      missingHandIds.length === 0 &&
      duplicateHandIds.length === 0 &&
      unknownHandIds.length === 0,
    missingHandIds,
    duplicateHandIds,
    unknownHandIds,
  };
}

export function initialsForDisplay(value: string | null | undefined): string {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
