import type { PlanTier } from './entitlements';

/**
 * Translation key (in the `subscription` namespace) for the name of the plan a
 * paying account is on. A paid account whose tier is not readable is treated as
 * Organizer Pro, the same rule `entitlements.ts` applies when it reads the tier.
 */
export function paidPlanNameKey(
  tier: PlanTier | null | undefined,
): 'tierMemberProName' | 'tierOrganizerProName' {
  return tier === 'member_pro' ? 'tierMemberProName' : 'tierOrganizerProName';
}
