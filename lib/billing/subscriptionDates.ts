import type { Entitlements } from './entitlements';

export type SubscriptionDateLine = {
  key: 'accessUntil' | 'renewsOn' | 'trialEndsOn';
  /** ISO timestamp to show. */
  date: string;
};

function validDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/**
 * The one date line a Premium user should see: when access ends (they chose
 * not to renew), when the free trial ends, or when the plan renews. Free
 * accounts and missing or unreadable dates show nothing.
 */
export function subscriptionDateLine(
  entitlements: Pick<
    Entitlements,
    | 'plan'
    | 'subscriptionStatus'
    | 'currentPeriodEnd'
    | 'cancelAtPeriodEnd'
    | 'trialEndsAt'
  >,
): SubscriptionDateLine | null {
  if (entitlements.plan !== 'premium') return null;
  const trialing = entitlements.subscriptionStatus === 'trialing';
  const date = trialing
    ? (validDate(entitlements.trialEndsAt) ??
      validDate(entitlements.currentPeriodEnd))
    : validDate(entitlements.currentPeriodEnd);
  if (!date) return null;
  if (entitlements.cancelAtPeriodEnd) return { key: 'accessUntil', date };
  return { key: trialing ? 'trialEndsOn' : 'renewsOn', date };
}
