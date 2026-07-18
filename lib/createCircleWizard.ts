/**
 * Pure helpers for the create-circle wizard (name → contribution → participation →
 * planned members → review/create draft).
 *
 * Initial wizard does not finalize payout order. Order is set later in setup
 * (People / Start Circle) after claims and additional-hand approvals.
 * Kept free of React Native imports so Jest can unit-test without a RN environment.
 */

export const ORGANIZER_HAND_DRAFT_ID = 'organizer-hand-1';
export const MAX_HANDS_PER_PERSON = 3;

/** Copy shown on create-wizard review — payout order is not final here. */
export const PAYOUT_ORDER_DEFERRED_COPY =
  'Payout order will be finalized after members claim their spots and any additional hands are approved.';

export type MemberDraft = {
  draftId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  handNumber?: number;
};

export type OrganizerIdentity = {
  id?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
};

export type CreateCircleWizardDraft = {
  activeStep?: number;
  circleName?: string;
  amount?: string;
  customAmount?: string;
  schedule?: string;
  members?: MemberDraft[];
  organizerParticipates?: boolean;
  /** @deprecated Legacy drafts only — ignored by the initial wizard. */
  payoutOrder?: string[];
};

export type CircleMetrics = {
  people: number;
  totalHands: number;
  contributionPerHand: number;
  potSize: number;
  rounds: number;
};

export function createMemberDraftId(): string {
  return `md_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

export function ensureMemberDraftId(member: MemberDraft): MemberDraft {
  if (member.draftId) {
    return {
      ...member,
      handNumber: member.handNumber && member.handNumber > 0 ? member.handNumber : 1,
    };
  }
  return {
    ...member,
    draftId: createMemberDraftId(),
    handNumber: member.handNumber && member.handNumber > 0 ? member.handNumber : 1,
  };
}

export function memberDisplayName(member: MemberDraft): string {
  return `${member.firstName} ${member.lastName}`.trim();
}

export function handDisplayLabel(name: string, handNumber = 1): string {
  return `${name} · Hand ${handNumber}`;
}

function normalizeDigits(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '');
}

/** True when a draft member row is the authenticated organizer. */
export function isOrganizerSelf(
  member: MemberDraft,
  organizer: OrganizerIdentity | null | undefined,
): boolean {
  if (!organizer) {
    return false;
  }
  const orgEmail = String(organizer.email || '')
    .trim()
    .toLowerCase();
  const memberEmail = String(member.email || '')
    .trim()
    .toLowerCase();
  if (orgEmail && memberEmail && orgEmail === memberEmail) {
    return true;
  }
  const orgPhone = normalizeDigits(organizer.phone);
  const memberPhone = normalizeDigits(member.phone);
  if (orgPhone.length >= 7 && memberPhone.length >= 7 && orgPhone === memberPhone) {
    return true;
  }
  return false;
}

/**
 * Rebuild a provisional hand order from participating hands.
 * Kept for later setup/People flows — not used to finalize order at create.
 */
export function reconcilePayoutOrder(
  members: MemberDraft[],
  organizerParticipates: boolean,
  previousOrder: string[] = [],
): string[] {
  const allowed: string[] = [];
  if (organizerParticipates) {
    allowed.push(ORGANIZER_HAND_DRAFT_ID);
  }
  for (const member of members) {
    allowed.push(member.draftId);
  }
  const allowedSet = new Set(allowed);
  const kept = previousOrder.filter((id) => allowedSet.has(id));
  const keptSet = new Set(kept);
  for (const id of allowed) {
    if (!keptSet.has(id)) {
      kept.push(id);
    }
  }
  return kept;
}

export function moveHandInOrder(
  order: string[],
  draftId: string,
  direction: 'up' | 'down',
): string[] {
  const index = order.indexOf(draftId);
  if (index < 0) {
    return order;
  }
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= order.length) {
    return order;
  }
  const next = [...order];
  const temp = next[swapWith];
  next[swapWith] = next[index];
  next[index] = temp;
  return next;
}

export function calculateCircleMetrics(
  members: MemberDraft[],
  organizerParticipates: boolean,
  contributionPerHand: number,
): CircleMetrics {
  const totalHands = members.length + (organizerParticipates ? 1 : 0);
  const people = members.length + (organizerParticipates ? 1 : 0);
  const amount =
    Number.isFinite(contributionPerHand) && contributionPerHand > 0
      ? contributionPerHand
      : 0;
  return {
    people,
    totalHands,
    contributionPerHand: amount,
    potSize: amount * totalHands,
    rounds: totalHands,
  };
}

export type PlannedPersonRow = {
  key: string;
  name: string;
  handNumber: number;
  isOrganizer: boolean;
  phone?: string;
  label: string;
  roleLabel: string;
};

/**
 * Planned people/hands for the create-wizard review screen (not a final payout order).
 * Organizer (if participating) first, then invited members in add order — each Hand 1.
 */
export function buildPlannedMemberRows(
  members: MemberDraft[],
  organizerParticipates: boolean,
  organizerName: string,
): PlannedPersonRow[] {
  const rows: PlannedPersonRow[] = [];
  if (organizerParticipates) {
    const name = organizerName.trim() || 'Organizer';
    rows.push({
      key: ORGANIZER_HAND_DRAFT_ID,
      name,
      handNumber: 1,
      isOrganizer: true,
      label: handDisplayLabel(name, 1),
      roleLabel: 'Organizer · participates',
    });
  }
  for (const member of members) {
    const name = memberDisplayName(member) || 'Member';
    const handNumber = member.handNumber && member.handNumber > 0 ? member.handNumber : 1;
    rows.push({
      key: member.draftId,
      name,
      handNumber,
      isOrganizer: false,
      phone: member.phone,
      label: handDisplayLabel(name, handNumber),
      roleLabel: member.phone || 'Planned member',
    });
  }
  return rows;
}

/** @deprecated Use buildPlannedMemberRows for create review; kept for tests / later setup. */
export function buildPayoutRows(
  payoutOrder: string[],
  members: MemberDraft[],
  organizerName: string,
): PlannedPersonRow[] {
  const byId = new Map(members.map((m) => [m.draftId, m]));
  return payoutOrder.map((id) => {
    if (id === ORGANIZER_HAND_DRAFT_ID) {
      const name = organizerName.trim() || 'Organizer';
      return {
        key: id,
        name,
        handNumber: 1,
        isOrganizer: true,
        label: handDisplayLabel(name, 1),
        roleLabel: 'Organizer · participates',
      };
    }
    const member = byId.get(id);
    const name = member ? memberDisplayName(member) : 'Member';
    const handNumber = member?.handNumber ?? 1;
    return {
      key: id,
      name,
      handNumber,
      isOrganizer: false,
      phone: member?.phone,
      label: handDisplayLabel(name, handNumber),
      roleLabel: member?.phone || 'Member',
    };
  });
}

export type CreateCirclePayloadShape = {
  name: string;
  contributionAmount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  startDate: string;
  organizerParticipates: boolean;
  organizerHandCount?: number;
  members: Array<{
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
  }>;
};

/**
 * Map wizard state to CreateCircleInput.
 * Does not send organizerPayoutPosition — order is not finalized at create.
 * Planned members are one hand each, in add order.
 */
export function buildCreateCirclePayload(input: {
  circleName: string;
  contributionAmount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  startDate: string;
  members: MemberDraft[];
  organizerParticipates: boolean;
}): CreateCirclePayloadShape {
  const payload: CreateCirclePayloadShape = {
    name: input.circleName.trim() || 'Untitled Circle',
    contributionAmount: input.contributionAmount,
    frequency: input.frequency,
    startDate: input.startDate,
    organizerParticipates: input.organizerParticipates,
    members: input.members.map((member) => ({
      firstName: member.firstName,
      lastName: member.lastName,
      phone: member.phone,
      email: member.email || undefined,
    })),
  };

  if (input.organizerParticipates) {
    payload.organizerHandCount = 1;
  }

  return payload;
}

export function applyDraftDefaults(
  draft: CreateCircleWizardDraft,
  maxStepIndex = 4,
): Required<
  Pick<
    CreateCircleWizardDraft,
    | 'activeStep'
    | 'circleName'
    | 'amount'
    | 'customAmount'
    | 'schedule'
    | 'members'
    | 'organizerParticipates'
  >
> {
  const members = (draft.members ?? []).map(ensureMemberDraftId);
  // Default matches prior product behavior: organizer participates.
  const organizerParticipates =
    typeof draft.organizerParticipates === 'boolean'
      ? draft.organizerParticipates
      : true;
  let activeStep = typeof draft.activeStep === 'number' ? draft.activeStep : 0;
  // Clamp legacy drafts that pointed at the removed payout-order step (old index 4)
  // or review (old index 5) onto the new 0..maxStepIndex range.
  if (activeStep > maxStepIndex) {
    activeStep = maxStepIndex;
  }
  if (activeStep < 0) {
    activeStep = 0;
  }
  return {
    activeStep,
    circleName: draft.circleName ?? '',
    amount: draft.amount ?? '$100',
    customAmount: draft.customAmount ?? '',
    schedule: draft.schedule ?? 'Weekly',
    members,
    organizerParticipates,
  };
}

export function validateMinimumHands(
  members: MemberDraft[],
  organizerParticipates: boolean,
): string | null {
  const totalHands = members.length + (organizerParticipates ? 1 : 0);
  if (totalHands < 2) {
    return organizerParticipates
      ? 'Add at least 1 other member so the circle has 2 hands.'
      : 'Add at least 2 members (you are organizing only).';
  }
  return null;
}

/**
 * Plan capacity for create wizard (mirrors backend free 20 / premium 50 hands).
 * Prefer server enforcement; this blocks obviously over-cap drafts client-side.
 */
export function validatePlanCapacity(
  members: MemberDraft[],
  organizerParticipates: boolean,
  organizerRoleOrTier?: string | null,
): string | null {
  // Lazy import pattern avoided — keep wizard free of heavy deps.
  // Inline same limits as lib/circleCapacity.ts.
  const raw = String(organizerRoleOrTier || '')
    .trim()
    .toLowerCase();
  const isPremium =
    raw === 'premium' ||
    raw === 'pro' ||
    raw === 'circle pro' ||
    raw === 'circle_pro' ||
    raw === 'premium organizer';
  const maxHands = isPremium ? 50 : 20;
  const totalHands = members.length + (organizerParticipates ? 1 : 0);
  if (totalHands > maxHands) {
    return isPremium
      ? `Premium circles support up to ${maxHands} participating hands.`
      : `Free circles support up to ${maxHands} participating hands. Upgrade to Premium for up to 50.`;
  }
  return null;
}

/**
 * Validates a provisional payout order (for later setup flows / unit tests).
 * Not used by the initial create wizard.
 */
export function validatePayoutOrder(
  payoutOrder: string[],
  members: MemberDraft[],
  organizerParticipates: boolean,
): string | null {
  const expected = reconcilePayoutOrder(members, organizerParticipates, []);
  if (payoutOrder.length !== expected.length) {
    return 'Payout order is incomplete.';
  }
  const set = new Set(payoutOrder);
  if (set.size !== payoutOrder.length) {
    return 'Payout order has duplicate hands.';
  }
  for (const id of expected) {
    if (!set.has(id)) {
      return 'Payout order is missing a participating hand.';
    }
  }
  if (organizerParticipates) {
    const count = payoutOrder.filter((id) => id === ORGANIZER_HAND_DRAFT_ID).length;
    if (count !== 1) {
      return 'Organizer must appear exactly once in payout order.';
    }
  } else if (payoutOrder.includes(ORGANIZER_HAND_DRAFT_ID)) {
    return 'Non-participating organizer cannot appear in payout order.';
  }
  return null;
}
