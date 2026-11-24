/**
 * How a change between paid plans is requested from Google Play (decision D7).
 *
 * - Member Pro to Organizer Pro (upgrade): takes effect now, and Google charges
 *   the prorated difference where it supports that.
 * - Organizer Pro to Member Pro (downgrade): takes effect at the next renewal.
 * - Monthly to annual and annual to monthly inside one plan: NOT DECIDED. Google
 *   offers only two modes for it, and each direction has to be tried with
 *   license testers first. Until then the app does not start that change itself.
 *
 * This only picks the request. The backend still decides which plan is active.
 */
export type PaidTier = 'member_pro' | 'organizer_pro';
export type BillingInterval = 'monthly' | 'annual';

export type PlanChangeRequest =
  | { kind: 'new_purchase' }
  | {
      kind: 'replace';
      /** Value for expo-iap `replacementMode`. */
      replacementMode: 'charge-prorated-price' | 'deferred';
    }
  | { kind: 'not_supported_yet'; reason: 'billing_period_change' | 'same_plan' };

export type CurrentPlan = { tier: PaidTier; interval: BillingInterval } | null;
export type TargetPlan = { tier: PaidTier; interval: BillingInterval };

const RANK: Record<PaidTier, number> = { member_pro: 1, organizer_pro: 2 };

export function planChangeRequest(
  current: CurrentPlan,
  target: TargetPlan,
): PlanChangeRequest {
  if (!current) {
    return { kind: 'new_purchase' };
  }
  if (current.tier === target.tier) {
    return {
      kind: 'not_supported_yet',
      reason:
        current.interval === target.interval ? 'same_plan' : 'billing_period_change',
    };
  }
  if (RANK[target.tier] > RANK[current.tier]) {
    // Same-cycle upgrade. Switching billing period at the same time is not
    // decided either, so it is held back with the other period changes.
    return current.interval === target.interval
      ? { kind: 'replace', replacementMode: 'charge-prorated-price' }
      : { kind: 'not_supported_yet', reason: 'billing_period_change' };
  }
  return current.interval === target.interval
    ? { kind: 'replace', replacementMode: 'deferred' }
    : { kind: 'not_supported_yet', reason: 'billing_period_change' };
}
