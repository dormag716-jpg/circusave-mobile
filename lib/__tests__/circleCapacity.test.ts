import {
  FREE_MAX_PARTICIPATING_HANDS,
  PREMIUM_MAX_PARTICIPATING_HANDS,
  buildRosterCapacity,
  canAddParticipatingHands,
  capacityExceededMessage,
  maxParticipatingHandsForRole,
  normalizePlanTier,
} from '../circleCapacity';

describe('circleCapacity', () => {
  test('free and premium limits', () => {
    expect(maxParticipatingHandsForRole('user')).toBe(FREE_MAX_PARTICIPATING_HANDS);
    expect(maxParticipatingHandsForRole('premium')).toBe(
      PREMIUM_MAX_PARTICIPATING_HANDS,
    );
    expect(normalizePlanTier('Premium Organizer')).toBe('premium');
  });

  test('counts only participating hands', () => {
    const capacity = buildRosterCapacity({
      organizerRoleOrTier: 'free',
      members: [
        { isParticipating: true },
        { isParticipating: true },
        { isParticipating: false },
      ],
    });
    expect(capacity.usedHands).toBe(2);
    expect(capacity.maxHands).toBe(20);
    expect(capacity.remainingHands).toBe(18);
  });

  test('free at capacity blocks further hands', () => {
    const members = Array.from({ length: 20 }, () => ({ isParticipating: true }));
    const capacity = buildRosterCapacity({
      organizerRoleOrTier: 'basic',
      members,
      pendingNewHands: 1,
    });
    expect(capacity.atCapacity).toBe(true);
    expect(capacity.wouldExceed).toBe(true);
    expect(canAddParticipatingHands(capacity, 1)).toBe(false);
    expect(capacityExceededMessage(capacity)).toMatch(/Free circles are limited to 20/i);
  });

  test('premium allows up to 50', () => {
    const members = Array.from({ length: 40 }, () => ({ isParticipating: true }));
    const capacity = buildRosterCapacity({
      organizerRoleOrTier: 'premium',
      members,
      pendingNewHands: 10,
    });
    expect(capacity.maxHands).toBe(50);
    expect(capacity.wouldExceed).toBe(false);
    expect(canAddParticipatingHands(capacity, 10)).toBe(true);
  });

  test('backend snapshot is preferred when present', () => {
    const capacity = buildRosterCapacity({
      organizerRoleOrTier: 'free',
      members: [{ isParticipating: true }],
      backendCapacity: {
        tier: 'premium',
        maxHands: 50,
        usedHands: 12,
      },
    });
    expect(capacity.tier).toBe('premium');
    expect(capacity.maxHands).toBe(50);
    expect(capacity.usedHands).toBe(12);
    expect(capacity.remainingHands).toBe(38);
  });

  test('free open-circle limit is one setup or active', () => {
    const { buildOpenCircleCapacity, openCircleLimitMessage } = require('../circleCapacity');
    const atCap = buildOpenCircleCapacity({
      organizerRoleOrTier: 'free',
      circles: [
        { id: 'c1', status: 'draft', userRole: 'organizer' },
        { id: 'c2', status: 'active', userRole: 'member' },
      ],
    });
    expect(atCap.usedOpenCircles).toBe(1);
    expect(atCap.atCapacity).toBe(true);
    expect(openCircleLimitMessage(atCap)).toMatch(/1 open circle/i);

    const premium = buildOpenCircleCapacity({
      organizerRoleOrTier: 'premium',
      circles: [
        { id: 'c1', status: 'draft', userRole: 'organizer' },
        { id: 'c2', status: 'active', userRole: 'organizer' },
      ],
    });
    expect(premium.unlimited).toBe(true);
    expect(premium.atCapacity).toBe(false);
  });
});
