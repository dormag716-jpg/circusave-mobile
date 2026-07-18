/**
 * Circle roster capacity by organizer plan tier.
 *
 * Keep limits in sync with backend `app/circle_capacity.py`.
 * Pure helpers — UI and future AI Susu both consume this contract.
 *
 * Capacity unit: participating hands (contribute / receive payout).
 * Non-participating organizer seats do not consume capacity.
 */

export const FREE_MAX_PARTICIPATING_HANDS = 20;
export const PREMIUM_MAX_PARTICIPATING_HANDS = 50;

/** Free organizers: one setup or active circle at a time. Completed frees the slot. */
export const FREE_MAX_OPEN_CIRCLES = 1;

export type CirclePlanTier = 'free' | 'premium';

export type RosterCapacity = {
  tier: CirclePlanTier;
  maxHands: number;
  /** Product alias for maxHands (marketing “members”). */
  maxMembers: number;
  usedHands: number;
  remainingHands: number;
  projectedUsedHands: number;
  atCapacity: boolean;
  wouldExceed: boolean;
  unit: 'participating_hand';
  freeMaxHands: number;
  premiumMaxHands: number;
};

export function normalizePlanTier(roleOrTier?: string | null): CirclePlanTier {
  const raw = String(roleOrTier || '')
    .trim()
    .toLowerCase();
  if (
    raw === 'premium' ||
    raw === 'pro' ||
    raw === 'circle pro' ||
    raw === 'circle_pro' ||
    raw === 'premium organizer'
  ) {
    return 'premium';
  }
  return 'free';
}

export function isPremiumPlan(roleOrTier?: string | null): boolean {
  return normalizePlanTier(roleOrTier) === 'premium';
}

export function maxParticipatingHandsForRole(roleOrTier?: string | null): number {
  return isPremiumPlan(roleOrTier)
    ? PREMIUM_MAX_PARTICIPATING_HANDS
    : FREE_MAX_PARTICIPATING_HANDS;
}

export function isParticipatingHand(member: {
  isParticipating?: boolean | null;
}): boolean {
  return member.isParticipating !== false;
}

export function countParticipatingHands(
  members: ReadonlyArray<{ isParticipating?: boolean | null }> | null | undefined,
): number {
  return (members || []).filter(isParticipatingHand).length;
}

export function buildRosterCapacity(input: {
  members?: ReadonlyArray<{ isParticipating?: boolean | null }> | null;
  organizerRoleOrTier?: string | null;
  /** Optional backend snapshot when present on circle detail. */
  backendCapacity?: Partial<RosterCapacity> | null;
  pendingNewHands?: number;
}): RosterCapacity {
  if (input.backendCapacity && typeof input.backendCapacity.maxHands === 'number') {
    const used =
      typeof input.backendCapacity.usedHands === 'number'
        ? input.backendCapacity.usedHands
        : countParticipatingHands(input.members);
    const maxHands = input.backendCapacity.maxHands;
    const pending = Math.max(0, Number(input.pendingNewHands || 0));
    const projected = used + pending;
    return {
      tier: normalizePlanTier(
        input.backendCapacity.tier || input.organizerRoleOrTier,
      ),
      maxHands,
      maxMembers: maxHands,
      usedHands: used,
      remainingHands: Math.max(0, maxHands - used),
      projectedUsedHands: projected,
      atCapacity: used >= maxHands,
      wouldExceed: projected > maxHands,
      unit: 'participating_hand',
      freeMaxHands: FREE_MAX_PARTICIPATING_HANDS,
      premiumMaxHands: PREMIUM_MAX_PARTICIPATING_HANDS,
    };
  }

  const tier = normalizePlanTier(input.organizerRoleOrTier);
  const maxHands = maxParticipatingHandsForRole(tier);
  const used = countParticipatingHands(input.members);
  const pending = Math.max(0, Number(input.pendingNewHands || 0));
  const projected = used + pending;
  return {
    tier,
    maxHands,
    maxMembers: maxHands,
    usedHands: used,
    remainingHands: Math.max(0, maxHands - used),
    projectedUsedHands: projected,
    atCapacity: used >= maxHands,
    wouldExceed: projected > maxHands,
    unit: 'participating_hand',
    freeMaxHands: FREE_MAX_PARTICIPATING_HANDS,
    premiumMaxHands: PREMIUM_MAX_PARTICIPATING_HANDS,
  };
}

export function capacityExceededMessage(capacity: RosterCapacity): string {
  if (capacity.tier === 'premium') {
    return (
      `This premium circle is limited to ${capacity.maxHands} participating hands ` +
      `(members/slots). Remove a hand or free a slot before adding more.`
    );
  }
  return (
    `Free circles are limited to ${capacity.maxHands} participating hands (members/slots). ` +
    `Upgrade to Premium for up to ${PREMIUM_MAX_PARTICIPATING_HANDS}, ` +
    `or remove a hand to free a slot.`
  );
}

/** True when adding `additionalHands` would stay within plan cap. */
export function canAddParticipatingHands(
  capacity: RosterCapacity,
  additionalHands = 1,
): boolean {
  return capacity.usedHands + Math.max(0, additionalHands) <= capacity.maxHands;
}

const OPEN_CIRCLE_STATUSES = new Set(['draft', 'setup', 'forming', 'active']);

export function isOpenCircleStatus(
  status?: string | null,
  potStatus?: string | null,
): boolean {
  const statusN = String(status || '')
    .trim()
    .toLowerCase();
  const potN = String(potStatus || '')
    .trim()
    .toLowerCase();
  if (potN === 'completed' || statusN === 'completed' || statusN === 'closed') {
    return false;
  }
  return OPEN_CIRCLE_STATUSES.has(statusN);
}

export type OpenCircleCapacity = {
  tier: CirclePlanTier;
  maxOpenCircles: number | null;
  usedOpenCircles: number;
  remainingOpenCircles: number | null;
  atCapacity: boolean;
  unlimited: boolean;
  openCircleIds: string[];
  primaryOpenCircleId: string | null;
  freeMaxOpenCircles: number;
};

/**
 * Free: max 1 open circle (setup or active) for organizers.
 * Premium: unlimited.
 */
export function buildOpenCircleCapacity(input: {
  circles: ReadonlyArray<{
    id: string;
    status?: string | null;
    pot_status?: string | null;
    potStatus?: string | null;
    userRole?: string | null;
  }>;
  organizerRoleOrTier?: string | null;
  /** When true, only count circles where userRole is organizer. Default true. */
  organizerOwnedOnly?: boolean;
}): OpenCircleCapacity {
  const tier = normalizePlanTier(input.organizerRoleOrTier);
  const unlimited = tier === 'premium';
  const maxOpen = unlimited ? null : FREE_MAX_OPEN_CIRCLES;
  const organizerOnly = input.organizerOwnedOnly !== false;

  const open = input.circles.filter((circle) => {
    if (organizerOnly) {
      const role = String(circle.userRole || '')
        .trim()
        .toLowerCase();
      // Only count circles you organize (null role is not treated as organizer).
      if (role !== 'organizer') {
        return false;
      }
    }
    return isOpenCircleStatus(
      circle.status,
      circle.pot_status ?? circle.potStatus,
    );
  });

  const openCircleIds = open.map((c) => c.id);
  const used = openCircleIds.length;
  const remaining = unlimited ? null : Math.max(0, FREE_MAX_OPEN_CIRCLES - used);

  return {
    tier,
    maxOpenCircles: maxOpen,
    usedOpenCircles: used,
    remainingOpenCircles: remaining,
    atCapacity: unlimited ? false : used >= FREE_MAX_OPEN_CIRCLES,
    unlimited,
    openCircleIds,
    primaryOpenCircleId: openCircleIds[0] ?? null,
    freeMaxOpenCircles: FREE_MAX_OPEN_CIRCLES,
  };
}

export function openCircleLimitMessage(capacity: OpenCircleCapacity): string {
  if (capacity.unlimited) {
    return 'Premium organizers can run multiple open circles.';
  }
  return (
    'Free accounts include 1 open circle at a time (in setup or active). ' +
    'Open your existing circle from My Circles to continue, or complete it ' +
    'before creating a new one. Upgrade to Premium for unlimited circles.'
  );
}
