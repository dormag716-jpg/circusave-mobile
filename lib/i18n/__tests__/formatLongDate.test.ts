import { formatLongDate } from '../formatters';

describe('formatLongDate', () => {
  test('writes the full date in the app language', () => {
    expect(formatLongDate('2027-11-21T12:00:00Z', 'en')).toBe('November 21, 2027');
    expect(formatLongDate('2027-11-21T12:00:00Z', 'es')).toContain('2027');
  });

  test('returns the input when it is not a date', () => {
    expect(formatLongDate('soon', 'en')).toBe('soon');
  });
});
