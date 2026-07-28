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
