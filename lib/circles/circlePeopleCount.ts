type PeopleCountSource = {
  rosterCapacity?: { distinctMemberCount?: number | null } | null;
  uniquePeopleCount?: number | null;
  uniqueMemberCount?: number | null;
};

function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/**
 * People in a circle, counted the same way as the member limit: one per
 * account however many hands they hold, plus one for each planned person who
 * has not claimed a hand yet. The older `uniqueMemberCount` only counts people
 * who already connected an account, so it reads "1 person" for a 20-member
 * circle that is still being set up. It is the fallback when the backend does
 * not send the roster count.
 */
export function circlePeopleCount(
  ...sources: Array<PeopleCountSource | null | undefined>
): number | null {
  for (const source of sources) {
    const roster = asCount(source?.rosterCapacity?.distinctMemberCount);
    if (roster !== null) return roster;
  }
  for (const source of sources) {
    const connected =
      asCount(source?.uniquePeopleCount) ?? asCount(source?.uniqueMemberCount);
    if (connected !== null) return connected;
  }
  return null;
}
