import type { TFunction } from 'i18next';

import type {
  BackendCircleMember,
  BackendRoundContribution,
} from '@/lib/api';
import {
  ORGANIZER_RECORDED_PAID_NOTE,
  presentClaimedContributionPayment,
} from '@/lib/contributionClaim';
import { presentManualContribution } from '@/lib/i18n/financial-presentation';

export const ORGANIZER_REJECT_REASON_CODES = [
  'not_received',
  'wrong_amount',
  'cant_verify',
  'other',
] as const;

export type OrganizerRejectReasonCode =
  (typeof ORGANIZER_REJECT_REASON_CODES)[number];

const REJECT_REASON_KEYS: Record<OrganizerRejectReasonCode, string> = {
  not_received: 'contributions:workspace.review.reasons.notReceived',
  wrong_amount: 'contributions:workspace.review.reasons.wrongAmount',
  cant_verify: 'contributions:workspace.review.reasons.cantVerify',
  other: 'contributions:workspace.review.reasons.other',
};

export function shouldShowOrganizerHandLabel(
  members: Array<Pick<BackendCircleMember, 'id' | 'userId'>>,
): boolean {
  const counts = new Map<string, number>();
  for (const member of members) {
    const key = String(member.userId || member.id || '').trim();
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.values()].some((count) => count > 1);
}

export function organizerReviewMemberLabel(
  member: Pick<
    BackendCircleMember,
    'displayLabel' | 'full_name' | 'name' | 'handNumber' | 'hand_number'
  >,
  input: { showHandLabel: boolean; handLabel: string },
): string {
  const name = String(member.full_name || member.name || '').trim();
  const display = String(member.displayLabel || '').trim();
  if (!input.showHandLabel) {
    return display || name || 'Unknown member';
  }
  if (display && display !== name) {
    return display;
  }
  const labeled = [name || display, input.handLabel].filter(Boolean).join(' · ');
  return labeled || 'Unknown member';
}

export function presentRejectReasonForMember(
  input: { rejectReason?: string | null; rejectReasonCode?: string | null },
  t: TFunction,
): string | null {
  const text = String(input.rejectReason || '').trim();
  if (text) {
    return text;
  }
  const code = String(input.rejectReasonCode || '').trim();
  if (ORGANIZER_REJECT_REASON_CODES.includes(code as OrganizerRejectReasonCode)) {
    return organizerRejectReasonLabel(code as OrganizerRejectReasonCode, t);
  }
  return null;
}

export function organizerRejectReasonLabel(
  code: OrganizerRejectReasonCode,
  t: TFunction,
): string {
  return t(REJECT_REASON_KEYS[code]);
}

export function organizerRejectReasonPayload(
  code: OrganizerRejectReasonCode,
  t: TFunction,
  otherText?: string | null,
): { reason: string; reasonCode: OrganizerRejectReasonCode } {
  const preset = organizerRejectReasonLabel(code, t);
  if (code !== 'other') {
    return { reason: preset, reasonCode: code };
  }
  const extra = String(otherText || '').trim();
  return { reason: extra || preset, reasonCode: code };
}

export function buildOrganizerReviewRowModel(input: {
  member: BackendCircleMember;
  contribution?: BackendRoundContribution | null;
  statusRaw: string;
  amount: number;
  showHandLabel: boolean;
  t: TFunction;
}) {
  const presentation = presentManualContribution(input.statusRaw, input.t, {
    audience: 'organizer',
  });
  const claimed = presentClaimedContributionPayment({
    paymentMethod: input.contribution?.paymentMethod,
    note: input.contribution?.note,
    paymentReference: input.contribution?.paymentReference,
  });
  const handNumber = Number(
    input.member.handNumber ?? input.member.hand_number ?? 1,
  );
  return {
    memberId: input.member.id,
    displayName: organizerReviewMemberLabel(input.member, {
      showHandLabel: input.showHandLabel,
      handLabel: input.t('contributions:workspace.handLabel', {
        number: Number.isFinite(handNumber) && handNumber > 0 ? handNumber : 1,
      }),
    }),
    amount: input.amount,
    statusRaw: input.statusRaw,
    statusLabel: presentation.primaryLabel,
    awaitingOrganizer: presentation.awaitingOrganizer,
    submittedAt: input.contribution?.submittedAt ?? null,
    paymentMethod: claimed.method,
    claimedDestination: claimed.destination,
    paymentReference: claimed.reference,
    note:
      claimed.destination ||
      String(input.contribution?.note || '').trim() === ORGANIZER_RECORDED_PAID_NOTE
        ? null
        : String(input.contribution?.note || '').trim() || null,
  };
}
