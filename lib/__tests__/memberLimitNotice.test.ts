import { memberLimitNotice } from '../circles/memberLimitNotice';

describe('memberLimitNotice', () => {
  test('says nothing when there is room or no capacity data', () => {
    expect(memberLimitNotice(null)).toBeNull();
    expect(memberLimitNotice(undefined)).toBeNull();
    expect(
      memberLimitNotice({ tier: 'free', maxHands: 20, remainingHands: 3, atCapacity: false }),
    ).toBeNull();
  });

  test('a full Free circle guides the organizer to Organizer Pro', () => {
    expect(
      memberLimitNotice({ tier: 'free', maxHands: 20, remainingHands: 0, atCapacity: true }),
    ).toEqual({
      titleKey: 'organizer.planLimitTitle',
      bodyKey: 'organizer.freeLimit',
      count: 20,
      offerOrganizerPro: true,
    });
  });

  test('a full Organizer Pro circle gets the plain limit and no upgrade button', () => {
    expect(
      memberLimitNotice({ tier: 'premium', maxHands: 50, remainingHands: 0, atCapacity: true }),
    ).toEqual({
      titleKey: 'organizer.planLimitTitle',
      bodyKey: 'organizer.premiumLimit',
      count: 50,
      offerOrganizerPro: false,
    });
  });

  test('prefers the member limit over the hand cap when the backend sends it', () => {
    const notice = memberLimitNotice({
      tier: 'free',
      maxHands: 20,
      maxMembersPerCircle: 20,
      atCapacity: true,
    });
    expect(notice?.count).toBe(20);
  });

  test('treats zero remaining as full even without atCapacity', () => {
    expect(memberLimitNotice({ tier: 'free', remainingHands: 0 })).not.toBeNull();
  });
});
