/**
 * Presentation-only helpers for Member Circle Statements.
 * Never mutate backend values; never recalculate money totals.
 *
 * Visible punctuation uses Unicode escapes so source stays encoding-stable:
 * \u2014 (em dash), \u00B7 (middle dot), \u2026 (ellipsis).
 */

/** Maps remainingObligations* snapshot fields for member-facing "Outstanding" labels. */
export const OUTSTANDING_FIELD_NOTE =
  'Outstanding is a presentation label for backend remainingObligations* fields; calculation is unchanged.';

/**
 * Pass-through for backend display strings only (e.g. "$2,000").
 * Does not format cents or invent currency presentation.
 */
export function displayMoney(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  if (value === 'Unavailable') return 'Unavailable';
  return value;
}

export function humanizeStatementLabel(value?: string | null): string {
  const normalized = String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (!normalized) return '';
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

const STATUS_LABELS: Record<string, string> = {
  due: 'Payment due',
  submitted: 'Contribution submitted',
  confirmed: 'Contribution confirmed',
  late: 'Submitted after due time',
  missed: 'Contribution missed',
  rejected: 'Contribution rejected',
  pending: 'Pending',
  scheduled: 'Scheduled',
  current: 'Current',
  completed: 'Completed',
  posted: 'Posted',
  paid: 'Paid',
  released: 'Released',
  active: 'Active',
  unclaimed: 'Unclaimed',
  contribution: 'Contribution',
  contribution_submitted: 'Contribution submitted',
  contribution_confirmed: 'Contribution confirmed',
  contribution_rejected: 'Contribution rejected',
  contribution_missed: 'Contribution missed',
  contribution_late: 'Submitted after due time',
  payout: 'Payout',
  payout_released: 'Payout released',
  payout_completed: 'Payout completed',
  member_approved: 'Member approved',
  adjustment: 'Adjustment',
  refund: 'Refund',
  fee: 'Fee',
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
};

export function humanizeStatus(value?: string | null): string {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!raw) return '\u2014';
  return STATUS_LABELS[raw] || humanizeStatementLabel(raw) || '\u2014';
}

export function humanizeEventType(value?: string | null): string {
  return humanizeStatus(value);
}

/**
 * Formats ISO timestamps for display.
 * Uses the device locale timezone when the runtime can parse the value.
 * Date-only YYYY-MM-DD values are treated as calendar dates (noon local).
 * Does not claim server-local calendar accuracy beyond what the ISO string provides.
 */
export function formatDisplayDate(value?: string | null): string {
  if (!value) return '\u2014';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const local = new Date(`${value}T12:00:00`);
    if (!Number.isNaN(local.getTime())) {
      return local.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDisplayDateTime(value?: string | null): string {
  if (!value) return '\u2014';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDisplayDate(value);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Short public statement id (typically final digest segment of MCS-\u2026 reference). */
export function shortStatementId(reference?: string | null): string {
  const raw = String(reference || '').trim();
  if (!raw) return '\u2014';
  const parts = raw.split('-').filter(Boolean);
  const last = parts[parts.length - 1] || raw;
  if (last.length >= 6 && last.length <= 12) return last.toUpperCase();
  return raw.slice(-8).toUpperCase();
}

export function memberContextLabel(input: {
  handCount: number;
  roleSummary?: string | null;
  membershipStatus?: string | null;
  unclaimed?: boolean;
}): string {
  const handLabel = `${input.handCount} hand${input.handCount === 1 ? '' : 's'}`;
  const role = humanizeStatementLabel(input.roleSummary);
  const status = humanizeStatementLabel(input.membershipStatus);
  const dot = '\u00B7';

  if (input.unclaimed) {
    return `Unclaimed ${dot} ${handLabel}`;
  }
  if (role.toLowerCase().includes('organizer')) {
    return `Organizer ${dot} ${handLabel}`;
  }
  if (status === 'Active' || !status) {
    return `Active member ${dot} ${handLabel}`;
  }
  return `${status} member ${dot} ${handLabel}`;
}

export type RoundLike = {
  contributionId: string;
  roundNumber: number;
  dueDate: string | null;
  status: string;
  expectedDisplay: string;
  paidDisplay: string;
  submittedAt?: string | null;
  confirmedAt?: string | null;
};

export type ScheduledPayoutLike = {
  roundNumber: number;
  dueDate: string | null;
  amountDisplay: string;
  status: string;
};

export function nextContributionDue(
  rounds: RoundLike[] | undefined,
): RoundLike | null {
  if (!rounds?.length) return null;
  const pending = rounds.filter((r) =>
    ['due', 'submitted', 'late', 'pending'].includes(
      String(r.status || '').toLowerCase(),
    ),
  );
  if (!pending.length) return null;
  return [...pending].sort((a, b) => a.roundNumber - b.roundNumber)[0] ?? null;
}

export function nextScheduledPayout(
  scheduled: ScheduledPayoutLike[] | undefined,
): ScheduledPayoutLike | null {
  if (!scheduled?.length) return null;
  const open = scheduled.filter((s) => {
    const status = String(s.status || '').toLowerCase();
    return status === 'scheduled' || status === 'current';
  });
  const pool = open.length ? open : scheduled;
  return [...pool].sort((a, b) => a.roundNumber - b.roundNumber)[0] ?? null;
}
