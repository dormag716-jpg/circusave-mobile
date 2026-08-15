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
 * Presentation-only split of contribution.tsx rails.
 * Does not decide submit permission, Stripe lock, or settlement.
 */
export function buildContributionPaymentRails(input: {
  paymentInstructions?: string | null;
  paymentDestinations?: unknown;
  stripeSupported: boolean;
}): ContributionPaymentRailsModel {
  const presented = presentCirclePaymentInstructions({
    paymentInstructions: input.paymentInstructions,
    paymentDestinations: input.paymentDestinations,
  });
  return {
    showStripeRail: input.stripeSupported === true,
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
