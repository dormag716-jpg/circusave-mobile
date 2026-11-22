import { isOpenOrganizerCircle } from '../payments/organizerCircles';

describe('isOpenOrganizerCircle', () => {
  it('is true only for running circles the person organizes', () => {
    expect(isOpenOrganizerCircle({ userRole: 'organizer', status: 'active' })).toBe(true);
    expect(isOpenOrganizerCircle({ userRole: 'organizer', status: 'pending' })).toBe(true);
    expect(isOpenOrganizerCircle({ userRole: 'organizer', status: 'Completed' })).toBe(false);
    expect(isOpenOrganizerCircle({ userRole: 'organizer', status: 'archived' })).toBe(false);
    expect(isOpenOrganizerCircle({ userRole: 'member', status: 'active' })).toBe(false);
    expect(isOpenOrganizerCircle({ status: 'active' })).toBe(false);
  });
});
