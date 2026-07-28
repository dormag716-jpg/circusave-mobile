import {
  circleLifecycleBadgeLabel,
  getCircleListLifecycle,
  getViewerPayoutPosition,
  isActiveCircleStatus,
  isClosedCircleStatus,
  isCompletedCircleStatus,
  isPausedCircleStatus,
  isSetupCircleStatus,
} from '../circleSummary';

describe('circle summary lifecycle', () => {
  test.each(['draft', 'setup', 'forming', ' DRAFT '])(
    '%s remains visible as setup',
    (status) => {
      expect(isSetupCircleStatus(status)).toBe(true);
      expect(getCircleListLifecycle(status)).toBe('setup');
      expect(circleLifecycleBadgeLabel(status)).toBe('Setup');
    },
  );

  describe('viewer payout position', () => {
    test('returns null when a limited circle detail omits workspace members', () => {
      expect(
        getViewerPayoutPosition(
          { members: undefined, turnOrder: undefined },
          'user-waitlist',
        ),
      ).toBeNull();
    });

    test('uses payout order when full workspace detail is available', () => {
      expect(
        getViewerPayoutPosition(
          {
            members: [
              { id: 'member-a', userId: 'user-a' },
              { id: 'member-b', userId: 'user-b' },
            ],
            turnOrder: ['member-b', 'member-a'],
          },
          'user-a',
        ),
      ).toBe(2);
    });
  });

  test.each(['active', 'completed', 'paused', 'closed', undefined])(
    '%s is not setup',
    (status) => {
      expect(isSetupCircleStatus(status)).toBe(false);
    },
  );

  test('active remains active and is not paused/closed', () => {
    expect(getCircleListLifecycle('active')).toBe('active');
    expect(isActiveCircleStatus('active')).toBe(true);
    expect(circleLifecycleBadgeLabel('active')).toBe('Active');
  });

  test('paused remains paused — never active', () => {
    expect(getCircleListLifecycle('paused')).toBe('paused');
    expect(isPausedCircleStatus('paused')).toBe(true);
    expect(isActiveCircleStatus('paused')).toBe(false);
    expect(circleLifecycleBadgeLabel('paused')).toBe('Paused');
  });

  test('closed remains closed — never active', () => {
    expect(getCircleListLifecycle('closed')).toBe('closed');
    expect(isClosedCircleStatus('closed')).toBe(true);
    expect(isActiveCircleStatus('closed')).toBe(false);
    expect(circleLifecycleBadgeLabel('closed')).toBe('Closed');
  });

  test('completed remains completed', () => {
    expect(getCircleListLifecycle('completed')).toBe('completed');
    expect(isCompletedCircleStatus('completed')).toBe(true);
    expect(isActiveCircleStatus('completed')).toBe(false);
    expect(circleLifecycleBadgeLabel('completed')).toBe('Completed');
  });

  test('pot completed classifies as completed, not active', () => {
    expect(getCircleListLifecycle('active', 'completed')).toBe('completed');
    expect(isActiveCircleStatus('active', 'completed')).toBe(false);
  });
});
