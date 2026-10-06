import { frequencyOptionKey } from '../frequencyLabel';

describe('frequencyOptionKey', () => {
  it('normalizes backend spellings', () => {
    expect(frequencyOptionKey('weekly')).toBe('weekly');
    expect(frequencyOptionKey('Weekly')).toBe('weekly');
    expect(frequencyOptionKey('bi-weekly')).toBe('biweekly');
    expect(frequencyOptionKey('Bi_Weekly')).toBe('biweekly');
    expect(frequencyOptionKey(' monthly ')).toBe('monthly');
  });

  it('returns null for unknown values so callers can show the raw value', () => {
    expect(frequencyOptionKey('daily')).toBeNull();
    expect(frequencyOptionKey(undefined)).toBeNull();
    expect(frequencyOptionKey('')).toBeNull();
  });
});
