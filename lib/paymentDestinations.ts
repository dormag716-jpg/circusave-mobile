/**
 * Circle contribution destinations (where members send money outside CircuSave).
 * Distinct from Settings Payment Preferences (payout handles) and Stripe.
 */

export const PAYMENT_DESTINATION_METHODS = [
  'zelle',
  'cashapp',
  'venmo',
  'paypal',
  'cash',
  'bank',
  'other',
] as const;

export type PaymentDestinationMethod =
  (typeof PAYMENT_DESTINATION_METHODS)[number];

export type PaymentDestination = {
  method: PaymentDestinationMethod;
  destination: string;
  memo?: string;
};

export const MAX_PAYMENT_DESTINATIONS = 5;
export const MAX_PAYMENT_DESTINATION_LENGTH = 280;
export const MAX_PAYMENT_DESTINATION_MEMO_LENGTH = 80;
export const PAYMENT_INSTRUCTIONS_MAX_LENGTH = 280;

const METHOD_SET = new Set<string>(PAYMENT_DESTINATION_METHODS);

const COMPOSE_LABELS: Record<PaymentDestinationMethod, string> = {
  zelle: 'Zelle',
  cashapp: 'Cash App',
  venmo: 'Venmo',
  paypal: 'PayPal',
  cash: 'Cash',
  bank: 'Bank transfer',
  other: 'Other',
};

export function isPaymentDestinationMethod(
  value: unknown,
): value is PaymentDestinationMethod {
  return typeof value === 'string' && METHOD_SET.has(value);
}

export function normalizePaymentDestination(
  raw: unknown,
): PaymentDestination | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const row = raw as {
    method?: unknown;
    destination?: unknown;
    memo?: unknown;
  };
  if (!isPaymentDestinationMethod(row.method)) {
    return null;
  }
  const destination = String(row.destination ?? '')
    .trim()
    .slice(0, MAX_PAYMENT_DESTINATION_LENGTH);
  const memo = String(row.memo ?? '')
    .trim()
    .slice(0, MAX_PAYMENT_DESTINATION_MEMO_LENGTH);
  if (!destination && row.method !== 'cash') {
    return null;
  }
  const normalized: PaymentDestination = {
    method: row.method,
    destination,
  };
  if (memo) {
    normalized.memo = memo;
  }
  return normalized;
}

export function normalizePaymentDestinations(
  raw: unknown,
): PaymentDestination[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const destinations: PaymentDestination[] = [];
  for (const entry of raw) {
    if (destinations.length >= MAX_PAYMENT_DESTINATIONS) {
      break;
    }
    const normalized = normalizePaymentDestination(entry);
    if (normalized) {
      destinations.push(normalized);
    }
  }
  return destinations;
}

export function composePaymentInstructions(
  destinations: PaymentDestination[],
): string {
  const parts = destinations.map((destination) => {
    const label = COMPOSE_LABELS[destination.method];
    const line =
      destination.destination.length > 0
        ? `${label}: ${destination.destination}`
        : label;
    return destination.memo ? `${line}\n${destination.memo}` : line;
  });
  const text = parts.join('\n');
  if (text.length <= PAYMENT_INSTRUCTIONS_MAX_LENGTH) {
    return text;
  }
  return `${text.slice(0, PAYMENT_INSTRUCTIONS_MAX_LENGTH - 1)}…`;
}

export function presentCirclePaymentInstructions(input: {
  paymentInstructions?: string | null;
  paymentDestinations?: unknown;
}): {
  destinations: PaymentDestination[];
  instructions: string | null;
  hasInstructions: boolean;
} {
  const destinations = normalizePaymentDestinations(input.paymentDestinations);
  const fallback = String(input.paymentInstructions ?? '').trim();
  const instructions = destinations.length
    ? composePaymentInstructions(destinations)
    : fallback || null;
  return {
    destinations,
    instructions,
    hasInstructions: destinations.length > 0 || Boolean(instructions),
  };
}

export function destinationsForPaymentSetupEditor(input: {
  paymentInstructions?: string | null;
  paymentDestinations?: unknown;
}): PaymentDestination[] {
  const presented = presentCirclePaymentInstructions(input);
  if (presented.destinations.length > 0) {
    return presented.destinations;
  }
  if (presented.instructions) {
    return [
      {
        method: 'other',
        destination: presented.instructions.slice(
          0,
          MAX_PAYMENT_DESTINATION_LENGTH,
        ),
      },
    ];
  }
  return [];
}
