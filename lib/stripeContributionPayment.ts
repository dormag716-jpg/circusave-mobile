/**
 * Stripe contribution payment orchestration (client presentation only).
 *
 * Settlement authority remains the backend webhook. PaymentSheet success means
 * the payment was submitted — not that the contribution is confirmed.
 */

export type PaymentIntentCreateResult = {
  clientSecret: string;
  paymentIntentId: string;
  memberId?: string;
  handId?: string;
};

export type PaymentSheetInitResult = { error?: { code?: string; message?: string } | null };
export type PaymentSheetPresentResult = {
  error?: { code?: string; message?: string } | null;
};

export type StripeContributionPaymentDeps = {
  createPaymentIntent: (
    token: string,
    circleId: string,
    roundNumber: number,
    memberId: string,
  ) => Promise<PaymentIntentCreateResult>;
  initPaymentSheet: (params: {
    paymentIntentClientSecret: string;
    merchantDisplayName: string;
    returnURL: string;
  }) => Promise<PaymentSheetInitResult>;
  presentPaymentSheet: () => Promise<PaymentSheetPresentResult>;
  /** Returns normalized lowercase contribution status for the selected hand. */
  loadHandStatus: (handId: string) => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  pollMaxAttempts?: number;
};

export type StripeContributionPaymentInput = {
  token: string;
  circleId: string;
  roundNumber: number;
  /** Membership / hand id frozen at payment start. */
  handId: string;
};

export type StripeContributionPaymentOutcome =
  | { kind: 'canceled' }
  | { kind: 'confirmed'; handId: string }
  | { kind: 'pending_settlement'; handId: string }
  | { kind: 'error'; message: string; handId: string };

export type ContributionSettlementPhase = null | 'confirming' | 'pending';

/** PaymentSheet success that has not webhook-confirmed must keep the pay lock. */
export function shouldHoldPaymentLockAfterOutcome(
  kind: StripeContributionPaymentOutcome['kind'],
): boolean {
  return kind === 'pending_settlement';
}

/** Confirming or pending settlement must not start another PI or manual submit. */
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

/** Synchronous mutual-exclusion for PaymentIntent + PaymentSheet (not React state). */
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

/**
 * Full PaymentSheet flow with settlement polling.
 * Caller must hold PaymentSessionLock for the entire duration.
 */
export async function runStripeContributionPayment(
  input: StripeContributionPaymentInput,
  deps: StripeContributionPaymentDeps,
): Promise<StripeContributionPaymentOutcome> {
  const handId = String(input.handId || '').trim();
  if (!handId) {
    return {
      kind: 'error',
      message: 'Unable to identify your hand.',
      handId: '',
    };
  }

  try {
    const intent = await deps.createPaymentIntent(
      input.token,
      input.circleId,
      input.roundNumber,
      handId,
    );

    // Guard: never proceed without a client secret string (do not log it).
    if (!String(intent.clientSecret || '').trim()) {
      return {
        kind: 'error',
        message: 'Unable to start payment. Please try again.',
        handId,
      };
    }

    // Prefer server-echoed hand id when present; never switch to a different hand.
    const intentHand = String(intent.handId || intent.memberId || '').trim();
    if (intentHand && intentHand !== handId) {
      return {
        kind: 'error',
        message: 'Payment was not started for the selected hand. Please try again.',
        handId,
      };
    }

    const { error: initError } = await deps.initPaymentSheet({
      paymentIntentClientSecret: intent.clientSecret,
      merchantDisplayName: 'CircuSave',
      returnURL: 'circusave://stripe-redirect',
    });
    if (initError) {
      return {
        kind: 'error',
        message: sanitizePaymentUserMessage(
          initError,
          'Unable to open payment. Please try again.',
        ),
        handId,
      };
    }

    const { error: presentError } = await deps.presentPaymentSheet();
    if (presentError) {
      if (String(presentError.code || '') === 'Canceled') {
        return { kind: 'canceled' };
      }
      return {
        kind: 'error',
        message: sanitizePaymentUserMessage(
          presentError,
          'Unable to complete the payment. Please try again.',
        ),
        handId,
      };
    }

    // Payment submitted — poll for webhook settlement. Do not create another PI.
    const pollResult = await pollHandUntilConfirmed({
      handId,
      loadHandStatus: deps.loadHandStatus,
      intervalMs: deps.pollIntervalMs,
      maxAttempts: deps.pollMaxAttempts,
      sleep: deps.sleep,
    });

    if (pollResult === 'confirmed') {
      return { kind: 'confirmed', handId };
    }
    return { kind: 'pending_settlement', handId };
  } catch (error) {
    return {
      kind: 'error',
      message: sanitizePaymentUserMessage(
        error,
        'Unable to complete the payment. Please try again.',
      ),
      handId,
    };
  }
}
