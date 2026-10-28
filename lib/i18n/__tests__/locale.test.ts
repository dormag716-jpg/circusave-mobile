jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}));

import {
  normalizeLanguageTag,
  resolveLanguagePreference,
} from '../locale';

describe('locale normalization', () => {
  test.each([
    ['en-US', 'en'],
    ['es-DO', 'es'],
    ['es-MX', 'es'],
    ['ht-HT', 'ht'],
    ['fr-HT', 'en'],
  ])('normalizes %s to %s', (languageTag, expected) => {
    expect(normalizeLanguageTag(languageTag)).toBe(expected);
  });

  test('manual preference overrides the device language', () => {
    expect(resolveLanguagePreference('ht', ['es-DO'])).toBe('ht');
  });

  test('system preference follows the normalized device language', () => {
    expect(resolveLanguagePreference('system', ['es-MX'])).toBe('es');
  });
});
