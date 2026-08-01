import type {
  AdditionalHandPreview,
  AgreementLanguage,
  CircleAgreementHand,
  CircleAgreementSnapshot,
} from './api';

export function normalizeAgreementLanguage(language: string): AgreementLanguage {
  const code = language.toLowerCase().split('-')[0];
  return code === 'es' || code === 'ht' ? code : 'en';
}

export function ownedAgreementHands(
  snapshot: CircleAgreementSnapshot,
  userId: string,
): CircleAgreementHand[] {
  return snapshot.hands
    .filter((hand) => hand.userId === userId)
    .sort((left, right) => left.handNumber - right.handNumber);
}

export function canSubmitAgreementAcceptance(input: {
  checked: boolean;
  submitting: boolean;
  structureCurrent: boolean;
  alreadyAccepted: boolean;
}): boolean {
  return (
    input.checked &&
    !input.submitting &&
    input.structureCurrent &&
    !input.alreadyAccepted
  );
}

export function shouldRefreshStaleSnapshot(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'status' in error &&
      (error as { status?: unknown }).status === 409,
  );
}

export function additionalHandFinancialRows(preview: AdditionalHandPreview) {
  return [
    ['currentRecurringObligation', preview.currentRecurringObligationCents],
    ['additionalRecurringObligation', preview.additionalRecurringObligationCents],
    ['newRecurringObligation', preview.newRecurringObligationCents],
    ['remainingRounds', preview.remainingRounds],
    ['additionalRemainingObligation', preview.additionalRemainingObligationCents],
    ['newTotalRemainingObligation', preview.newTotalRemainingObligationCents],
  ] as const;
}
