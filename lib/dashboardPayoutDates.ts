/**
 * Pure calendar-date helpers for dashboard payout labels.
 *
 * Date-only API values (`YYYY-MM-DD`) are treated as calendar dates, never as
 * UTC midnights via Date.parse("YYYY-MM-DD"). Relative math compares the target
 * calendar day to the device's local calendar day using UTC day-count of the
 * civil components (DST-safe, offset-safe).
 */

export type DashboardDateTranslator = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export type CalendarYmd = {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
};

/** Parse a YYYY-MM-DD (or leading date of an ISO datetime) into calendar parts. */
export function parseCalendarDateOnly(
  value: string | null | undefined,
): CalendarYmd | null {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const head = raw.length >= 10 ? raw.slice(0, 10) : raw;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  // Reject impossible civil dates (e.g. 2026-02-31).
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Local civil date of `now` (device calendar). */
export function localCalendarYmd(now: Date = new Date()): CalendarYmd {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

/**
 * Signed whole calendar days from `today` to `target` (date-only).
 * Positive = future, 0 = same day, negative = past.
 * Returns null when `target` is not a valid calendar date string.
 */
export function calendarDaysFromToday(
  target: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const targetYmd = parseCalendarDateOnly(target);
  if (!targetYmd) {
    return null;
  }
  const todayYmd = localCalendarYmd(now);
  const targetUtc = Date.UTC(targetYmd.year, targetYmd.month - 1, targetYmd.day);
  const todayUtc = Date.UTC(todayYmd.year, todayYmd.month - 1, todayYmd.day);
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

/**
 * Relative payout label (no absolute date).
 * Never clamps past dates to "Today".
 */
export function relativePayoutLabel(
  payoutDate: string | null | undefined,
  t: DashboardDateTranslator,
  now: Date = new Date(),
): string {
  const days = calendarDaysFromToday(payoutDate, now);
  if (days === null) {
    return '—';
  }
  if (days === 0) {
    return t('today');
  }
  if (days === 1) {
    return t('tomorrow');
  }
  if (days > 1) {
    return t('daysUntil', { count: days });
  }
  // days < 0 — overdue (count is positive)
  const overdueCount = Math.abs(days);
  return t('daysOverdue', { count: overdueCount });
}

/**
 * Absolute short date + relative parenthetical, e.g. "Jul 27 (1 day overdue)".
 * `formatShort` should format a YYYY-MM-DD for display (caller supplies locale).
 */
export function formatPayoutDateWithRelative(
  payoutDate: string | null | undefined,
  formatShort: (isoDate: string) => string,
  t: DashboardDateTranslator,
  now: Date = new Date(),
): string {
  const ymd = parseCalendarDateOnly(payoutDate);
  if (!ymd || !payoutDate) {
    return '';
  }
  const iso = `${String(ymd.year).padStart(4, '0')}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`;
  const short = formatShort(iso);
  if (!short) {
    return '';
  }
  const relative = relativePayoutLabel(iso, t, now);
  if (relative && relative !== '—') {
    return `${short} (${relative})`;
  }
  return short;
}

export type CircleRoundPayoutSources = {
  nextPayoutDate?: string | null;
  schedulePayoutDate?: string | null;
  currentRoundDueDate?: string | null;
};

/**
 * Per-circle **current/open-round target date** — not the global upcoming payout.
 *
 * Authoritative order:
 * 1. nextPayout.payoutDate
 * 2. current schedule round payoutDate
 * 3. currentRoundSummary.dueDate
 */
export function resolveCircleRoundPayoutDate(
  sources: CircleRoundPayoutSources,
): string | null {
  const next = String(sources.nextPayoutDate ?? '').trim();
  if (next) {
    return next;
  }
  const schedule = String(sources.schedulePayoutDate ?? '').trim();
  if (schedule) {
    return schedule;
  }
  const due = String(sources.currentRoundDueDate ?? '').trim();
  return due || null;
}

const RELEASED_PAYOUT_STATUSES = new Set([
  'released',
  'completed',
  'complete',
  'paid',
  'payout_released',
  'payout_completed',
]);

export type ClockPayoutSource = 'current_round' | 'summary_fallback';

export type DashboardClockPayout = {
  circleId: string | null;
  circleName: string;
  payoutDate: string;
  recipientName: string | null;
  recipientMemberId: string | null;
  overdue: boolean;
  source: ClockPayoutSource;
};

export type ClockPayoutMember = {
  id: string;
  full_name?: string | null;
  name?: string | null;
};

export type ClockPayoutScheduleRow = {
  round: number;
  payoutDate?: string | null;
  payout_date?: string | null;
  recipientMemberId?: string | null;
  recipient_member_id?: string | null;
  recipientName?: string | null;
  recipient_name?: string | null;
  status?: string | null;
};

export type ClockPayoutRoundSummary = {
  dueDate?: string | null;
  recipientMemberId?: string | null;
  payoutReleased?: boolean;
  payoutRecorded?: boolean;
  roundNumber?: number | null;
};

export type CircleClockPayoutInput = {
  circleId: string;
  circleName: string;
  currentRound?: number | null;
  nextPayout?: {
    round?: number | null;
    memberId?: string | null;
    payoutDate?: string | null;
    status?: string | null;
  } | null;
  schedule?: {
    currentRound?: number | null;
    currentRoundSummary?: ClockPayoutRoundSummary | null;
    roundWorkspace?: {
      currentRoundNumber?: number | null;
      currentRecipientMemberId?: string | null;
      currentRecipientName?: string | null;
      currentRoundStatus?: string | null;
      payoutReleased?: boolean;
    } | null;
    schedule?: ClockPayoutScheduleRow[];
  } | null;
  detail?: {
    currentRound?: number | null;
    currentRoundSummary?: ClockPayoutRoundSummary | null;
    members?: ClockPayoutMember[];
  } | null;
};

export type SummaryUpcomingPayoutFallback = {
  circleId?: string | null;
  circleName?: string | null;
  payoutDate?: string | null;
  recipientName?: string | null;
  recipientMemberId?: string | null;
} | null;

type CirclePayoutCandidate = {
  payoutDate: string;
  recipientName: string | null;
  recipientMemberId: string | null;
  source: 'nextPayout' | 'schedule' | 'currentRoundSummary';
  round: number | null;
  released: boolean;
};

function trimNonEmpty(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

function sameRound(
  left: number | null | undefined,
  right: number | null | undefined,
): boolean {
  if (left == null || right == null) {
    return false;
  }
  return Number(left) === Number(right);
}

function lookupMemberName(
  members: ClockPayoutMember[] | undefined,
  memberId: string | null,
): string | null {
  if (!memberId) {
    return null;
  }
  const member = members?.find((entry) => entry.id === memberId);
  return trimNonEmpty(member?.full_name) || trimNonEmpty(member?.name);
}

export function isReleasedPayoutStatus(
  status: string | null | undefined,
): boolean {
  return RELEASED_PAYOUT_STATUSES.has(String(status ?? '').trim().toLowerCase());
}

/**
 * Overdue only when the calendar date is already past and the backend still
 * treats this payout/round as open / unreleased.
 */
export function isCurrentPayoutOverdue(
  payoutDate: string | null | undefined,
  released: boolean,
  now: Date = new Date(),
): boolean {
  if (released) {
    return false;
  }
  const days = calendarDaysFromToday(payoutDate, now);
  return days !== null && days < 0;
}

function currentRoundNumber(input: CircleClockPayoutInput): number | null {
  const value =
    input.schedule?.roundWorkspace?.currentRoundNumber ??
    input.schedule?.currentRound ??
    input.detail?.currentRound ??
    input.currentRound;
  if (value == null || !Number.isFinite(Number(value))) {
    return null;
  }
  return Number(value);
}

function currentRoundReleased(input: CircleClockPayoutInput): boolean {
  const workspace = input.schedule?.roundWorkspace;
  const summary =
    input.schedule?.currentRoundSummary ?? input.detail?.currentRoundSummary;
  if (workspace?.payoutReleased === true || summary?.payoutReleased === true) {
    return true;
  }
  if (isReleasedPayoutStatus(workspace?.currentRoundStatus)) {
    return true;
  }
  const round = currentRoundNumber(input);
  const row = input.schedule?.schedule?.find(
    (entry) => Number(entry.round) === Number(round),
  );
  return isReleasedPayoutStatus(row?.status);
}

function candidateReleased(
  candidate: Omit<CirclePayoutCandidate, 'released'>,
  input: CircleClockPayoutInput,
): boolean {
  if (candidate.source === 'nextPayout') {
    if (isReleasedPayoutStatus(input.nextPayout?.status)) {
      return true;
    }
    if (
      candidate.round != null &&
      !sameRound(candidate.round, currentRoundNumber(input))
    ) {
      // nextPayout already points at a later round; workspace flags belong
      // to the previous current round and must not hide this next date.
      return false;
    }
    return currentRoundReleased(input);
  }
  return currentRoundReleased(input);
}

function circlePayoutCandidates(
  input: CircleClockPayoutInput,
): CirclePayoutCandidate[] {
  const members = input.detail?.members;
  const round = currentRoundNumber(input);
  const row = input.schedule?.schedule?.find(
    (entry) => Number(entry.round) === Number(round),
  );
  const summary =
    input.schedule?.currentRoundSummary ?? input.detail?.currentRoundSummary;
  const workspace = input.schedule?.roundWorkspace;

  const raw: Array<Omit<CirclePayoutCandidate, 'released'>> = [];

  const nextDate = trimNonEmpty(input.nextPayout?.payoutDate);
  if (nextDate) {
    const recipientMemberId = trimNonEmpty(input.nextPayout?.memberId);
    raw.push({
      payoutDate: nextDate,
      recipientMemberId,
      recipientName: lookupMemberName(members, recipientMemberId),
      source: 'nextPayout',
      round:
        input.nextPayout?.round != null
          ? Number(input.nextPayout.round)
          : null,
    });
  }

  const scheduleDate = trimNonEmpty(row?.payoutDate ?? row?.payout_date);
  if (scheduleDate) {
    const recipientMemberId = trimNonEmpty(
      row?.recipientMemberId ?? row?.recipient_member_id,
    );
    raw.push({
      payoutDate: scheduleDate,
      recipientMemberId,
      recipientName:
        trimNonEmpty(row?.recipientName ?? row?.recipient_name) ||
        lookupMemberName(members, recipientMemberId) ||
        (sameRound(round, workspace?.currentRoundNumber)
          ? trimNonEmpty(workspace?.currentRecipientName)
          : null),
      source: 'schedule',
      round,
    });
  }

  const dueDate = trimNonEmpty(summary?.dueDate);
  if (dueDate) {
    const recipientMemberId = trimNonEmpty(summary?.recipientMemberId);
    raw.push({
      payoutDate: dueDate,
      recipientMemberId,
      recipientName:
        lookupMemberName(members, recipientMemberId) ||
        (sameRound(round, workspace?.currentRoundNumber)
          ? trimNonEmpty(workspace?.currentRecipientName)
          : null),
      source: 'currentRoundSummary',
      round: summary?.roundNumber != null ? Number(summary.roundNumber) : round,
    });
  }

  return raw.map((candidate) => ({
    ...candidate,
    released: candidateReleased(candidate, input),
  }));
}

const SOURCE_RANK: Record<CirclePayoutCandidate['source'], number> = {
  nextPayout: 0,
  schedule: 1,
  currentRoundSummary: 2,
};

function pickCircleOpenCandidate(
  input: CircleClockPayoutInput,
  now: Date,
): CirclePayoutCandidate | null {
  const candidates = circlePayoutCandidates(input);
  const open = candidates.filter((candidate) => candidate.released !== true);
  if (open.length === 0) {
    return null;
  }

  const currentRound = currentRoundNumber(input);
  const currentRoundOpen = open.filter((candidate) => {
    if (candidate.source !== 'nextPayout') {
      return true;
    }
    if (candidate.round == null || currentRound == null) {
      return true;
    }
    return sameRound(candidate.round, currentRound);
  });
  const pool = currentRoundOpen.length > 0 ? currentRoundOpen : open;

  return [...pool].sort((left, right) => {
    const leftDays = calendarDaysFromToday(left.payoutDate, now);
    const rightDays = calendarDaysFromToday(right.payoutDate, now);
    if (leftDays !== null && rightDays !== null && leftDays !== rightDays) {
      return leftDays - rightDays;
    }
    return SOURCE_RANK[left.source] - SOURCE_RANK[right.source];
  })[0];
}

/**
 * Per-circle current/open-round payout pair. Date and recipient always come
 * from the same winning source. Released/completed rounds are omitted.
 */
export function resolveCircleCurrentOpenPayout(
  input: CircleClockPayoutInput,
  now: Date = new Date(),
): DashboardClockPayout | null {
  const candidate = pickCircleOpenCandidate(input, now);
  if (!candidate || !parseCalendarDateOnly(candidate.payoutDate)) {
    return null;
  }
  return {
    circleId: input.circleId,
    circleName: input.circleName,
    payoutDate: candidate.payoutDate,
    recipientName: candidate.recipientName,
    recipientMemberId: candidate.recipientMemberId,
    overdue: isCurrentPayoutOverdue(candidate.payoutDate, false, now),
    source: 'current_round',
  };
}

/**
 * Dashboard clock card target: the most relevant current open payout across
 * active circles. `summary.upcomingPayout` is fallback only.
 */
export function resolveDashboardClockPayout(args: {
  circles: CircleClockPayoutInput[];
  summaryUpcoming?: SummaryUpcomingPayoutFallback;
  now?: Date;
}): DashboardClockPayout | null {
  const now = args.now ?? new Date();
  const open = args.circles
    .map((circle) => resolveCircleCurrentOpenPayout(circle, now))
    .filter((entry): entry is DashboardClockPayout => entry != null);

  if (open.length > 0) {
    return [...open].sort((left, right) => {
      const leftDays = calendarDaysFromToday(left.payoutDate, now) ?? 9999;
      const rightDays = calendarDaysFromToday(right.payoutDate, now) ?? 9999;
      return leftDays - rightDays;
    })[0];
  }

  const fallbackDate = trimNonEmpty(args.summaryUpcoming?.payoutDate);
  if (!fallbackDate || !parseCalendarDateOnly(fallbackDate)) {
    return null;
  }
  return {
    circleId: trimNonEmpty(args.summaryUpcoming?.circleId),
    circleName: trimNonEmpty(args.summaryUpcoming?.circleName) ?? '',
    payoutDate: fallbackDate,
    recipientName: trimNonEmpty(args.summaryUpcoming?.recipientName),
    recipientMemberId: trimNonEmpty(args.summaryUpcoming?.recipientMemberId),
    overdue: false,
    source: 'summary_fallback',
  };
}

export function presentDashboardClockPayout(
  payout: DashboardClockPayout | null,
  t: DashboardDateTranslator,
  now: Date = new Date(),
): {
  value: string;
  label: string;
  overdue: boolean;
  detail: string | null;
} {
  if (!payout) {
    return {
      value: '—',
      label: t('noUpcomingPayout'),
      overdue: false,
      detail: null,
    };
  }
  return {
    value: relativePayoutLabel(payout.payoutDate, t, now),
    label: payout.recipientName
      ? t('receives', { name: payout.recipientName })
      : payout.circleName || t('nextPayout'),
    overdue: payout.overdue,
    detail: payout.overdue ? t('payoutNotReleased') : null,
  };
}
