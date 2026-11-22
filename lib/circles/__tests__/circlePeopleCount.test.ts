import { circlePeopleCount } from '../circlePeopleCount';

describe('circlePeopleCount', () => {
  it('uses the member-limit count when the backend sends it', () => {
    expect(
      circlePeopleCount({
        rosterCapacity: { distinctMemberCount: 20 },
        uniqueMemberCount: 1,
      }),
    ).toBe(20);
  });

  it('falls back to connected people for older backends', () => {
    expect(circlePeopleCount({ uniqueMemberCount: 3 })).toBe(3);
    expect(circlePeopleCount({ uniquePeopleCount: 4, uniqueMemberCount: 3 })).toBe(4);
  });

  it('prefers the first source that has the roster count', () => {
    expect(
      circlePeopleCount(
        { uniqueMemberCount: 2 },
        { rosterCapacity: { distinctMemberCount: 7 } },
      ),
    ).toBe(7);
  });

  it('returns null when nothing is known', () => {
    expect(circlePeopleCount(undefined, null, {})).toBeNull();
  });
});
