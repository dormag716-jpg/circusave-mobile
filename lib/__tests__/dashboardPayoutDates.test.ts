import { readFileSync } from 'fs';
import path from 'path';

import {
  calendarDaysFromToday,
  formatPayoutDateWithRelative,
  isCurrentPayoutOverdue,
  parseCalendarDateOnly,
  presentDashboardClockPayout,
  relativePayoutLabel,
  resolveCircleRoundPayoutDate,
  resolveDashboardClockPayout,
  type CircleClockPayoutInput,
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
    case 'receives':
      return `${options?.name} receives`;
    case 'payoutNotReleased':
      return 'Payout not released';
    case 'noUpcomingPayout':
      return 'No upcoming payout';
    case 'nextPayout':
      return 'Next Payout';
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

  test('clock recipient is never mixed with a different-round upcoming name', () => {
    const firstDetailRecipient = 'Someone Else';
    const clock = resolveDashboardClockPayout({
      now: localNoon(2026, 7, 28),
      circles: [
        {
          circleId: 'c1',
          circleName: 'Family Circle',
          currentRound: 1,
          nextPayout: {
            round: 1,
            memberId: 'm-overdue',
            payoutDate: '2026-07-27',
            status: 'scheduled',
          },
          detail: {
            currentRound: 1,
            members: [
              { id: 'm-overdue', full_name: 'Alex Rivera' },
              { id: 'm-later', full_name: firstDetailRecipient },
            ],
          },
        },
      ],
      summaryUpcoming: {
        circleId: 'c1',
        circleName: 'Family Circle',
        payoutDate: '2026-08-03',
        recipientName: firstDetailRecipient,
        recipientMemberId: 'm-later',
      },
    });

    expect(clock?.payoutDate).toBe('2026-07-27');
    expect(clock?.recipientName).toBe('Alex Rivera');
    expect(clock?.recipientName).not.toBe(firstDetailRecipient);
    expect(presentDashboardClockPayout(clock, tEn, localNoon(2026, 7, 28)).label).toBe(
      'Alex Rivera receives',
    );
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

describe('dashboard clock current-round payout', () => {
  const now = localNoon(2026, 7, 28);

  function circle(overrides: Partial<CircleClockPayoutInput> = {}): CircleClockPayoutInput {
    return {
      circleId: 'c1',
      circleName: 'Family Circle',
      currentRound: 1,
      nextPayout: {
        round: 1,
        memberId: 'm-alex',
        payoutDate: '2026-08-03',
        status: 'scheduled',
      },
      detail: {
        currentRound: 1,
        members: [{ id: 'm-alex', full_name: 'Alex Rivera' }],
      },
      ...overrides,
    };
  }

  test('future current payout shows In N days from the current round', () => {
    const clock = resolveDashboardClockPayout({
      now,
      circles: [circle()],
      summaryUpcoming: {
        payoutDate: '2026-08-10',
        recipientName: 'Later Person',
        circleName: 'Other Circle',
      },
    });
    const presented = presentDashboardClockPayout(clock, tEn, now);
    expect(clock?.source).toBe('current_round');
    expect(clock?.payoutDate).toBe('2026-08-03');
    expect(clock?.recipientName).toBe('Alex Rivera');
    expect(clock?.overdue).toBe(false);
    expect(presented.value).toBe('In 6 days');
    expect(presented.label).toBe('Alex Rivera receives');
    expect(presented.detail).toBeNull();
  });

  test('payout due tomorrow is Tomorrow', () => {
    const clock = resolveDashboardClockPayout({
      now,
      circles: [
        circle({
          nextPayout: {
            round: 1,
            memberId: 'm-alex',
            payoutDate: '2026-07-29',
            status: 'scheduled',
          },
        }),
      ],
    });
    expect(presentDashboardClockPayout(clock, tEn, now).value).toBe('Tomorrow');
    expect(clock?.overdue).toBe(false);
  });

  test('payout due today is Today and not overdue', () => {
    const clock = resolveDashboardClockPayout({
      now,
      circles: [
        circle({
          nextPayout: {
            round: 1,
            memberId: 'm-alex',
            payoutDate: '2026-07-28',
            status: 'scheduled',
          },
        }),
      ],
    });
    const presented = presentDashboardClockPayout(clock, tEn, now);
    expect(clock?.overdue).toBe(false);
    expect(presented.value).toBe('Today');
    expect(presented.detail).toBeNull();
    expect(isCurrentPayoutOverdue('2026-07-28', false, now)).toBe(false);
  });

  test('overdue unreleased payout shows N days overdue and payout not released', () => {
    const clock = resolveDashboardClockPayout({
      now,
      circles: [
        circle({
          nextPayout: {
            round: 1,
            memberId: 'm-alex',
            payoutDate: '2026-07-22',
            status: 'scheduled',
          },
          schedule: {
            currentRound: 1,
            roundWorkspace: { currentRoundNumber: 1, payoutReleased: false },
            schedule: [
              {
                round: 1,
                payoutDate: '2026-07-22',
                recipientMemberId: 'm-alex',
                recipientName: 'Alex Rivera',
                status: 'active',
              },
            ],
          },
        }),
      ],
    });
    const presented = presentDashboardClockPayout(clock, tEn, now);
    expect(clock?.source).toBe('current_round');
    expect(clock?.overdue).toBe(true);
    expect(presented.value).toBe('6 days overdue');
    expect(presented.label).toBe('Alex Rivera receives');
    expect(presented.detail).toBe('Payout not released');
    expect(presented.overdue).toBe(true);
  });

  test('released payout advances to the next round', () => {
    const clock = resolveDashboardClockPayout({
      now,
      circles: [
        circle({
          currentRound: 2,
          nextPayout: {
            round: 2,
            memberId: 'm-jordan',
            payoutDate: '2026-08-03',
            status: 'scheduled',
          },
          schedule: {
            currentRound: 2,
            currentRoundSummary: {
              dueDate: '2026-08-03',
              recipientMemberId: 'm-jordan',
              payoutReleased: false,
              roundNumber: 2,
            },
            roundWorkspace: {
              currentRoundNumber: 2,
              currentRecipientMemberId: 'm-jordan',
              currentRecipientName: 'Jordan Blake',
              payoutReleased: false,
            },
            schedule: [
              {
                round: 1,
                payoutDate: '2026-07-22',
                recipientMemberId: 'm-alex',
                recipientName: 'Alex Rivera',
                status: 'released',
              },
              {
                round: 2,
                payoutDate: '2026-08-03',
                recipientMemberId: 'm-jordan',
                recipientName: 'Jordan Blake',
                status: 'scheduled',
              },
            ],
          },
          detail: {
            currentRound: 2,
            currentRoundSummary: {
              dueDate: '2026-08-03',
              recipientMemberId: 'm-jordan',
              payoutReleased: false,
              roundNumber: 2,
            },
            members: [
              { id: 'm-alex', full_name: 'Alex Rivera' },
              { id: 'm-jordan', full_name: 'Jordan Blake' },
            ],
          },
        }),
      ],
    });
    const presented = presentDashboardClockPayout(clock, tEn, now);
    expect(clock?.payoutDate).toBe('2026-08-03');
    expect(clock?.recipientName).toBe('Jordan Blake');
    expect(clock?.overdue).toBe(false);
    expect(presented.value).toBe('In 6 days');
    expect(presented.detail).toBeNull();
  });

  test('a past date is not overdue after the backend marks the payout released', () => {
    expect(isCurrentPayoutOverdue('2026-07-22', true, now)).toBe(false);
    const clock = resolveDashboardClockPayout({
      now,
      circles: [
        circle({
          nextPayout: {
            round: 1,
            memberId: 'm-alex',
            payoutDate: '2026-07-22',
            status: 'released',
          },
          schedule: {
            currentRound: 1,
            currentRoundSummary: {
              dueDate: '2026-07-22',
              recipientMemberId: 'm-alex',
              payoutReleased: true,
              roundNumber: 1,
            },
            roundWorkspace: { currentRoundNumber: 1, payoutReleased: true },
            schedule: [
              {
                round: 1,
                payoutDate: '2026-07-22',
                recipientMemberId: 'm-alex',
                status: 'released',
              },
            ],
          },
        }),
      ],
      summaryUpcoming: {
        circleId: 'c1',
        circleName: 'Family Circle',
        payoutDate: '2026-08-03',
        recipientName: 'Jordan Blake',
      },
    });
    expect(clock?.source).toBe('summary_fallback');
    expect(clock?.payoutDate).toBe('2026-08-03');
    expect(clock?.overdue).toBe(false);
  });

  test('overdue current round beats a later summary.upcomingPayout', () => {
    const clock = resolveDashboardClockPayout({
      now,
      circles: [
        circle({
          nextPayout: {
            round: 1,
            memberId: 'm-alex',
            payoutDate: '2026-07-27',
            status: 'scheduled',
          },
          schedule: {
            currentRound: 1,
            roundWorkspace: { currentRoundNumber: 1, payoutReleased: false },
            schedule: [
              {
                round: 1,
                payoutDate: '2026-07-27',
                recipientMemberId: 'm-alex',
                recipientName: 'Alex Rivera',
                status: 'active',
              },
            ],
          },
        }),
      ],
      summaryUpcoming: {
        circleId: 'c1',
        circleName: 'Family Circle',
        payoutDate: '2026-08-03',
        recipientName: 'Jordan Blake',
        recipientMemberId: 'm-jordan',
      },
    });
    expect(clock?.source).toBe('current_round');
    expect(clock?.payoutDate).toBe('2026-07-27');
    expect(clock?.recipientName).toBe('Alex Rivera');
    expect(clock?.overdue).toBe(true);
    expect(clock?.recipientName).not.toBe('Jordan Blake');
  });

  test('recipient and date always come from the same current round', () => {
    const clock = resolveDashboardClockPayout({
      now,
      circles: [
        circle({
          nextPayout: {
            round: 2,
            memberId: 'm-jordan',
            payoutDate: '2026-08-03',
            status: 'scheduled',
          },
          schedule: {
            currentRound: 1,
            currentRoundSummary: {
              dueDate: '2026-07-22',
              recipientMemberId: 'm-alex',
              payoutReleased: false,
              roundNumber: 1,
            },
            roundWorkspace: {
              currentRoundNumber: 1,
              currentRecipientMemberId: 'm-alex',
              currentRecipientName: 'Alex Rivera',
              payoutReleased: false,
            },
            schedule: [
              {
                round: 1,
                payoutDate: '2026-07-22',
                recipientMemberId: 'm-alex',
                recipientName: 'Alex Rivera',
                status: 'active',
              },
              {
                round: 2,
                payoutDate: '2026-08-03',
                recipientMemberId: 'm-jordan',
                recipientName: 'Jordan Blake',
                status: 'scheduled',
              },
            ],
          },
          detail: {
            currentRound: 1,
            currentRoundSummary: {
              dueDate: '2026-07-22',
              recipientMemberId: 'm-alex',
              payoutReleased: false,
              roundNumber: 1,
            },
            members: [
              { id: 'm-alex', full_name: 'Alex Rivera' },
              { id: 'm-jordan', full_name: 'Jordan Blake' },
            ],
          },
        }),
      ],
      summaryUpcoming: {
        payoutDate: '2026-08-03',
        recipientName: 'Jordan Blake',
      },
    });
    expect(clock?.payoutDate).toBe('2026-07-22');
    expect(clock?.recipientName).toBe('Alex Rivera');
    expect(clock?.recipientName).not.toBe('Jordan Blake');
  });

  test('summary fallback when no current-round payout exists', () => {
    const clock = resolveDashboardClockPayout({
      now,
      circles: [
        {
          circleId: 'c-empty',
          circleName: 'Setup Circle',
          currentRound: 1,
          nextPayout: null,
        },
      ],
      summaryUpcoming: {
        circleId: 'c-fallback',
        circleName: 'Fallback Circle',
        payoutDate: '2026-08-10',
        recipientName: 'Sam Lee',
        recipientMemberId: 'm-sam',
      },
    });
    const presented = presentDashboardClockPayout(clock, tEn, now);
    expect(clock?.source).toBe('summary_fallback');
    expect(clock?.payoutDate).toBe('2026-08-10');
    expect(clock?.recipientName).toBe('Sam Lee');
    expect(clock?.overdue).toBe(false);
    expect(presented.value).toBe('In 13 days');
    expect(presented.label).toBe('Sam Lee receives');
  });

  test('empty current-round data and no summary fallback shows no upcoming payout', () => {
    const clock = resolveDashboardClockPayout({
      now,
      circles: [{ circleId: 'c-empty', circleName: 'Empty', nextPayout: null }],
      summaryUpcoming: null,
    });
    expect(clock).toBeNull();
    expect(presentDashboardClockPayout(clock, tEn, now)).toEqual({
      value: '—',
      label: 'No upcoming payout',
      overdue: false,
      detail: null,
    });
  });

  test('dashboard clock StatCard is wired to the current-round resolver', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'app', '(tabs)', 'dashboard.tsx'),
      'utf8',
    );
    expect(source).toMatch(/resolveDashboardClockPayout/);
    expect(source).toMatch(/presentDashboardClockPayout/);
    const statsRow = source.slice(source.indexOf('styles.statsRow'));
    const firstCard = statsRow.slice(
      statsRow.indexOf('<StatCard'),
      statsRow.indexOf('<StatCard', statsRow.indexOf('<StatCard') + 1),
    );
    expect(firstCard).toMatch(/clockPresentation\.value/);
    expect(firstCard).not.toMatch(/upcomingPayout\?\.payoutDate/);
    expect(firstCard).not.toMatch(/upcomingPayout\?\.recipientName/);
    expect(firstCard).toMatch(/clockPresentation\.overdue \? colors\.danger/);
    expect(firstCard).toMatch(/clockPresentation\.detail/);
  });
});
