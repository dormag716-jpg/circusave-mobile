import {
  getViewerPayoutPosition,
  isSetupCircleStatus,
} from '../circleSummary';

describe('circle summary lifecycle', () => {
  test.each(['draft', 'setup', 'forming', ' DRAFT '])('%s remains visible as setup', (status) => {
    expect(isSetupCircleStatus(status)).toBe(true);
  });

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

  test.each(['active', 'completed', 'paused', 'closed', undefined])('%s is not setup', (status) => {
    expect(isSetupCircleStatus(status)).toBe(false);
  });
});
