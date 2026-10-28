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

import { readFileSync } from 'fs';
import path from 'path';

import { contributionCopy } from '../i18n/contributionCopy';
import { changeLanguagePreference, i18n, initializeI18n } from '../i18n';

const supportSource = readFileSync(
  path.join(__dirname, '..', '..', 'app', 'support.tsx'),
  'utf8',
);
const workspaceSource = readFileSync(
  path.join(__dirname, '..', '..', 'app', 'circle', 'workspace.tsx'),
  'utf8',
);

describe('support FAQ and card education', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
  });

  test('support no longer teaches I sent it and uses localized FAQ keys', () => {
    expect(supportSource).toContain("useTranslation('support')");
    expect(supportSource).toContain('t(`sections.${section.id}.body`)');
    expect(supportSource).not.toContain('I Sent It');
    expect(supportSource).not.toContain('I sent it');
  });

  test('English support FAQ teaches Mark as sent and organizer confirmation', async () => {
    await changeLanguagePreference('en');
    const body = i18n.t('support:sections.contributions.body');
    expect(body).toContain('Mark as sent');
    expect(body).toContain('does not transfer money');
    expect(body).toContain('Confirm received');
    expect(body.toLowerCase()).not.toContain('i sent it');
    expect(i18n.hasResourceBundle('en', 'support')).toBe(true);
    expect(i18n.hasResourceBundle('es', 'support')).toBe(true);
    expect(i18n.hasResourceBundle('ht', 'support')).toBe(true);
  });

  test('member card shows one-line Mark as sent education', async () => {
    await changeLanguagePreference('en');
    expect(workspaceSource).toContain(
      "contributionCopy(t, 'workspace.markAsSentEducation')",
    );
    expect(contributionCopy(i18n.t, 'workspace.markAsSentEducation')).toContain(
      'Mark as sent reports a payment you already sent',
    );
    expect(contributionCopy(i18n.t, 'workspace.markAsSentEducation')).toContain(
      'does not move the money',
    );
  });
});
