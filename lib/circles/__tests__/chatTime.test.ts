import { formatChatTime } from '@/lib/circles/chatTime';

// The timezone is passed in on purpose: tests must not depend on the timezone
// of the machine that runs them (build servers are usually UTC).
describe('formatChatTime', () => {
  test('shows the exact UTC send time in the viewer timezone', () => {
    // 13:41 UTC is 7:41 AM in US Central (UTC-6 in November).
    expect(
      formatChatTime('2026-11-07T13:41:00Z', '01:41 PM', 'en-US', 'America/Chicago'),
    ).toBe('7:41 AM');
  });

  test('handles an afternoon time and daylight saving', () => {
    // 20:05 UTC in July is 3:05 PM Central (UTC-5).
    expect(
      formatChatTime('2026-07-07T20:05:00Z', '08:05 PM', 'en-US', 'America/Chicago'),
    ).toBe('3:05 PM');
  });

  test('a viewer already on UTC sees the same time the server wrote', () => {
    expect(formatChatTime('2026-11-07T13:41:00Z', '01:41 PM', 'en-US', 'UTC')).toBe('1:41 PM');
  });

  test('falls back to the server text when there is no usable time', () => {
    expect(formatChatTime(null, '01:41 PM')).toBe('01:41 PM');
    expect(formatChatTime(undefined, '01:41 PM')).toBe('01:41 PM');
    expect(formatChatTime('not a date', '01:41 PM')).toBe('01:41 PM');
  });
});
