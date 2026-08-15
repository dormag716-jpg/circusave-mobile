/**
 * Member claim payload for Mark as sent.
 * Uses existing submit fields only: paymentMethod + optional destination note.
 * Distinct from organizer Record paid and from Stripe.
 */

import type { PaymentDestination } from '@/lib/paymentDestinations';

export const ORGANIZER_RECORDED_PAID_NOTE = 'Marked paid by organizer.';

export const SUBMITTABLE_PAYMENT_METHODS = [
  'cash',
  'zelle',
  'cashapp',
  'venmo',
  'paypal',
  'other',
] as const;

export type SubmittablePaymentMethod =
  (typeof SUBMITTABLE_PAYMENT_METHODS)[number];

const SUBMITTABLE_SET = new Set<string>(SUBMITTABLE_PAYMENT_METHODS);

export function paymentMethodForDestination(
  destination: PaymentDestination,
): SubmittablePaymentMethod {
  if (destination.method === 'bank') {
    return 'other';
  }
  if (SUBMITTABLE_SET.has(destination.method)) {
    return destination.method as SubmittablePaymentMethod;
  }
  return 'other';
}

export const MAX_PAYMENT_REFERENCE_LENGTH = 80;

export function normalizePaymentReference(raw?: string | null): string | null {
  const value = String(raw ?? '').trim();
  if (!value) {
    return null;
  }
  return value.slice(0, MAX_PAYMENT_REFERENCE_LENGTH);
}

export function buildManualContributionSubmitPayload(
  destination?: PaymentDestination | null,
  reference?: string | null,
): { paymentMethod?: string; note?: string; paymentReference?: string } {
  const payload: {
    paymentMethod?: string;
    note?: string;
    paymentReference?: string;
  } = {};
  if (destination) {
    payload.paymentMethod = paymentMethodForDestination(destination);
    if (destination.destination) {
      payload.note = destination.destination;
    }
  }
  const paymentReference = normalizePaymentReference(reference);
  if (paymentReference) {
    payload.paymentReference = paymentReference;
  }
  return payload;
}

export function presentClaimedContributionPayment(input: {
  paymentMethod?: string | null;
  note?: string | null;
  paymentReference?: string | null;
}): {
  method: string | null;
  destination: string | null;
  reference: string | null;
} {
  const method = String(input.paymentMethod || '').trim().toLowerCase() || null;
  const note = String(input.note || '').trim() || null;
  const destination =
    method && note && note !== ORGANIZER_RECORDED_PAID_NOTE ? note : null;
  return {
    method,
    destination,
    reference: normalizePaymentReference(input.paymentReference),
  };
}

export function claimedPaymentMethodLabelKey(method: string | null): string | null {
  if (!method || method === 'stripe') {
    return null;
  }
  return `paymentSetup.methods.${method}`;
}
