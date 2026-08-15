import type { MemberContributionCardModel, MemberContributionHandView } from './memberContributionCard';

export type MarkAsSentTarget = {
  handId: string;
  amount: number;
  handNumber: number;
};

export function reportableContributionHands(
  card: MemberContributionCardModel,
): MemberContributionHandView[] {
  return card.hands.filter((hand) => hand.presentation.canReportPayment);
}

export function shouldSubmitMarkAsSentFromWorkspace(
  card: MemberContributionCardModel,
  destinationCount = 0,
): boolean {
  return (
    reportableContributionHands(card).length === 1 && destinationCount <= 1
  );
}

export function resolveMarkAsSentTarget(
  card: MemberContributionCardModel,
  requestedHandId?: string | null,
): MarkAsSentTarget | null {
  const reportable = reportableContributionHands(card);
  if (reportable.length !== 1) {
    return null;
  }
  const hand = reportable[0];
  const requested = String(requestedHandId || '').trim();
  if (requested && requested !== hand.handId) {
    return null;
  }
  return {
    handId: hand.handId,
    amount: hand.amount,
    handNumber: hand.handNumber,
  };
}

export function resolveMarkAsSentContributionHrefHandId(
  card: MemberContributionCardModel,
  requestedHandId?: string | null,
  destinationCount = 0,
): string | null {
  const reportable = reportableContributionHands(card);
  const requested = String(requestedHandId || '').trim();
  if (reportable.length > 1) {
    if (!requested) {
      return null;
    }
    return reportable.some((hand) => hand.handId === requested)
      ? requested
      : null;
  }
  if (destinationCount > 1 && reportable.length === 1) {
    const hand = reportable[0];
    if (!requested || requested === hand.handId) {
      return hand.handId;
    }
    return null;
  }
  return null;
}

export function canStartMarkAsSentSubmit(input: {
  canSubmit: boolean;
  target: MarkAsSentTarget | null;
  inflightHandId?: string | null;
}): boolean {
  return (
    input.canSubmit === true &&
    Boolean(input.target?.handId) &&
    !input.inflightHandId
  );
}

export function isAlreadyReportedSubmissionError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error || '')
  ).toLowerCase();
  return (
    message.includes('due, missed, or rejected') ||
    message.includes('already has sufficient recognized funding') ||
    message.includes('already has confirmed pot funding')
  );
}
