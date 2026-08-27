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

import { reminderMemberFrequencySummary } from '../../reminderCircleSummary';
import { formatCurrency, formatDateTime } from '../formatters';
import { changeLanguagePreference, i18n, initializeI18n } from '../index';
import type { SupportedLanguage } from '../types';

const LANGUAGES: SupportedLanguage[] = ['en', 'es', 'ht'];

const REQUIRED_KEYS = [
  'circleWorkspace:history.title',
  'circleWorkspace:history.body',
  'circleWorkspace:history.openRecords',
  'circleWorkspace:chat.placeholder',
  'circleWorkspace:chat.sendA11y',
  'circleWorkspace:chat.deleteA11y',
  'circleWorkspace:chat.deleteA11yHint',
  'ledger:center.title',
  'ledger:center.downloadPdf',
  'ledger:center.today',
  'ledger:center.yesterday',
  'ledger:center.loadingMembers',
  'ledger:center.emptyMembersTitle',
  'ledger:center.retry',
  'ledger:center.datePlaceholder',
  'common:goBack',
  'common:cancel',
  'common:unknown',
  'common:closeDialog',
  'common:retry',
  'settings:smartRemindersMemberSummary',
  'settings:organizerProActive',
  'settings:freePlanUpgrade',
  'circles:frequency.weekly',
  'circles:frequency.biweekly',
  'circles:frequency.monthly',
  'createCircle:schedule.options.weekly',
  'financialErrors:stripeCanceled',
  'financialErrors:stripeSettlementDelay',
  'agreements:startTitle',
  'agreements:startConfirmTitle',
  'agreements:startBlockedStructural',
  'agreements:structureLockWarning',
  'agreements:retry',
  'circles:archive',
  'circles:peopleCount_zero',
  'circles:handCount_zero',
  'subscription:productName',
  'subscription:cancelRenewal',
  'settings:externalPaymentDisclosure',
  'settings:organizerProBadge',
  'security:title',
  'legal:title',
  'common:notFoundBody',
] as const;

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (value == null || typeof value !== 'object') {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (nested && typeof nested === 'object') {
      return flattenKeys(nested, path);
    }
    return [path];
  });
}

describe('EN/ES/HT localization readiness', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
  });

  test('every English catalog key exists in Spanish and Haitian Creole', () => {
    const namespaces = i18n.options.ns as string[];
    const missing: string[] = [];

    for (const namespace of namespaces) {
      const enKeys = flattenKeys(i18n.getResourceBundle('en', namespace));
      for (const language of ['es', 'ht'] as const) {
        const bundle = i18n.getResourceBundle(language, namespace) || {};
        const present = new Set(flattenKeys(bundle));
        for (const key of enKeys) {
          if (!present.has(key)) {
            missing.push(`${language}:${namespace}.${key}`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });

  test.each(LANGUAGES)(
    'required keys resolve in %s without raw key names or empty values',
    async (language) => {
      await changeLanguagePreference(language);
      for (const key of REQUIRED_KEYS) {
        expect(i18n.exists(key, { lng: language, count: 2 })).toBe(true);
        const value = i18n.t(key, { lng: language, count: 2 });
        expect(value.trim().length).toBeGreaterThan(0);
        expect(value).not.toBe(key);
        expect(value).not.toMatch(/^[a-z]+:[a-zA-Z.]+$/);
      }
    },
  );

  test('reminder summaries pluralize for 0, 1, and many in all locales', async () => {
    const expected = {
      en: {
        0: '0 members · Weekly',
        1: '1 member · Weekly',
        3: '3 members · Monthly',
      },
      es: {
        0: '0 miembros · Semanal',
        1: '1 miembro · Semanal',
        3: '3 miembros · Mensual',
      },
      ht: {
        0: '0 manm · Chak semèn',
        1: '1 manm · Chak semèn',
        3: '3 manm · Chak mwa',
      },
    } as const;

    for (const language of LANGUAGES) {
      await changeLanguagePreference(language);
      expect(reminderMemberFrequencySummary(i18n.t, 0, 'Weekly')).toBe(
        expected[language][0],
      );
      expect(reminderMemberFrequencySummary(i18n.t, 1, 'weekly')).toBe(
        expected[language][1],
      );
      expect(reminderMemberFrequencySummary(i18n.t, 3, 'monthly')).toBe(
        expected[language][3],
      );
    }
  });

  test('currency and dates follow the active locale and keep USD cents exact', async () => {
    const amount = 1250.5;
    const iso = '2026-07-24T12:00:00Z';

    await changeLanguagePreference('en');
    const enMoney = formatCurrency(amount, 'en', 'USD', 2);
    const enDate = formatDateTime(iso, 'en');
    expect(enMoney).toContain('1,250.50');
    expect(enMoney).toMatch(/\$|USD/);
    expect(enDate).toMatch(/Jul/);
    expect(enDate).toContain('2026');

    await changeLanguagePreference('es');
    const esMoney = formatCurrency(amount, 'es', 'USD', 2);
    const esDate = formatDateTime(iso, 'es');
    expect(esMoney).toMatch(/1[,.]250[,.]50/);
    expect(esMoney).toMatch(/\$|USD|US\$/);
    expect(esDate).not.toBe(enDate);
    expect(esDate).toContain('2026');

    await changeLanguagePreference('ht');
    const htMoney = formatCurrency(amount, 'ht', 'USD', 2);
    const htDate = formatDateTime(iso, 'ht');
    expect(htMoney).toMatch(/1[,.\s]250[,.]50/);
    expect(htMoney).toMatch(/\$|USD|US\$/);
    expect(htDate).toContain('2026');
  });

  test('user-created content is not rewritten by locale keys', async () => {
    const userCircle = 'Neighborhood Circle';
    const userNote = 'Paid Marie in cash';
    await changeLanguagePreference('es');
    expect(i18n.t('ledger:center.openStatementA11y', { name: userCircle })).toContain(
      userCircle,
    );
    expect(userNote).toBe('Paid Marie in cash');
    await changeLanguagePreference('ht');
    expect(i18n.t('circles:openCompletedA11y', { circleName: userCircle })).toContain(
      userCircle,
    );
  });

  test('interpolation tokens match across EN, ES, and HT', () => {
    const tokenPattern = /\{\{\s*([^}]+)\s*\}\}/g;
    const namespaces = i18n.options.ns as string[];
    const mismatches: string[] = [];

    for (const namespace of namespaces) {
      const enBundle = flattenKeys(i18n.getResourceBundle('en', namespace));
      for (const path of enBundle) {
        const enValue = i18n.getResource('en', namespace, path);
        if (typeof enValue !== 'string') continue;
        const enTokens = [...enValue.matchAll(tokenPattern)].map((m) => m[1].trim()).sort();
        for (const language of ['es', 'ht'] as const) {
          const other = i18n.getResource(language, namespace, path);
          if (typeof other !== 'string') continue;
          const otherTokens = [...other.matchAll(tokenPattern)].map((m) => m[1].trim()).sort();
          if (enTokens.join(',') !== otherTokens.join(',')) {
            mismatches.push(`${language}:${namespace}.${path}`);
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  test('Organizer Pro is the formal product name in all locales', async () => {
    for (const language of LANGUAGES) {
      await changeLanguagePreference(language);
      expect(i18n.t('subscription:productName')).toBe('Organizer Pro');
      expect(i18n.t('settings:organizerProBadge')).toBe('Organizer Pro');
      expect(i18n.t('settings:organizerProActive')).toContain('Organizer Pro');
      expect(i18n.t('settings:organizerProBadge')).not.toBe('PRO');
      expect(i18n.t('settings:organizerProBadge')).not.toBe('PREMIUM');
    }
  });

  test('external-payment disclosure appears in EN, ES, and HT', async () => {
    const expected = {
      en: [
        'CircuSave does not hold, move, or transfer the payment',
        'member reports an external payment',
        'Organizer confirmation is required',
      ],
      es: [
        'CircuSave no retiene, mueve ni transfiere el pago',
        'miembro informa un pago externo',
        'confirmación del organizador',
      ],
      ht: [
        'CircuSave pa kenbe, deplase, ni transfere peman an',
        'rapòte yon peman ekstèn',
        'Konfimasyon òganizatè a obligatwa',
      ],
    } as const;

    for (const language of LANGUAGES) {
      await changeLanguagePreference(language);
      const settingsCopy = i18n.t('settings:externalPaymentDisclosure');
      const paymentSetupCopy = i18n.t(
        'contributions:paymentSetup.externalPaymentDisclosure',
      );
      expect(settingsCopy).toBe(paymentSetupCopy);
      for (const fragment of expected[language]) {
        expect(settingsCopy.toLowerCase()).toContain(fragment.toLowerCase());
      }
      if (language !== 'en') {
        expect(settingsCopy).not.toBe(
          i18n.t('settings:externalPaymentDisclosure', { lng: 'en' }),
        );
      }
    }
  });

  test('audited screen chrome is not English fallback in ES and HT', async () => {
    const probes = [
      'subscription:plans',
      'security:title',
      'legal:title',
      'common:notFoundBody',
      'settings:paymentPrefsTitle',
      'settings:automatedPaymentsTitle',
      'settings:reminderScheduleTitle',
      'subscription:cancelRenewal',
    ];
    await changeLanguagePreference('en');
    const english = Object.fromEntries(
      probes.map((key) => [key, i18n.t(key)]),
    );
    for (const language of ['es', 'ht'] as const) {
      await changeLanguagePreference(language);
      for (const key of probes) {
        const value = i18n.t(key);
        expect(value).not.toBe(key);
        expect(value).not.toBe(english[key]);
      }
    }
  });
});
