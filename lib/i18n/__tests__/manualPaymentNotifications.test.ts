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

import { notificationCopy } from '../financial-presentation';
import { changeLanguagePreference, i18n, initializeI18n } from '../index';

describe('manual payment notification copy', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
  });

  test('submitted asks the organizer to verify, not that CircuSave sent money', async () => {
    await changeLanguagePreference('en');
    const copy = notificationCopy(
      'payment_submitted',
      { name: 'Malcolm' },
      i18n.t,
    );
    expect(copy.title).toBe('Payment to verify');
    expect(copy.body).toBe('Malcolm reported a payment to verify.');
    expect(copy.body.toLowerCase()).not.toContain('circuSave sent');
    expect(copy.title.toLowerCase()).not.toBe('payment submitted');
  });

  test('confirmed means the organizer received it', async () => {
    await changeLanguagePreference('en');
    const copy = notificationCopy('payment_confirmed', {}, i18n.t);
    expect(copy.title).toBe('Payment received');
    expect(copy.body).toContain('organizer confirmed they received');
  });

  test('rejected includes reason when present and stays honest without it', async () => {
    await changeLanguagePreference('en');
    const withReason = notificationCopy(
      'payment_rejected',
      { reason: 'Wrong amount' },
      i18n.t,
    );
    const withoutReason = notificationCopy('payment_rejected', {}, i18n.t);
    expect(withReason.body).toContain('Wrong amount');
    expect(withoutReason.body).toBe(
      'The organizer did not receive this payment.',
    );
    expect(withoutReason.body).not.toContain('Reason:');
  });

  test('instruction-change copy is supported without becoming a fallback', async () => {
    await changeLanguagePreference('en');
    const copy = notificationCopy(
      'payment_instructions_updated',
      { circle: 'Fanmi' },
      i18n.t,
    );
    expect(copy.title).toBe('Payment instructions updated');
    expect(copy.body).toContain('Fanmi');
    expect(copy.title).not.toBe(i18n.t('notifications:fallback.title'));
  });

  test.each(['es', 'ht'] as const)(
    'keeps localized payment notification titles in %s',
    async (language) => {
      await changeLanguagePreference(language);
      expect(i18n.t('notifications:payment_submitted.title').length).toBeGreaterThan(0);
      expect(i18n.t('notifications:payment_confirmed.title').length).toBeGreaterThan(0);
      expect(i18n.t('notifications:payment_rejected.title').length).toBeGreaterThan(0);
      expect(
        i18n.t('notifications:payment_instructions_updated.title').length,
      ).toBeGreaterThan(0);
    },
  );
});
