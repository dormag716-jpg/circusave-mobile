import type {
  AdditionalHandPreview,
  AgreementLanguage,
  CircleAgreementHand,
  CircleAgreementReadiness,
  CircleAgreementSnapshot,
} from './api';

/** Durable agreement / structural blocker codes (backend-authoritative). */
export const AGREEMENT_BLOCKER_CODES = [
  'snapshot_missing',
  'structure_changed_after_acceptance',
  'organizer_agreement_missing',
  'organizer_snapshot_acceptance_missing',
  'member_acceptances_missing',
  'stale_acceptances',
] as const;

/** Ephemeral start-confirmation codes (submitted only in the start request). */
export const START_CONFIRMATION_CODES = [
  'payout_order_confirmation_missing',
  'unclaimed_hand_confirmation_missing',
] as const;

export type AgreementBlockerCode = (typeof AGREEMENT_BLOCKER_CODES)[number];
export type StartConfirmationCode = (typeof START_CONFIRMATION_CODES)[number];

/** i18n keys under agreements namespace for known readiness codes. */
export const AGREEMENT_BLOCKER_COPY_KEYS: Record<AgreementBlockerCode, string> = {
  snapshot_missing: 'blockerSnapshotMissing',
  structure_changed_after_acceptance: 'blockerStructureChanged',
  organizer_agreement_missing: 'blockerOrganizerAgreement',
  organizer_snapshot_acceptance_missing: 'blockerOrganizerSnapshot',
  member_acceptances_missing: 'blockerMemberAcceptances',
  stale_acceptances: 'blockerStaleAcceptances',
};

export const START_CONFIRMATION_COPY_KEYS: Record<StartConfirmationCode, string> = {
  payout_order_confirmation_missing: 'blockerPayoutOrderConfirmation',
  unclaimed_hand_confirmation_missing: 'blockerUnclaimedHandConfirmation',
};

/**
 * Localized status lines for the readiness card.
 * Prefer backend additive flags; never surface raw confirmation codes as primary copy.
 * Members do not receive organizer-only confirmation lines.
 */
export function getAgreementReadinessStatusKeys(input: {
  readiness: CircleAgreementReadiness | null;
  isOrganizer: boolean;
}): string[] {
  const readiness = input.readiness;
  if (!readiness) {
    return ['blockerSnapshotMissing'];
  }

  const keys: string[] = [];
  const agreementBlockers =
    readiness.agreementBlockers ??
    (readiness.blockers ?? []).filter(
      (code) => !(START_CONFIRMATION_CODES as readonly string[]).includes(code),
    );

  if (!readiness.snapshotPresent || agreementBlockers.includes('snapshot_missing')) {
    keys.push('blockerSnapshotMissing');
  } else if (!readiness.snapshotCurrent || agreementBlockers.includes('structure_changed_after_acceptance')) {
    keys.push('blockerStructureChanged');
  } else {
    if (
      !readiness.memberAcceptancesComplete ||
      agreementBlockers.includes('member_acceptances_missing')
    ) {
      keys.push('blockerMemberAcceptances');
    }
    if (agreementBlockers.includes('stale_acceptances') && !keys.includes('blockerMemberAcceptances')) {
      keys.push('blockerStaleAcceptances');
    }
    if (
      !readiness.organizerAgreementComplete ||
      agreementBlockers.includes('organizer_agreement_missing') ||
      agreementBlockers.includes('organizer_snapshot_acceptance_missing')
    ) {
      if (agreementBlockers.includes('organizer_agreement_missing')) {
        keys.push('blockerOrganizerAgreement');
      } else if (agreementBlockers.includes('organizer_snapshot_acceptance_missing')) {
        keys.push('blockerOrganizerSnapshot');
      } else {
        keys.push('blockerOrganizerAgreement');
      }
    }
  }

  // Any remaining unknown durable codes (should be rare).
  for (const code of agreementBlockers) {
    const mapped = AGREEMENT_BLOCKER_COPY_KEYS[code as AgreementBlockerCode];
    if (mapped && !keys.includes(mapped)) {
      keys.push(mapped);
    }
  }

  if (readiness.agreementsComplete || readiness.canOpenStartFlow) {
    keys.push('statusAgreementsComplete');
    if (input.isOrganizer) {
      if (readiness.requiresOrganizerStartConfirmation) {
        keys.push('blockerPayoutOrderConfirmation');
      }
      if (readiness.requiresUnclaimedHandConfirmation) {
        keys.push('blockerUnclaimedHandConfirmation');
      }
    }
  }

  return keys.length > 0 ? keys : ['notReady'];
}

/**
 * Start-button eligibility — structural readiness only (no agreement acceptances).
 * Prefer canStartCircle / canOpenStartFlow; never readyToStart.
 */
export function canEnableOrganizerStart(input: {
  readiness: CircleAgreementReadiness | null;
  startPayoutChecked: boolean;
  startUnclaimedChecked: boolean;
  busy: boolean;
}): boolean {
  if (input.busy) return false;
  const readiness = input.readiness;
  // When readiness is unavailable, allow the start attempt; backend enforces structure.
  if (!readiness) {
    return input.startPayoutChecked;
  }
  const structuralOk =
    readiness.canStartCircle === true ||
    readiness.canOpenStartFlow === true ||
    readiness.structureComplete === true;
  if (!structuralOk) return false;
  // Local product confirmations (structure lock) — not legal consent checkboxes.
  if (!input.startPayoutChecked) return false;
  if (readiness.requiresUnclaimedHandConfirmation && !input.startUnclaimedChecked) {
    return false;
  }
  return true;
}

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
  // Product change: members no longer complete acceptance/readiness actions.
  void input;
  return { kind: 'none' };
}

export function shouldShowMemberAgreementBanner(
  prompt: MemberAgreementPrompt,
): boolean {
  void prompt;
  return false;
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
