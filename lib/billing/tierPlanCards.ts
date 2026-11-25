import type { PlanTier } from './entitlements';

/**
 * What the plan cards show. These numbers are for display only: the backend
 * enforces every limit, and the person's own limits come from their
 * entitlements. Keep in step with the backend plan table.
 */
export type TierCardLimits = {
  maxMembersPerCircle: number;
  handsIncluded: number;
  maxHandsPerPerson: number;
  maxOpenCircles: number;
};

const LIMITS: Record<PlanTier, TierCardLimits> = {
  free: { maxMembersPerCircle: 20, handsIncluded: 1, maxHandsPerPerson: 3, maxOpenCircles: 1 },
  member_pro: { maxMembersPerCircle: 20, handsIncluded: 3, maxHandsPerPerson: 6, maxOpenCircles: 1 },
  organizer_pro: { maxMembersPerCircle: 50, handsIncluded: 3, maxHandsPerPerson: 6, maxOpenCircles: 2 },
};

export function tierCardLimits(tier: PlanTier): TierCardLimits {
  return LIMITS[tier];
}

const RANK: Record<PlanTier, number> = { free: 0, member_pro: 1, organizer_pro: 2 };

/** What the button on a plan card does for someone on `current`. */
export type TierCardAction =
  /** The plan the person is on. Paid plans offer "manage in Google Play". */
  | 'current_free'
  | 'current_paid'
  | 'choose'
  | 'upgrade'
  /** Smaller paid plan: takes effect at the next renewal. */
  | 'switch_at_renewal'
  /** Free is not bought; a paid person ends the plan in Google Play. */
  | 'none';

export function tierCardAction(current: PlanTier, target: PlanTier): TierCardAction {
  if (current === target) {
    return target === 'free' ? 'current_free' : 'current_paid';
  }
  if (target === 'free') {
    return 'none';
  }
  if (current === 'free') {
    return 'choose';
  }
  return RANK[target] > RANK[current] ? 'upgrade' : 'switch_at_renewal';
}
