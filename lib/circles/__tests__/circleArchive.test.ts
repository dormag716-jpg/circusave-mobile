import { canOrganizerArchiveStartedCircle } from '@/lib/circles/circleArchive';

describe('canOrganizerArchiveStartedCircle', () => {
  test('organizer of a running or paused circle can archive it', () => {
    expect(canOrganizerArchiveStartedCircle(true, 'active')).toBe(true);
    expect(canOrganizerArchiveStartedCircle(true, 'paused')).toBe(true);
  });

  test('a member who is not the organizer never sees it', () => {
    expect(canOrganizerArchiveStartedCircle(false, 'active')).toBe(false);
    expect(canOrganizerArchiveStartedCircle(false, 'paused')).toBe(false);
  });

  test('setup circles keep their own clear action, not this one', () => {
    expect(canOrganizerArchiveStartedCircle(true, 'draft')).toBe(false);
    expect(canOrganizerArchiveStartedCircle(true, 'setup')).toBe(false);
    expect(canOrganizerArchiveStartedCircle(true, 'forming')).toBe(false);
  });

  test('finished, closed and already archived circles need nothing', () => {
    expect(canOrganizerArchiveStartedCircle(true, 'completed')).toBe(false);
    expect(canOrganizerArchiveStartedCircle(true, 'closed')).toBe(false);
    expect(canOrganizerArchiveStartedCircle(true, 'archived')).toBe(false);
    expect(canOrganizerArchiveStartedCircle(true, 'active', 'completed')).toBe(false);
  });
});
