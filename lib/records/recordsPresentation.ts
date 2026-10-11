/**
 * Records presentation helpers. Pure, no React: every financial value and every visibility
 * decision comes from the backend; this only maps backend vocabulary to what the user reads.
 */
import type {
  RecordActor,
  RecordPosition,
  RecordVerification,
} from '@/lib/api';
import { formatCurrency } from '@/lib/i18n/formatters';

export type RecordsSegment =
  | 'overview'
  | 'contributions'
  | 'payouts'
  | 'rounds'
  | 'documents';

export const RECORDS_SEGMENTS: readonly RecordsSegment[] = [
  'overview',
  'contributions',
  'payouts',
  'rounds',
  'documents',
];

export const DEFAULT_RECORDS_SEGMENT: RecordsSegment = 'overview';

/** Backend contribution statuses, in the order the filter chips show them. */
export const CONTRIBUTION_STATUS_FILTERS = [
  'due',
  'submitted',
  'confirmed',
  'rejected',
  'late',
  'missed',
] as const;

/** Backend payout statuses. The app shows `pending` as "Scheduled". */
export const PAYOUT_STATUS_FILTERS = ['pending', 'released'] as const;

export const ROUND_STATUS_FILTERS = ['open', 'closed'] as const;

export const RECORDS_PAGE_SIZE = 50;

export type ContributionStatusKey =
  | (typeof CONTRIBUTION_STATUS_FILTERS)[number]
  | 'unknown';

export function contributionStatusKey(
  status: string | null | undefined,
): ContributionStatusKey {
  const value = String(status || '').trim().toLowerCase();
  return (CONTRIBUTION_STATUS_FILTERS as readonly string[]).includes(value)
    ? (value as ContributionStatusKey)
    : 'unknown';
}

/** A submitted or late report is waiting for the organizer. */
export function contributionNeedsReview(
  status: string | null | undefined,
): boolean {
  const key = contributionStatusKey(status);
  return key === 'submitted' || key === 'late';
}

export type PayoutDisplayStatus = 'scheduled' | 'released' | 'unknown';

/** `pending` is a scheduled payout. There is deliberately no "ready" state. */
export function payoutDisplayStatus(
  status: string | null | undefined,
): PayoutDisplayStatus {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'pending') return 'scheduled';
  if (value === 'released') return 'released';
  return 'unknown';
}

/** `pending` is a round that has not started yet. */
export type RoundDisplayStatus = 'open' | 'closed' | 'upcoming' | 'unknown';

export function roundDisplayStatus(
  status: string | null | undefined,
): RoundDisplayStatus {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'pending') return 'upcoming';
  return value === 'open' || value === 'closed' ? value : 'unknown';
}

export type VerificationKey =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'reopened';

export function verificationKey(
  verification: Pick<RecordVerification, 'status'> | null | undefined,
): VerificationKey {
  const value = String(verification?.status || '').trim().toLowerCase();
  return (['pending', 'verified', 'rejected', 'reopened'] as const).includes(
    value as 'pending' | 'verified' | 'rejected' | 'reopened',
  )
    ? (value as VerificationKey)
    : 'unverified';
}

export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const CONTRIBUTION_TONES: Record<ContributionStatusKey, StatusTone> = {
  due: 'neutral',
  submitted: 'info',
  confirmed: 'success',
  rejected: 'danger',
  late: 'warning',
  missed: 'danger',
  unknown: 'neutral',
};

export function contributionTone(status: string | null | undefined): StatusTone {
  return CONTRIBUTION_TONES[contributionStatusKey(status)];
}

export function payoutTone(status: string | null | undefined): StatusTone {
  const key = payoutDisplayStatus(status);
  return key === 'released' ? 'success' : key === 'scheduled' ? 'info' : 'neutral';
}

export function roundTone(status: string | null | undefined): StatusTone {
  const key = roundDisplayStatus(status);
  return key === 'closed' ? 'success' : key === 'open' ? 'info' : 'neutral';
}

export type DocumentTypeKey = 'contribution' | 'payout' | 'round' | 'statement';

const DOCUMENT_TYPE_KEYS: Record<string, DocumentTypeKey> = {
  circuSave_contribution_record: 'contribution',
  circuSave_payout_record: 'payout',
  circuSave_round_record: 'round',
};

/** Saved documents: a record document by its type, everything else is a member statement. */
export function documentTypeKey(documentType: string | null | undefined): DocumentTypeKey {
  return DOCUMENT_TYPE_KEYS[String(documentType || '')] ?? 'statement';
}

const GENERIC_POSITION = /^position\s+\d+$/i;

/**
 * Who a record is about. The backend sends a name only when this viewer may see it and a
 * generic "Position N" otherwise. The generic form is re-localized here from the number so a
 * member never reads another member's personal name and the wording follows the app language.
 */
export function positionLabel(
  position: Pick<RecordPosition, 'number' | 'label'> | null | undefined,
  positionText: (number: number) => string,
  fallback: string,
): string {
  if (!position) return fallback;
  const label = String(position.label || '').trim();
  if (!label || GENERIC_POSITION.test(label)) {
    return Number.isFinite(position.number) && position.number > 0
      ? positionText(position.number)
      : fallback;
  }
  return label;
}

export type HistoryEventKey =
  | 'submitted'
  | 'confirmed'
  | 'rejected'
  | 'reopened'
  | 'late'
  | 'missed'
  | 'payoutReleased'
  | 'roundStarted'
  | 'roundClosed'
  | 'cycleCompleted'
  | 'recorded';

const HISTORY_EVENT_KEYS: Record<string, HistoryEventKey> = {
  submitted: 'submitted',
  confirmed: 'confirmed',
  rejected: 'rejected',
  reopened: 'reopened',
  late: 'late',
  missed: 'missed',
  contribution_submitted: 'submitted',
  contribution_confirmed: 'confirmed',
  contribution_rejected: 'rejected',
  contribution_reopened: 'reopened',
  contribution_late: 'late',
  contribution_missed: 'missed',
  payout_completed: 'payoutReleased',
  round_started: 'roundStarted',
  round_closed: 'roundClosed',
  cycle_completed: 'cycleCompleted',
};

/** Unknown event types read as a neutral "Recorded", never as a raw backend identifier. */
export function historyEventKey(type: string | null | undefined): HistoryEventKey {
  return HISTORY_EVENT_KEYS[String(type || '').trim().toLowerCase()] ?? 'recorded';
}

export type ActorKey = 'organizer' | 'member' | 'system';

export function actorKey(actor: RecordActor | null | undefined): ActorKey {
  return actor?.role === 'organizer' || actor?.role === 'member'
    ? actor.role
    : 'system';
}

/** Cents to a localized currency string; empty when there is no amount. */
export function formatCents(
  cents: number | null | undefined,
  language: string,
): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  return formatCurrency(cents / 100, language, 'USD', 2);
}

/** Group rows by round, newest round first; rows keep their backend order inside a round. */
export function groupByRound<T extends { round: { number: number } }>(
  rows: readonly T[],
): Array<{ round: number; rows: T[] }> {
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    const list = groups.get(row.round.number);
    if (list) list.push(row);
    else groups.set(row.round.number, [row]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([round, list]) => ({ round, rows: list }));
}

/** Append a next page without duplicating a row the backend returned twice. */
export function appendRecords<T extends { reference: string }>(
  existing: readonly T[],
  next: readonly T[],
): T[] {
  const seen = new Set(existing.map((row) => row.reference));
  const merged = [...existing];
  for (const row of next) {
    if (!seen.has(row.reference)) {
      seen.add(row.reference);
      merged.push(row);
    }
  }
  return merged;
}
