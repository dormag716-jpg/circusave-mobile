import type { TFunction } from 'i18next';

import type { BackendLedgerEntry, BackendWalletTransaction } from '@/lib/api';
import type { BackendActivity } from '@/lib/types';

export type NotificationType =
  | 'contribution_due'
  | 'contribution_overdue'
  | 'payment_submitted'
  | 'payment_confirmed'
  | 'payment_rejected'
  | 'payment_instructions_updated'
  | 'organizer_review_required'
  | 'payout_ready'
  | 'payout_completed'
  | 'round_started'
  | 'next_round_started'
  | 'circle_completed';

export function contributionTotal(input: {
  amountPerHand: number;
  handCount: number;
  serverTotal?: number | null;
}): number {
  return typeof input.serverTotal === 'number' &&
    Number.isFinite(input.serverTotal)
    ? input.serverTotal
    : input.amountPerHand * input.handCount;
}

export type ManualContributionAudience = 'member' | 'organizer';

export type ManualContributionSemanticState =
  | 'due'
  | 'overdue'
  | 'reported'
  | 'reported_late'
  | 'needs_attention'
  | 'confirmed'
  | 'unknown';

export type ManualContributionPresentation = {
  rawStatus: string;
  semanticState: ManualContributionSemanticState;
  primaryLabel: string;
  secondaryLabel: string | null;
  awaitingOrganizer: boolean;
  canReportPayment: boolean;
  isConfirmed: boolean;
  needsAttention: boolean;
  isOverdue: boolean;
  isLateReport: boolean;
};

const MANUAL_CONTRIBUTION_STATUSES = new Set([
  'due',
  'missed',
  'submitted',
  'late',
  'rejected',
  'confirmed',
]);

const STRIPE_LIFECYCLE_STATUSES = new Set([
  'disputed',
  'refunded',
  'chargeback',
  'partially_refunded',
  'restored',
]);

function normalizeContributionStatus(status: unknown): string {
  return String(status || '').trim().toLowerCase();
}

/**
 * User-facing manual contribution presentation.
 * Describes status only — does not decide whether mutations are allowed.
 */
export function presentManualContribution(
  status: unknown,
  t: TFunction,
  options?: { audience?: ManualContributionAudience },
): ManualContributionPresentation {
  const rawStatus = normalizeContributionStatus(status) || 'unavailable';
  const audience = options?.audience === 'organizer' ? 'organizer' : 'member';

  if (STRIPE_LIFECYCLE_STATUSES.has(rawStatus)) {
    return {
      rawStatus,
      semanticState: 'unknown',
      primaryLabel: t('contributions:statusLabels.unavailable'),
      secondaryLabel: null,
      awaitingOrganizer: false,
      canReportPayment: false,
      isConfirmed: false,
      needsAttention: false,
      isOverdue: false,
      isLateReport: false,
    };
  }

  if (rawStatus === 'due') {
    return {
      rawStatus,
      semanticState: 'due',
      primaryLabel: t('contributions:manualPresentation.due'),
      secondaryLabel: null,
      awaitingOrganizer: false,
      canReportPayment: true,
      isConfirmed: false,
      needsAttention: false,
      isOverdue: false,
      isLateReport: false,
    };
  }

  if (rawStatus === 'missed') {
    return {
      rawStatus,
      semanticState: 'overdue',
      primaryLabel: t('contributions:manualPresentation.overdue'),
      secondaryLabel: null,
      awaitingOrganizer: false,
      canReportPayment: true,
      isConfirmed: false,
      needsAttention: false,
      isOverdue: true,
      isLateReport: false,
    };
  }

  if (rawStatus === 'submitted') {
    return {
      rawStatus,
      semanticState: 'reported',
      primaryLabel:
        audience === 'organizer'
          ? t('contributions:manualPresentation.organizerReported')
          : t('contributions:manualPresentation.reported'),
      secondaryLabel: t('contributions:manualPresentation.waitingForOrganizer'),
      awaitingOrganizer: true,
      canReportPayment: false,
      isConfirmed: false,
      needsAttention: false,
      isOverdue: false,
      isLateReport: false,
    };
  }

  if (rawStatus === 'late') {
    return {
      rawStatus,
      semanticState: 'reported_late',
      primaryLabel:
        audience === 'organizer'
          ? t('contributions:manualPresentation.organizerReportedLate')
          : t('contributions:manualPresentation.reportedLate'),
      secondaryLabel: t('contributions:manualPresentation.waitingForOrganizer'),
      awaitingOrganizer: true,
      canReportPayment: false,
      isConfirmed: false,
      needsAttention: false,
      isOverdue: false,
      isLateReport: true,
    };
  }

  if (rawStatus === 'rejected') {
    return {
      rawStatus,
      semanticState: 'needs_attention',
      primaryLabel: t('contributions:manualPresentation.needsAttention'),
      secondaryLabel: null,
      awaitingOrganizer: false,
      canReportPayment: true,
      isConfirmed: false,
      needsAttention: true,
      isOverdue: false,
      isLateReport: false,
    };
  }

  if (rawStatus === 'confirmed') {
    return {
      rawStatus,
      semanticState: 'confirmed',
      primaryLabel: t('contributions:manualPresentation.confirmed'),
      secondaryLabel: null,
      awaitingOrganizer: false,
      canReportPayment: false,
      isConfirmed: true,
      needsAttention: false,
      isOverdue: false,
      isLateReport: false,
    };
  }

  const legacyPending = rawStatus === 'pending';
  return {
    rawStatus,
    semanticState: 'unknown',
    primaryLabel: t(
      `contributions:statusLabels.${legacyPending ? 'pending' : 'unavailable'}`,
    ),
    secondaryLabel: null,
    awaitingOrganizer: false,
    canReportPayment: false,
    isConfirmed: false,
    needsAttention: false,
    isOverdue: false,
    isLateReport: false,
  };
}

export function contributionStatusLabel(
  status: unknown,
  t: TFunction,
  options?: { audience?: ManualContributionAudience },
): string {
  const normalized = normalizeContributionStatus(status) || 'unavailable';
  if (MANUAL_CONTRIBUTION_STATUSES.has(normalized)) {
    return presentManualContribution(normalized, t, options).primaryLabel;
  }
  const supported = new Set(['pending']);
  return t(
    `contributions:statusLabels.${supported.has(normalized) ? normalized : 'unavailable'}`,
  );
}

export function roundStatusLabel(status: unknown, t: TFunction): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (['active', 'started', 'in_progress', 'collecting'].includes(normalized)) {
    return t('rounds:status.active');
  }
  if (['upcoming', 'scheduled', 'draft'].includes(normalized)) {
    return t('rounds:status.upcoming');
  }
  if (['completed', 'complete', 'paid', 'released'].includes(normalized)) {
    return t('rounds:status.completed');
  }
  if (normalized === 'paused') {
    return t('rounds:status.paused');
  }
  return t('rounds:status.unknown');
}

export function ledgerEventLabel(entry: BackendLedgerEntry, t: TFunction): string {
  const type = String(entry.event_type || entry.type || '').trim().toLowerCase();
  const exact = new Set([
    'contribution',
    'contribution_submitted',
    'contribution_confirmed',
    'contribution_rejected',
    'contribution_missed',
    'payout',
    'payout_released',
    'payout_completed',
    'adjustment',
    'refund',
    'fee',
  ]);
  if (exact.has(type)) {
    return t(`ledger:events.${type}`);
  }
  if (type.includes('contribution')) return t('ledger:events.contribution');
  if (type.includes('payout')) return t('ledger:events.payout');
  if (type.includes('refund')) return t('ledger:events.refund');
  if (type.includes('fee')) return t('ledger:events.fee');
  if (type.includes('adjust')) return t('ledger:events.adjustment');
  return t('ledger:unknownEvent');
}

export function walletTransactionLabel(
  transaction: BackendWalletTransaction,
  t: TFunction,
): string {
  const type = String(transaction.type || transaction.action || '').toLowerCase();
  if (type.includes('contribution') || type.includes('credit_pot')) {
    return t('wallet:types.contribution');
  }
  if (type.includes('payout') || type.includes('release')) {
    return t('wallet:types.payout');
  }
  if (type.includes('refund')) return t('wallet:types.refund');
  if (type.includes('fee')) return t('wallet:types.fee');
  return t('wallet:types.unknown');
}

export function walletStatusLabel(status: unknown, t: TFunction): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'pending') return t('wallet:statuses.pending');
  if (normalized === 'posted') return t('wallet:statuses.posted');
  if (normalized === 'completed') return t('wallet:statuses.completed');
  if (normalized === 'failed') return t('wallet:statuses.failed');
  return t('wallet:statuses.unknown');
}

export function activityEventSentence(
  entry: BackendActivity,
  t: TFunction,
  fields: { name?: string; round?: number | null } = {},
): string {
  const type = String(entry.type || '').trim().toLowerCase();
  const round = fields.round ?? entry.round ?? '';
  const name = fields.name || t('activity:unknownMember');

  if (type.includes('contribution') && type.includes('submitted')) {
    return t('activity:events.contribution_submitted', { name, round });
  }
  if (type.includes('contribution') && type.includes('confirmed')) {
    return t('activity:events.contribution_confirmed', { name, round });
  }
  if (type.includes('contribution') && type.includes('rejected')) {
    return t('activity:events.contribution_rejected', { name, round });
  }
  if (type.includes('contribution') && type.includes('missed')) {
    return t('activity:events.contribution_missed', { name, round });
  }
  if (
    type.includes('payout') &&
    (type.includes('released') ||
      type.includes('received') ||
      type.includes('completed'))
  ) {
    return t('activity:events.payout_released', { name, round });
  }
  if (type.includes('round') && type.includes('started')) {
    return t('activity:events.round_started', { round });
  }
  if (type.includes('review') && type.includes('required')) {
    return t('activity:events.payment_review_required', { name });
  }
  return t('activity:unknownEvent');
}

export function notificationCopy(
  type: string,
  data: {
    name?: string;
    round?: number | string;
    circle?: string;
    reason?: string;
  },
  t: TFunction,
): { title: string; body: string } {
  const supported: NotificationType[] = [
    'contribution_due',
    'contribution_overdue',
    'payment_submitted',
    'payment_confirmed',
    'payment_rejected',
    'payment_instructions_updated',
    'organizer_review_required',
    'payout_ready',
    'payout_completed',
    'round_started',
    'next_round_started',
    'circle_completed',
  ];
  if (!supported.includes(type as NotificationType)) {
    return {
      title: t('notifications:fallback.title'),
      body: t('notifications:fallback.body'),
    };
  }
  const reason = String(data.reason || '').trim();
  const bodyKey =
    type === 'payment_rejected' && reason
      ? 'notifications:payment_rejected.bodyWithReason'
      : `notifications:${type}.body`;
  return {
    title: t(`notifications:${type}.title`, data),
    body: t(bodyKey, data),
  };
}
