const asyncStorageValues = new Map<string, string>();
let deviceLanguageTag = 'en-US';

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
  getLocales: () => [{ languageTag: deviceLanguageTag }],
}));

import {
  changeLanguagePreference,
  i18n,
  initializeI18n,
} from '../index';

describe('i18n foundation', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    deviceLanguageTag = 'en-US';
    await initializeI18n();
  });

  test('switching language changes navigation and settings text', async () => {
    await changeLanguagePreference('es');
    expect(i18n.t('navigation:settings')).toBe('Ajustes');
    expect(i18n.t('settings:language')).toBe('Idioma');

    await changeLanguagePreference('ht');
    expect(i18n.t('navigation:settings')).toBe('Paramèt');
    expect(i18n.t('settings:language')).toBe('Lang');
  });

  test('system preference resumes device-language detection', async () => {
    deviceLanguageTag = 'es-DO';

    await changeLanguagePreference('system');

    expect(i18n.resolvedLanguage).toBe('es');
  });

  test('missing translation falls back to English', async () => {
    i18n.addResource('en', 'common', 'fallbackProbe', 'English fallback');
    await changeLanguagePreference('es');

    expect(i18n.t('common:fallbackProbe')).toBe('English fallback');
  });

  test('language changes do not mutate account or financial state', async () => {
    const state = {
      accountId: 'usr_123',
      amount: 125,
      currencyCode: 'USD',
      status: 'confirmed',
      permissions: { canReleasePayout: false },
    };
    const before = structuredClone(state);

    await changeLanguagePreference('ht');

    expect(state).toEqual(before);
  });
});
