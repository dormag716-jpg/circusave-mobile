/**
 * What to tell an organizer whose circle has no room for another member.
 *
 * Organizers on Free (and later Member Pro) are guided to Organizer Pro; an
 * organizer already on Organizer Pro only gets the plain limit. The backend
 * decides whether the circle is full; this only chooses the words.
 */
export type MemberLimitCapacity = {
  tier?: string | null;
  maxHands?: number | null;
  maxMembersPerCircle?: number | null;
  remainingHands?: number | null;
  atCapacity?: boolean | null;
};

export type MemberLimitNotice = {
  titleKey: 'organizer.planLimitTitle';
  bodyKey: 'organizer.freeLimit' | 'organizer.premiumLimit';
  count: number;
  /** Show a button that opens the subscription screen. */
  offerOrganizerPro: boolean;
};

export function memberLimitNotice(
  capacity: MemberLimitCapacity | null | undefined,
): MemberLimitNotice | null {
  if (!capacity) {
    return null;
  }
  const full =
    capacity.atCapacity === true ||
    (typeof capacity.remainingHands === 'number' && capacity.remainingHands <= 0);
  if (!full) {
    return null;
  }
  const paid = capacity.tier === 'premium';
  const count =
    capacity.maxMembersPerCircle ?? capacity.maxHands ?? (paid ? 50 : 20);
  return {
    titleKey: 'organizer.planLimitTitle',
    bodyKey: paid ? 'organizer.premiumLimit' : 'organizer.freeLimit',
    count,
    offerOrganizerPro: !paid,
  };
}
