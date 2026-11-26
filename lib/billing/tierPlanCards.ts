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

export type TierCardPeriodLine =
  | 'billed_monthly'
  | 'billed_annual'
  | 'billed_monthly_other_tab'
  | 'billed_annual_other_tab'
  | 'billed_unknown';

/**
 * How the card for the plan the person is on treats the Monthly / Annual tab.
 * The tab only chooses which prices to browse; it says nothing about how the
 * person pays. So the plan they are on shows a price only when the verified
 * billing period matches the tab, and always says which period they are billed.
 * Without a verified period it shows no price at all. Other cards are unchanged.
 */
export function currentCardPeriodView(
  action: TierCardAction,
  verifiedPeriod: 'monthly' | 'annual' | null | undefined,
  tab: 'monthly' | 'annual',
): { showPrice: boolean; line: TierCardPeriodLine | null } {
  if (action !== 'current_paid') {
    return { showPrice: true, line: null };
  }
  if (!verifiedPeriod) {
    return { showPrice: false, line: 'billed_unknown' };
  }
  const matches = verifiedPeriod === tab;
  if (verifiedPeriod === 'monthly') {
    return { showPrice: matches, line: matches ? 'billed_monthly' : 'billed_monthly_other_tab' };
  }
  return { showPrice: matches, line: matches ? 'billed_annual' : 'billed_annual_other_tab' };
}

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
