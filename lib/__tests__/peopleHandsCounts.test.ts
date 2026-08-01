import { formatHandsPeopleMetrics } from '../circleLifecycleCopy';

describe('people versus hands display', () => {
  test('3 users one hand each → 3 people, 3 hands', () => {
    expect(
      formatHandsPeopleMetrics({
        handCount: 3,
        uniqueMemberCount: 3,
      }),
    ).toBe('3 hands · 3 people');
  });

  test('3 users with one owning 2 hands → 3 people, 4 hands', () => {
    expect(
      formatHandsPeopleMetrics({
        handCount: 4,
        uniqueMemberCount: 3,
      }),
    ).toBe('4 hands · 3 people');
  });

  test('organizer multi-hand still one person', () => {
    expect(
      formatHandsPeopleMetrics({
        handCount: 2,
        uniqueMemberCount: 1,
      }),
    ).toBe('2 hands · 1 person');
  });

  test('unclaimed planned hands do not invent people when unique count is zero', () => {
    // Only hand label when unique people unknown/zero for unclaimed-only drafts.
    expect(
      formatHandsPeopleMetrics({
        handCount: 2,
        uniqueMemberCount: 0,
      }),
    ).toBe('2 hands · 0 people');
  });
});
