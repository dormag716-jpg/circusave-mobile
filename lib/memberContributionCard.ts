import type { TFunction } from 'i18next';

import type {
  BackendCircleMember,
  BackendRoundContribution,
  BackendViewerHand,
} from '@/lib/api';
import {
  presentCirclePaymentInstructions,
  type PaymentDestination,
} from '@/lib/paymentDestinations';
import {
  presentManualContribution,
  type ManualContributionPresentation,
} from '@/lib/i18n/financial-presentation';
import { getFormattingLocale } from '@/lib/i18n/formatters';

export type ViewerHandLike = Pick<
  BackendCircleMember,
  | 'id'
  | 'handId'
  | 'userId'
  | 'isParticipating'
  | 'handNumber'
  | 'hand_number'
  | 'displayLabel'
  | 'name'
  | 'full_name'
  | 'handLabel'
>;

export type MemberContributionHandView = {
  handId: string;
  handNumber: number;
  label: string;
  amount: number;
  statusRaw: string;
  presentation: ManualContributionPresentation;
  submittedAt: string | null;
  note: string | null;
  paymentReference: string | null;
  rejectReason: string | null;
  rejectReasonCode: string | null;
};

export type MemberContributionCardModel = {
  hands: MemberContributionHandView[];
  reportableHandCount: number;
  awaitingHandCount: number;
  confirmedHandCount: number;
  totalDue: number;
  hasInstructions: boolean;
  instructions: string | null;
  destinations: PaymentDestination[];
  showHandRows: boolean;
  anyReportable: boolean;
  allConfirmed: boolean;
};

function readHandId(hand: ViewerHandLike | BackendViewerHand): string {
  if ('id' in hand && hand.id) {
    return String(hand.id);
  }
  const viewer = hand as BackendViewerHand;
  return String(viewer.handId || viewer.memberId || '');
}

function readHandNumber(hand: ViewerHandLike | BackendViewerHand): number {
  const raw =
    'handNumber' in hand
      ? hand.handNumber ?? ('hand_number' in hand ? hand.hand_number : undefined)
      : (hand as BackendViewerHand).handNumber;
  const value = Number(raw ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function collectViewerParticipatingHands(input: {
  userId?: string | null;
  members?: ViewerHandLike[] | null;
  viewerHands?: Array<ViewerHandLike | BackendViewerHand> | null;
}): ViewerHandLike[] {
  const userId = String(input.userId || '').trim();
  const fromViewerHands: ViewerHandLike[] = [];
  for (const hand of input.viewerHands || []) {
    const handId = readHandId(hand);
    if (!handId) {
      continue;
    }
    const participating =
      'isParticipating' in hand ? hand.isParticipating !== false : true;
    if (!participating) {
      continue;
    }
    fromViewerHands.push({
      id: handId,
      handId,
      handNumber: readHandNumber(hand),
      displayLabel:
        'displayLabel' in hand
          ? hand.displayLabel
          : (hand as BackendViewerHand).displayLabel,
      handLabel:
        'handLabel' in hand
          ? hand.handLabel
          : (hand as BackendViewerHand).handLabel,
      name: 'name' in hand ? hand.name : undefined,
      full_name: 'full_name' in hand ? hand.full_name : undefined,
      userId: 'userId' in hand ? hand.userId : userId,
      isParticipating: true,
    });
  }

  if (fromViewerHands.length > 0) {
    return fromViewerHands.sort(
      (a, b) => readHandNumber(a) - readHandNumber(b),
    );
  }

  if (!userId) {
    return [];
  }

  return (input.members || [])
    .filter(
      (member) =>
        String(member.userId || '').trim() === userId &&
        member.isParticipating !== false,
    )
    .slice()
    .sort((a, b) => readHandNumber(a) - readHandNumber(b));
}

export function formatContributionReportedAt(
  submittedAt: string | null | undefined,
  language: string,
): string | null {
  const raw = String(submittedAt || '').trim();
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(getFormattingLocale(language), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function buildMemberContributionCardModel(input: {
  hands: ViewerHandLike[];
  contributions?: BackendRoundContribution[] | null;
  currentRoundNumber?: number | null;
  contributionAmount: number;
  paymentInstructions?: string | null;
  paymentDestinations?: unknown;
  statusByHandId?: Record<string, string>;
  t: TFunction;
}): MemberContributionCardModel {
  const amount = Number(input.contributionAmount) || 0;
  const roundNumber = input.currentRoundNumber;
  const presented = presentCirclePaymentInstructions({
    paymentInstructions: input.paymentInstructions,
    paymentDestinations: input.paymentDestinations,
  });
  const instructions = presented.hasInstructions ? presented.instructions : null;

  const hands = input.hands.map((hand) => {
    const handId = readHandId(hand);
    const contribution = (input.contributions || []).find(
      (entry) =>
        entry.memberId === handId &&
        (roundNumber == null || entry.round === roundNumber),
    );
    const statusRaw = String(
      input.statusByHandId?.[handId] || contribution?.status || 'due',
    )
      .trim()
      .toLowerCase();
    const handNumber = readHandNumber(hand);
    return {
      handId,
      handNumber,
      label:
        String(hand.displayLabel || hand.handLabel || '').trim() ||
        `Hand ${handNumber}`,
      amount,
      statusRaw,
      presentation: presentManualContribution(statusRaw, input.t),
      submittedAt: contribution?.submittedAt ?? null,
      note: String(contribution?.note || '').trim() || null,
      paymentReference:
        String(contribution?.paymentReference || '').trim() || null,
      rejectReason: String(contribution?.rejectReason || '').trim() || null,
      rejectReasonCode:
        String(contribution?.rejectReasonCode || '').trim() || null,
    };
  });

  const reportableHandCount = hands.filter(
    (hand) => hand.presentation.canReportPayment,
  ).length;
  const awaitingHandCount = hands.filter(
    (hand) => hand.presentation.awaitingOrganizer,
  ).length;
  const confirmedHandCount = hands.filter(
    (hand) => hand.presentation.isConfirmed,
  ).length;

  return {
    hands,
    reportableHandCount,
    awaitingHandCount,
    confirmedHandCount,
    totalDue: amount * reportableHandCount,
    hasInstructions: presented.hasInstructions,
    instructions,
    destinations: presented.destinations,
    showHandRows: hands.length > 1,
    anyReportable: reportableHandCount > 0,
    allConfirmed: hands.length > 0 && confirmedHandCount === hands.length,
  };
}
