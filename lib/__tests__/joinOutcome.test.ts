import {
  joinOutcomeMessage,
  joinOutcomeTitle,
  resolveJoinOutcome,
} from '../joinOutcome';

describe('resolveJoinOutcome', () => {
  test('claimed when viewerHands present', () => {
    expect(
      resolveJoinOutcome(
        { viewerHands: [{ id: 'm1', userId: 'u1' }], viewerHandCount: 1 },
        'u1',
      ),
    ).toBe('claimed');
  });

  test('claimed when members includes viewer userId', () => {
    expect(
      resolveJoinOutcome(
        { members: [{ id: 'm1', userId: 'u1' }], waitlist: [] },
        'u1',
      ),
    ).toBe('claimed');
  });

  test('pending when waitlist includes viewer userId', () => {
    expect(
      resolveJoinOutcome(
        {
          members: [{ id: 'm0', userId: 'org' }],
          waitlist: [{ id: 'w1', userId: 'u1' }],
          viewerHands: [],
        },
        'u1',
      ),
    ).toBe('pending');
  });

  test('defaults to pending without strong claim signals', () => {
    expect(resolveJoinOutcome({ members: [], waitlist: [] }, 'u1')).toBe('pending');
  });
});

describe('joinOutcome copy', () => {
  test('claimed title and message', () => {
    expect(joinOutcomeTitle('claimed')).toMatch(/you.?re in/i);
    expect(joinOutcomeMessage('claimed', 'Family Susu')).toMatch(/Family Susu/);
    expect(joinOutcomeMessage('claimed', 'Family Susu')).toMatch(/ready/i);
  });

  test('pending title and message', () => {
    expect(joinOutcomeTitle('pending')).toMatch(/request sent/i);
    expect(joinOutcomeMessage('pending', 'Family Susu')).toMatch(/waiting for the organizer/i);
  });
});
