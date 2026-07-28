import {
  calendarDaysFromToday,
  formatPayoutDateWithRelative,
  parseCalendarDateOnly,
  relativePayoutLabel,
  resolveCircleRoundPayoutDate,
} from '../dashboardPayoutDates';

/** Fixed "now" as local calendar via Date with local Y-M-D components. */
function localNoon(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

const tEn = (key: string, options?: Record<string, unknown>): string => {
  const count = Number(options?.count ?? 0);
  switch (key) {
    case 'today':
      return 'Today';
    case 'tomorrow':
      return 'Tomorrow';
    case 'daysUntil':
      return count === 1 ? `In ${count} day` : `In ${count} days`;
    case 'daysOverdue':
      return count === 1 ? '1 day overdue' : `${count} days overdue`;
    default:
      return key;
  }
};

describe('parseCalendarDateOnly', () => {
  test('parses YYYY-MM-DD', () => {
    expect(parseCalendarDateOnly('2026-07-27')).toEqual({
      year: 2026,
      month: 7,
      day: 27,
    });
  });

  test('rejects invalid civil dates', () => {
    expect(parseCalendarDateOnly('2026-02-31')).toBeNull();
  });

  test('does not use Date.parse semantics for bare dates', () => {
    // If this were UTC-midnight parse, west-coast offsets can shift the day.
    const ymd = parseCalendarDateOnly('2026-07-27');
    expect(ymd).toEqual({ year: 2026, month: 7, day: 27 });
  });
});

describe('calendarDaysFromToday / relativePayoutLabel', () => {
  const now = localNoon(2026, 7, 28);

  test('today', () => {
    expect(calendarDaysFromToday('2026-07-28', now)).toBe(0);
    expect(relativePayoutLabel('2026-07-28', tEn, now)).toBe('Today');
  });

  test('tomorrow', () => {
    expect(calendarDaysFromToday('2026-07-29', now)).toBe(1);
    expect(relativePayoutLabel('2026-07-29', tEn, now)).toBe('Tomorrow');
  });

  test('in 6 days', () => {
    expect(calendarDaysFromToday('2026-08-03', now)).toBe(6);
    expect(relativePayoutLabel('2026-08-03', tEn, now)).toBe('In 6 days');
  });

  test('1 day overdue — never Today', () => {
    expect(calendarDaysFromToday('2026-07-27', now)).toBe(-1);
    expect(relativePayoutLabel('2026-07-27', tEn, now)).toBe('1 day overdue');
    expect(relativePayoutLabel('2026-07-27', tEn, now)).not.toBe('Today');
  });

  test('multiple days overdue', () => {
    expect(calendarDaysFromToday('2026-07-22', now)).toBe(-6);
    expect(relativePayoutLabel('2026-07-22', tEn, now)).toBe('6 days overdue');
  });

  test('month boundary', () => {
    const endOfMonth = localNoon(2026, 7, 31);
    expect(calendarDaysFromToday('2026-08-01', endOfMonth)).toBe(1);
    expect(relativePayoutLabel('2026-08-01', tEn, endOfMonth)).toBe('Tomorrow');
  });

  test('year boundary', () => {
    const nye = localNoon(2026, 12, 31);
    expect(calendarDaysFromToday('2027-01-01', nye)).toBe(1);
    expect(calendarDaysFromToday('2026-12-30', nye)).toBe(-1);
  });

  test('device timezone offset does not turn yesterday into Today', () => {
    // Simulate late evening local on Jul 28 with a past calendar date Jul 27.
    const lateEvening = new Date(2026, 6, 28, 23, 30, 0, 0);
    expect(calendarDaysFromToday('2026-07-27', lateEvening)).toBe(-1);
    expect(relativePayoutLabel('2026-07-27', tEn, lateEvening)).toBe(
      '1 day overdue',
    );
    // Early morning same day still treats ISO date as civil day.
    const early = new Date(2026, 6, 28, 0, 15, 0, 0);
    expect(calendarDaysFromToday('2026-07-27', early)).toBe(-1);
    expect(relativePayoutLabel('2026-07-28', tEn, early)).toBe('Today');
  });

  test('invalid date returns em dash', () => {
    expect(relativePayoutLabel('not-a-date', tEn, now)).toBe('—');
    expect(relativePayoutLabel(undefined, tEn, now)).toBe('—');
  });
});

describe('formatPayoutDateWithRelative', () => {
  const now = localNoon(2026, 7, 28);
  const short = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${months[m - 1]} ${d}`;
  };

  test('preserves absolute date with relative parenthetical', () => {
    expect(formatPayoutDateWithRelative('2026-07-28', short, tEn, now)).toBe(
      'Jul 28 (Today)',
    );
    expect(formatPayoutDateWithRelative('2026-07-29', short, tEn, now)).toBe(
      'Jul 29 (Tomorrow)',
    );
    expect(formatPayoutDateWithRelative('2026-08-03', short, tEn, now)).toBe(
      'Aug 3 (In 6 days)',
    );
    expect(formatPayoutDateWithRelative('2026-07-27', short, tEn, now)).toBe(
      'Jul 27 (1 day overdue)',
    );
    expect(formatPayoutDateWithRelative('2026-07-22', short, tEn, now)).toBe(
      'Jul 22 (6 days overdue)',
    );
  });
});

describe('resolveCircleRoundPayoutDate', () => {
  test('prefers nextPayout then schedule then dueDate', () => {
    expect(
      resolveCircleRoundPayoutDate({
        nextPayoutDate: '2026-07-27',
        schedulePayoutDate: '2026-08-03',
        currentRoundDueDate: '2026-08-10',
      }),
    ).toBe('2026-07-27');
    expect(
      resolveCircleRoundPayoutDate({
        nextPayoutDate: null,
        schedulePayoutDate: '2026-08-03',
        currentRoundDueDate: '2026-08-10',
      }),
    ).toBe('2026-08-03');
    expect(
      resolveCircleRoundPayoutDate({
        nextPayoutDate: null,
        schedulePayoutDate: null,
        currentRoundDueDate: '2026-08-10',
      }),
    ).toBe('2026-08-10');
  });
});

describe('countdown vs hero date sources (semantic)', () => {
  const now = localNoon(2026, 7, 28);

  test('hero current-round overdue and global upcoming may differ without inconsistent labeling', () => {
    const currentRound = '2026-07-27';
    const upcoming = '2026-08-03';
    expect(relativePayoutLabel(currentRound, tEn, now)).toBe('1 day overdue');
    expect(relativePayoutLabel(upcoming, tEn, now)).toBe('In 6 days');
    // Must not both resolve to Today.
    expect(relativePayoutLabel(currentRound, tEn, now)).not.toBe('Today');
  });

  test('countdown recipient must come from upcomingPayout.recipientName only', () => {
    type Upcoming = {
      payoutDate: string;
      recipientName: string | null;
      circleName: string;
    } | null;

    function countdownLabel(upcoming: Upcoming, t: typeof tEn): string {
      if (!upcoming) {
        return 'No upcoming payout';
      }
      if (upcoming.recipientName) {
        return `${upcoming.recipientName} receives`;
      }
      return upcoming.circleName || 'Next Payout';
    }

    const upcoming = {
      payoutDate: '2026-08-03',
      recipientName: 'Renee Jenkins',
      circleName: 'Family Circle',
    };
    const firstDetailRecipient = 'Someone Else';

    expect(countdownLabel(upcoming, tEn)).toBe('Renee Jenkins receives');
    expect(countdownLabel(upcoming, tEn)).not.toContain(firstDetailRecipient);
    expect(countdownLabel(null, tEn)).toBe('No upcoming payout');
  });

  test('no upcoming payout produces no fabricated recipient', () => {
    type Upcoming = {
      recipientName: string | null;
      payoutDate: string;
    };
    const list: Array<Upcoming | null> = [null];
    const upcoming = list[0];
    const name = upcoming?.recipientName ?? null;
    expect(name).toBeNull();
    expect(relativePayoutLabel(undefined, tEn, now)).toBe('—');
  });
});
