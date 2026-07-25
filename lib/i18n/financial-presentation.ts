import type { TFunction } from 'i18next';

import type { BackendLedgerEntry, BackendWalletTransaction } from '@/lib/api';
import type { BackendActivity } from '@/lib/types';

export type NotificationType =
  | 'contribution_due'
  | 'contribution_overdue'
  | 'payment_submitted'
  | 'payment_confirmed'
  | 'payment_rejected'
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

export function contributionStatusLabel(status: unknown, t: TFunction): string {
  const normalized = String(status || 'unavailable').trim().toLowerCase();
  const supported = new Set([
    'due',
    'submitted',
    'confirmed',
    'late',
    'missed',
    'rejected',
    'pending',
  ]);
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
    return t('activity:events.contribution_confirmed');
  }
  if (type.includes('contribution') && type.includes('rejected')) {
    return t('activity:events.contribution_rejected');
  }
  if (
    type.includes('payout') &&
    (type.includes('released') || type.includes('received'))
  ) {
    return t('activity:events.payout_released', { name, round });
  }
  if (type.includes('payout') && type.includes('completed')) {
    return t('activity:events.payout_completed');
  }
  if (type.includes('round') && type.includes('started')) {
    return t('activity:events.round_started', { round });
  }
  if (type.includes('review') && type.includes('required')) {
    return t('activity:events.payment_review_required');
  }
  return t('activity:unknownEvent');
}

export function notificationCopy(
  type: string,
  data: { name?: string; round?: number | string; circle?: string },
  t: TFunction,
): { title: string; body: string } {
  const supported: NotificationType[] = [
    'contribution_due',
    'contribution_overdue',
    'payment_submitted',
    'payment_confirmed',
    'payment_rejected',
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
  return {
    title: t(`notifications:${type}.title`, data),
    body: t(`notifications:${type}.body`, data),
  };
}
