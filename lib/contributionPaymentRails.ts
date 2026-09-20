import {
  presentCirclePaymentInstructions,
  type PaymentDestination,
} from '@/lib/paymentDestinations';

export type ContributionPaymentRailsModel = {
  showStripeRail: boolean;
  showManualRail: boolean;
  hasInstructions: boolean;
  instructions: string | null;
  destinations: PaymentDestination[];
};

/**
 * Presentation-only contribution rails.
 * Circle contributions are external/manual only — never an in-app pay rail.
 */
export function buildContributionPaymentRails(input: {
  paymentInstructions?: string | null;
  paymentDestinations?: unknown;
  stripeSupported?: boolean;
  contributionPaymentsEnabled?: unknown;
}): ContributionPaymentRailsModel {
  const presented = presentCirclePaymentInstructions({
    paymentInstructions: input.paymentInstructions,
    paymentDestinations: input.paymentDestinations,
  });
  return {
    showStripeRail: false,
    showManualRail: true,
    hasInstructions: presented.hasInstructions,
    instructions: presented.instructions,
    destinations: presented.destinations,
  };
}

export function contributionRailsUseSameHand(input: {
  stripeHandId?: string | null;
  manualHandId?: string | null;
  selectedHandId?: string | null;
}): boolean {
  const selected = String(input.selectedHandId || '').trim();
  if (!selected) {
    return false;
  }
  return (
    String(input.stripeHandId || '').trim() === selected &&
    String(input.manualHandId || '').trim() === selected
  );
}
