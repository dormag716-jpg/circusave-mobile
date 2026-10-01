import type { Entitlements } from './entitlements';

export type CheckoutReturnStatus = 'success' | 'canceled';
export type PremiumActivationResult = 'activated' | 'pending';

const DEFAULT_POLL_ATTEMPTS = 6;
const DEFAULT_POLL_DELAY_MS = 1250;

export function checkoutReturnStatusFromUrl(
  url: string | null | undefined,
): CheckoutReturnStatus | null {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  try {
    const checkout = new URL(raw).searchParams.get('checkout');
    return checkout === 'success' || checkout === 'canceled' ? checkout : null;
  } catch {
    return null;
  }
}

export function isCheckoutConfirmedPremium(
  entitlements: Entitlements,
): boolean {
  return (
    entitlements.plan === 'premium' &&
    (entitlements.subscriptionStatus === 'trialing' ||
      entitlements.subscriptionStatus === 'active')
  );
}

export async function pollForPremiumActivation(
  refreshEntitlements: () => Promise<Entitlements>,
  options: {
    attempts?: number;
    delayMs?: number;
    sleep?: (delayMs: number) => Promise<void>;
  } = {},
): Promise<PremiumActivationResult> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_POLL_ATTEMPTS);
  const delayMs = Math.max(0, options.delayMs ?? DEFAULT_POLL_DELAY_MS);
  const sleep =
    options.sleep ??
    ((duration: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, duration)));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const entitlements = await refreshEntitlements();
    if (isCheckoutConfirmedPremium(entitlements)) {
      return 'activated';
    }
    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }
  return 'pending';
}
