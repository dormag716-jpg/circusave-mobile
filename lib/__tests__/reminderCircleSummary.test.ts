const asyncStorageValues = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => asyncStorageValues.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      asyncStorageValues.set(key, value);
    }),
  },
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

import {
  normalizeFrequencyKey,
  reminderMemberFrequencySummary,
} from '../reminderCircleSummary';
import { changeLanguagePreference, i18n, initializeI18n } from '../i18n';

describe('reminderCircleSummary', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
  });

  test('normalizes legacy English labels to backend frequency keys', () => {
    expect(normalizeFrequencyKey('Weekly')).toBe('weekly');
    expect(normalizeFrequencyKey('Bi-weekly')).toBe('biweekly');
    expect(normalizeFrequencyKey('Monthly')).toBe('monthly');
    expect(normalizeFrequencyKey('bi_weekly')).toBe('biweekly');
  });

  test('keeps selected frequency values backend-compatible', () => {
    expect(normalizeFrequencyKey('weekly')).toBe('weekly');
    expect(normalizeFrequencyKey('biweekly')).toBe('biweekly');
    expect(normalizeFrequencyKey('monthly')).toBe('monthly');
  });

  test.each([
    ['en', 0, 'weekly', '0 members · Weekly'],
    ['en', 1, 'weekly', '1 member · Weekly'],
    ['en', 4, 'biweekly', '4 members · Bi-weekly'],
    ['es', 0, 'weekly', '0 miembros · Semanal'],
    ['es', 1, 'weekly', '1 miembro · Semanal'],
    ['es', 4, 'biweekly', '4 miembros · Cada dos semanas'],
    ['ht', 0, 'weekly', '0 manm · Chak semèn'],
    ['ht', 1, 'weekly', '1 manm · Chak semèn'],
    ['ht', 4, 'biweekly', '4 manm · Chak de semèn'],
  ] as const)(
    '%s count=%s frequency=%s',
    async (language, count, frequency, expected) => {
      await changeLanguagePreference(language);
      expect(reminderMemberFrequencySummary(i18n.t, count, frequency)).toBe(
        expected,
      );
    },
  );
});
