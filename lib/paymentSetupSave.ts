/**
 * Pure save orchestration for circle payment-setup.
 * Keeps success/error/navigation decisions free of React Native so unit tests can cover them.
 */

import {
  composePaymentInstructions,
  normalizePaymentDestinations,
  type PaymentDestination,
} from '@/lib/paymentDestinations';

export type PaymentSetupSettings = {
  paymentInstructions?: string;
  paymentDestinations?: PaymentDestination[];
};

export type PaymentSetupSaveInput = {
  token: string | null | undefined;
  circleId: string;
  instructions: string;
  destinations?: unknown;
  updateCircleSettings: (
    token: string,
    circleId: string,
    settings: PaymentSetupSettings,
  ) => Promise<unknown>;
};

export type PaymentSetupSaveResult =
  | {
      status: 'empty_instructions';
      shouldNavigate: false;
      preservedInstructions: string;
    }
  | {
      status: 'missing_token';
      shouldNavigate: false;
      preservedInstructions: string;
    }
  | {
      status: 'error';
      shouldNavigate: false;
      preservedInstructions: string;
      error: unknown;
    }
  | {
      status: 'success';
      shouldNavigate: true;
      preservedInstructions: string;
    };

export async function saveCirclePaymentInstructions(
  input: PaymentSetupSaveInput,
): Promise<PaymentSetupSaveResult> {
  const usingDestinations = input.destinations !== undefined;
  const destinations = usingDestinations
    ? normalizePaymentDestinations(input.destinations)
    : null;
  const composed = destinations ? composePaymentInstructions(destinations) : '';
  const trimmed = usingDestinations ? composed : input.instructions.trim();
  const preservedInstructions = usingDestinations
    ? composed || input.instructions
    : input.instructions;

  if (!trimmed) {
    return {
      status: 'empty_instructions',
      shouldNavigate: false,
      preservedInstructions,
    };
  }

  if (!input.token) {
    return {
      status: 'missing_token',
      shouldNavigate: false,
      preservedInstructions,
    };
  }

  const settings: PaymentSetupSettings = destinations
    ? {
        paymentDestinations: destinations,
        paymentInstructions: trimmed,
      }
    : { paymentInstructions: trimmed };

  try {
    await input.updateCircleSettings(input.token, input.circleId, settings);
  } catch (error) {
    return {
      status: 'error',
      shouldNavigate: false,
      preservedInstructions,
      error,
    };
  }

  return {
    status: 'success',
    shouldNavigate: true,
    preservedInstructions,
  };
}
