/**
 * Buying one extra hand for one circle (Google Play one-time product).
 *
 * The backend decides everything: it checks before any payment (quote), and it
 * adds the hand only after Google Play confirms the payment (verify). The app
 * never marks a hand as owned by itself, and a screen reload never buys again.
 */

export type ExtraHandQuote = {
  reservationId: string;
  circleId: string;
  handNumber: number;
  productId: string;
  packageName: string;
  obfuscatedAccountId: string;
  obfuscatedProfileId: string;
  expiresAt: string | null;
  handsIncluded: number;
  maxHandsPerPerson: number;
};

export type ExtraHandVerifyResult = {
  reservationId: string;
  circleId: string;
  handNumber: number;
  status: string;
  membershipId: string | null;
  consumed: boolean;
};

/** Stable reasons the backend gives (the `code` field), never its wording. */
export type ExtraHandErrorCode =
  | 'extra_hands_unavailable'
  | 'hand_included'
  | 'hand_limit_reached'
  | 'reservation_not_found'
  | 'reservation_closed'
  | 'purchase_not_valid'
  | 'purchase_pending'
  | 'purchase_already_used'
  | 'purchase_needs_review'
  | 'unknown';

const KNOWN_CODES: ReadonlySet<string> = new Set([
  'extra_hands_unavailable',
  'hand_included',
  'hand_limit_reached',
  'reservation_not_found',
  'reservation_closed',
  'purchase_not_valid',
  'purchase_pending',
  'purchase_already_used',
  'purchase_needs_review',
]);

function readCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.code === 'string') {
    return record.code;
  }
  const details = record.details;
  if (details && typeof details === 'object') {
    const nested = (details as Record<string, unknown>).code;
    if (typeof nested === 'string') {
      return nested;
    }
  }
  return null;
}

export function extraHandErrorCode(error: unknown): ExtraHandErrorCode {
  const payload =
    error && typeof error === 'object' && 'payload' in error
      ? (error as { payload: unknown }).payload
      : null;
  const code = readCode(payload);
  return code && KNOWN_CODES.has(code) ? (code as ExtraHandErrorCode) : 'unknown';
}

/** What the screen should show for a failed quote. */
export type ExtraHandQuoteOutcome =
  | { kind: 'ready'; quote: ExtraHandQuote }
  /** Not offered here (feature off, or the hand comes with the plan): show nothing to buy. */
  | { kind: 'not_offered'; reason: 'unavailable' | 'included' }
  | { kind: 'limit_reached' }
  /** Anything else, including an old backend with no such endpoint. */
  | { kind: 'failed' };

export function classifyQuoteFailure(error: unknown): ExtraHandQuoteOutcome {
  switch (extraHandErrorCode(error)) {
    case 'extra_hands_unavailable':
      return { kind: 'not_offered', reason: 'unavailable' };
    case 'hand_included':
      return { kind: 'not_offered', reason: 'included' };
    case 'hand_limit_reached':
      return { kind: 'limit_reached' };
    default: {
      // An older backend answers 404 for the endpoint: same as "not offered".
      const status =
        error && typeof error === 'object' && 'status' in error
          ? (error as { status: unknown }).status
          : null;
      return status === 404
        ? { kind: 'not_offered', reason: 'unavailable' }
        : { kind: 'failed' };
    }
  }
}

export type ExtraHandPurchaseState =
  | { phase: 'idle' }
  | { phase: 'quoting' }
  | { phase: 'ready'; quote: ExtraHandQuote }
  | { phase: 'paying'; quote: ExtraHandQuote }
  | { phase: 'verifying'; quote: ExtraHandQuote }
  /** Google Play is still taking the payment; nothing is added until it clears. */
  | { phase: 'pending'; quote: ExtraHandQuote }
  | { phase: 'done'; result: ExtraHandVerifyResult }
  | { phase: 'not_offered'; reason: 'unavailable' | 'included' }
  | { phase: 'limit_reached' }
  | {
      phase: 'failed';
      reason: 'quote' | 'payment_canceled' | 'payment_failed' | 'verify' | 'needs_review';
      /** The purchase was paid but not added yet: verify can be retried, never re-bought. */
      quote?: ExtraHandQuote;
      purchaseToken?: string;
    };

export type ExtraHandPurchaseDeps = {
  quote: () => Promise<ExtraHandQuote>;
  /** Opens Google Play. Resolves with the purchase token once Google confirms it. */
  pay: (quote: ExtraHandQuote) => Promise<
    | { kind: 'purchased'; purchaseToken: string }
    | { kind: 'canceled' }
    | { kind: 'pending' }
    | { kind: 'failed' }
  >;
  verify: (input: {
    purchaseToken: string;
    reservationId: string;
  }) => Promise<ExtraHandVerifyResult>;
};

/**
 * One full attempt: quote, pay, verify. Returns every state it passes through
 * through `onState` and the final one as its result. A paid-but-not-added
 * purchase comes back as `failed` with the token, so the caller can retry only
 * the verify step and never buys a second time.
 */
export async function runExtraHandPurchase(
  deps: ExtraHandPurchaseDeps,
  onState: (state: ExtraHandPurchaseState) => void = () => undefined,
  resume?: { quote: ExtraHandQuote; purchaseToken: string },
): Promise<ExtraHandPurchaseState> {
  const finish = (state: ExtraHandPurchaseState) => {
    onState(state);
    return state;
  };

  let quote: ExtraHandQuote;
  let purchaseToken: string;

  if (resume) {
    quote = resume.quote;
    purchaseToken = resume.purchaseToken;
  } else {
    onState({ phase: 'quoting' });
    try {
      quote = await deps.quote();
    } catch (error) {
      const outcome = classifyQuoteFailure(error);
      if (outcome.kind === 'not_offered') {
        return finish({ phase: 'not_offered', reason: outcome.reason });
      }
      if (outcome.kind === 'limit_reached') {
        return finish({ phase: 'limit_reached' });
      }
      return finish({ phase: 'failed', reason: 'quote' });
    }
    onState({ phase: 'paying', quote });
    const paid = await deps.pay(quote);
    if (paid.kind === 'canceled') {
      return finish({ phase: 'failed', reason: 'payment_canceled', quote });
    }
    if (paid.kind === 'pending') {
      return finish({ phase: 'pending', quote });
    }
    if (paid.kind === 'failed') {
      return finish({ phase: 'failed', reason: 'payment_failed', quote });
    }
    purchaseToken = paid.purchaseToken;
  }

  onState({ phase: 'verifying', quote });
  try {
    const result = await deps.verify({
      purchaseToken,
      reservationId: quote.reservationId,
    });
    return finish({ phase: 'done', result });
  } catch (error) {
    const code = extraHandErrorCode(error);
    if (code === 'purchase_pending') {
      return finish({ phase: 'pending', quote });
    }
    if (code === 'purchase_needs_review') {
      return finish({ phase: 'failed', reason: 'needs_review', quote, purchaseToken });
    }
    return finish({ phase: 'failed', reason: 'verify', quote, purchaseToken });
  }
}
