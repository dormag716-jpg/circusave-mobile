/**
 * Pure save orchestration for circle payment-setup.
 * Keeps success/error/navigation decisions free of React Native so unit tests can cover them.
 */

export type PaymentSetupSaveInput = {
  token: string | null | undefined;
  circleId: string;
  instructions: string;
  updateCircleSettings: (
    token: string,
    circleId: string,
    settings: { paymentInstructions: string },
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
  const preservedInstructions = input.instructions;
  const trimmed = input.instructions.trim();

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

  try {
    await input.updateCircleSettings(input.token, input.circleId, {
      paymentInstructions: trimmed,
    });
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
