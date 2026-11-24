import { tierCardAction, tierCardLimits } from '../tierPlanCards';

describe('tierCardAction', () => {
  it('marks the current plan', () => {
    expect(tierCardAction('free', 'free')).toBe('current_free');
    expect(tierCardAction('member_pro', 'member_pro')).toBe('current_paid');
  });

  it('lets a free person choose either paid plan', () => {
    expect(tierCardAction('free', 'member_pro')).toBe('choose');
    expect(tierCardAction('free', 'organizer_pro')).toBe('choose');
  });

  it('upgrades now and downgrades at renewal', () => {
    expect(tierCardAction('member_pro', 'organizer_pro')).toBe('upgrade');
    expect(tierCardAction('organizer_pro', 'member_pro')).toBe('switch_at_renewal');
  });

  it('never sells Free', () => {
    expect(tierCardAction('organizer_pro', 'free')).toBe('none');
  });
});

describe('tierCardLimits', () => {
  it('matches the plan table', () => {
    expect(tierCardLimits('free')).toEqual({
      maxMembersPerCircle: 20, handsIncluded: 1, maxHandsPerPerson: 3, maxOpenCircles: 1,
    });
    expect(tierCardLimits('organizer_pro').maxMembersPerCircle).toBe(50);
    expect(tierCardLimits('organizer_pro').maxOpenCircles).toBe(2);
  });
});
