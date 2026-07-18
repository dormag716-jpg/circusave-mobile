import {
  formatHandsPeopleMetrics,
  handClaimStatusLabel,
  isCircleNotStarted,
  isUnclaimedHand,
  peopleHandsSectionTitle,
  peoplePendingSectionTitle,
  roundUnstartedSubtitle,
  roundUnstartedTitle,
} from '../circleLifecycleCopy';
import {
  canShowStartCircleAction,
  getCircleLifecyclePhase,
  isCircleCompleted,
  isCircleSetupState,
  isCircleStarted,
} from '../startCircleReadiness';

describe('authoritative lifecycle phase', () => {
  test('draft without startedAt is setup / not started', () => {
    const draft = { status: 'draft' as const, startedAt: null, isStarted: false };
    expect(getCircleLifecyclePhase(draft)).toBe('setup');
    expect(isCircleNotStarted(draft)).toBe(true);
    expect(isCircleStarted(draft)).toBe(false);
    expect(isCircleSetupState(draft)).toBe(true);
    expect(
      canShowStartCircleAction({ isOrganizer: true, circle: draft }),
    ).toBe(true);
  });

  test('API isStarted true wins over missing startedAt string edge cases', () => {
    const active = { status: 'active', isStarted: true };
    expect(getCircleLifecyclePhase(active)).toBe('active');
    expect(isCircleNotStarted(active)).toBe(false);
    expect(
      canShowStartCircleAction({ isOrganizer: true, circle: active }),
    ).toBe(false);
  });

  test('active status is started; no Start Circle', () => {
    const circle = { status: 'active', startedAt: '2026-08-01T00:00:00Z' };
    expect(getCircleLifecyclePhase(circle)).toBe('active');
    expect(isCircleStarted(circle)).toBe(true);
    expect(isCircleNotStarted(circle)).toBe(false);
    expect(
      canShowStartCircleAction({ isOrganizer: true, circle }),
    ).toBe(false);
  });

  test('completed is completed phase', () => {
    const circle = {
      status: 'completed',
      startedAt: '2026-08-01T00:00:00Z',
      isStarted: true,
    };
    expect(getCircleLifecyclePhase(circle)).toBe('completed');
    expect(isCircleCompleted(circle)).toBe(true);
    expect(isCircleNotStarted(circle)).toBe(false);
    expect(
      canShowStartCircleAction({ isOrganizer: true, circle }),
    ).toBe(false);
  });

  test('phase ignores schedule-like fields if accidentally present', () => {
    const draft = {
      status: 'draft',
      startedAt: null,
      isStarted: false,
      currentRound: 1,
      schedule: [{ round: 1 }],
    } as {
      status: string;
      startedAt: null;
      isStarted: boolean;
      currentRound: number;
      schedule: { round: number }[];
    };
    expect(getCircleLifecyclePhase(draft)).toBe('setup');
  });

  test('round pre-start copy', () => {
    expect(roundUnstartedTitle()).toMatch(/not started/i);
    expect(roundUnstartedSubtitle()).toMatch(/before starting/i);
  });
});

describe('circleLifecycleCopy labels', () => {
  test('unclaimed vs connected hand labels', () => {
    expect(isUnclaimedHand({ id: 'm1', userId: null })).toBe(true);
    expect(isUnclaimedHand({ id: 'm2', userId: 'u1' })).toBe(false);
    expect(handClaimStatusLabel({ id: 'm1', userId: null })).toBe('Awaiting claim');
    expect(handClaimStatusLabel({ id: 'm2', userId: 'u1' })).toBe('Connected');
  });

  test('section titles', () => {
    expect(peopleHandsSectionTitle()).toBe('Hands');
    expect(peoplePendingSectionTitle()).toMatch(/pending request/i);
  });

  test('hands vs people metrics string', () => {
    expect(
      formatHandsPeopleMetrics({ handCount: 5, uniqueMemberCount: 3 }),
    ).toBe('5 hands · 3 people');
    expect(formatHandsPeopleMetrics({ handCount: 1, uniqueMemberCount: 1 })).toBe(
      '1 hand · 1 person',
    );
    expect(formatHandsPeopleMetrics({ fallbackHandCount: 2 })).toBe('2 hands');
  });
});
