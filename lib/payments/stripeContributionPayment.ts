/**
 * Contribution payment session helpers (client presentation only).
 * Manual mark-as-sent does not confirm a contribution. Settlement authority
 * remains the backend.
 */

export type ContributionPayLockOutcomeKind =
  | 'disabled'
  | 'canceled'
  | 'confirmed'
  | 'pending_settlement'
  | 'error';

export type ContributionSettlementPhase = null | 'confirming' | 'pending';

/** Hold the pay lock only while settlement is still pending. */
export function shouldHoldPaymentLockAfterOutcome(
  kind: ContributionPayLockOutcomeKind,
): boolean {
  return kind === 'pending_settlement';
}

/** Confirming, pending settlement, or an in-flight submit must not start another payment. */
export function shouldBlockContributionPayActions(input: {
  payingStripe?: boolean;
  submitting?: boolean;
  settlementPhase?: ContributionSettlementPhase;
}): boolean {
  return (
    input.payingStripe === true ||
    input.submitting === true ||
    input.settlementPhase === 'confirming' ||
    input.settlementPhase === 'pending'
  );
}

/** Pending UI/lock clears only when a fresh schedule says confirmed. */
export function shouldClearPendingSettlement(status: string): boolean {
  return isContributionConfirmedStatus(status);
}

/** Synchronous mutual-exclusion for contribution payment actions (not React state). */
export class PaymentSessionLock {
  private locked = false;

  tryAcquire(): boolean {
    if (this.locked) {
      return false;
    }
    this.locked = true;
    return true;
  }

  release(): void {
    this.locked = false;
  }

  get isLocked(): boolean {
    return this.locked;
  }
}

export function isContributionConfirmedStatus(status: string): boolean {
  return String(status || '').trim().toLowerCase() === 'confirmed';
}

/**
 * Poll hand status until confirmed or attempts exhausted.
 * Does not create PaymentIntents.
 */
export async function pollHandUntilConfirmed(options: {
  handId: string;
  loadHandStatus: (handId: string) => Promise<string>;
  intervalMs?: number;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<'confirmed' | 'timeout'> {
  const intervalMs = options.intervalMs ?? 1500;
  const maxAttempts = options.maxAttempts ?? 8;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(intervalMs);
    }
    const status = await options.loadHandStatus(options.handId);
    if (isContributionConfirmedStatus(status)) {
      return 'confirmed';
    }
  }
  return 'timeout';
}

export function sanitizePaymentUserMessage(
  error: unknown,
  fallback: string,
): string {
  const raw =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '').trim()
      : error instanceof Error
        ? error.message.trim()
        : '';

  if (!raw) {
    return fallback;
  }

  // Never surface secrets or PaymentIntent client secrets.
  if (
    /client_secret|sk_live|sk_test|rk_live|rk_test|pk_live|pk_test|whsec_|pi_[a-z0-9]+_secret_/i.test(
      raw,
    )
  ) {
    return fallback;
  }

  if (raw.toLowerCase() === 'something went wrong') {
    return fallback;
  }

  // Prefer short, user-facing backend messages; drop multi-line stacks.
  const firstLine = raw.split('\n')[0]?.trim() || fallback;
  if (firstLine.length > 220) {
    return fallback;
  }
  return firstLine;
}
