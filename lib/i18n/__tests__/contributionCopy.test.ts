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

import {
  contributionCopy,
  contributionCopyLooksUnresolved,
  unresolvedContributionCopyKeys,
} from '../contributionCopy';
import { changeLanguagePreference, i18n, initializeI18n } from '../index';

const RAW_WORKSPACE_KEYS = [
  'workspace.myContributions',
  'workspace.amountDue',
  'workspace.roundLabel',
  'workspace.handLabel',
  'workspace.markAsSent',
  'workspace.payOutsideTitle',
  'workspace.sendUsingInstructions',
  'workspace.circuSaveDoesNotSend',
  'workspace.payOutsideAlsoInApp',
];

describe('contributionCopy resolution', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
  });

  test.each(['en', 'es', 'ht'] as const)(
    'resolves member-card workspace keys in %s and never returns raw keys',
    async (language) => {
      await changeLanguagePreference(language);
      const boundToWorkspace = i18n.getFixedT(language, 'circleWorkspace');
      const unresolved = unresolvedContributionCopyKeys(boundToWorkspace);
      expect(unresolved).toEqual([]);

      for (const key of RAW_WORKSPACE_KEYS) {
        const value = contributionCopy(boundToWorkspace, key, {
          amount: '$1,000',
          number: 1,
          round: 6,
        });
        expect(contributionCopyLooksUnresolved(value, key)).toBe(false);
        expect(value).not.toBe(key);
        expect(value).not.toBe(`contributions:${key}`);
        expect(value.startsWith('workspace.')).toBe(false);
      }
    },
  );

  test('English member-card copy is the user-facing phrase, not the key', async () => {
    await changeLanguagePreference('en');
    expect(contributionCopy(i18n.t, 'workspace.myContributions')).toBe(
      'My contributions this round',
    );
    expect(contributionCopy(i18n.t, 'workspace.markAsSent')).toBe('Mark as sent');
    expect(
      contributionCopy(i18n.t, 'workspace.amountDue', { amount: '$3,000' }),
    ).toBe('$3,000 due');
  });

  test('member contribution card source does not render raw workspace keys', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', '..', 'app', 'circle', 'workspace.tsx'),
      'utf8',
    );
    const cardStart = source.indexOf('function MemberContributionCard');
    const cardEnd = source.indexOf(
      'function openContributionPaymentSetup',
      cardStart,
    );
    const card = source.slice(cardStart, cardEnd);
    expect(card).toContain('contributionCopy(t,');
    expect(card).not.toMatch(/\{t\('workspace\.[^']+'\)\}/);
    expect(card).not.toContain("{t('contributions:workspace.myContributions')}");
    expect(card).toContain('styles.memberHandInlineButton');
    expect(card).not.toContain('styles.memberHandPrimaryButton');
  });
});
