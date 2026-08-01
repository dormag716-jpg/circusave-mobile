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

/** Ordered payout positions for the final snapshot review (all hands). */
export function orderedSnapshotHands(
  snapshot: CircleAgreementSnapshot,
): CircleAgreementHand[] {
  const byId = new Map(snapshot.hands.map((hand) => [hand.handId, hand]));
  const ordered: CircleAgreementHand[] = [];
  for (const handId of snapshot.payoutOrder || []) {
    const hand = byId.get(handId);
    if (hand) ordered.push(hand);
  }
  if (ordered.length === snapshot.hands.length) return ordered;
  // Fallback if payoutOrder is incomplete: stable handNumber order.
  return [...snapshot.hands].sort((left, right) => left.payoutPosition - right.payoutPosition);
}

export function memberHasAcceptedCurrentSnapshot(
  snapshot: CircleAgreementSnapshot,
  userId: string,
): boolean {
  if (ownedAgreementHands(snapshot, userId).length === 0) return false;
  if (!snapshot.structureCurrent) return false;
  return (
    snapshot.alreadyAccepted.circleParticipationAgreement &&
    snapshot.alreadyAccepted.finalCircleSnapshot
  );
}

/**
 * Member workspace prompt for final circle acceptance.
 * Pure derivation from the backend snapshot — no navigation side effects.
 */
export type MemberAgreementPrompt =
  | { kind: 'none' }
  | { kind: 'waiting_for_snapshot' }
  | { kind: 'action_required' }
  | { kind: 'stale_structure' }
  | { kind: 'accepted' };

export function getMemberAgreementPrompt(input: {
  circleStarted: boolean;
  userId: string;
  /** True when the viewer owns at least one participating claimed hand. */
  isParticipatingMember: boolean;
  snapshot: CircleAgreementSnapshot | null;
}): MemberAgreementPrompt {
  if (input.circleStarted || !input.isParticipatingMember || !input.userId) {
    return { kind: 'none' };
  }
  if (!input.snapshot) {
    return { kind: 'waiting_for_snapshot' };
  }
  if (ownedAgreementHands(input.snapshot, input.userId).length === 0) {
    return { kind: 'none' };
  }
  if (!input.snapshot.structureCurrent) {
    return { kind: 'stale_structure' };
  }
  if (memberHasAcceptedCurrentSnapshot(input.snapshot, input.userId)) {
    return { kind: 'accepted' };
  }
  return { kind: 'action_required' };
}

export function shouldShowMemberAgreementBanner(
  prompt: MemberAgreementPrompt,
): boolean {
  return (
    prompt.kind === 'action_required' ||
    prompt.kind === 'waiting_for_snapshot' ||
    prompt.kind === 'stale_structure'
  );
}

export function memberCanOpenAgreementReview(
  prompt: MemberAgreementPrompt,
): boolean {
  return (
    prompt.kind === 'action_required' ||
    prompt.kind === 'accepted' ||
    prompt.kind === 'stale_structure' ||
    prompt.kind === 'waiting_for_snapshot'
  );
}

export function snapshotServiceFeeCents(
  snapshot: CircleAgreementSnapshot,
): number {
  const raw = snapshot.fees?.serviceFeeCents;
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : 0;
}
