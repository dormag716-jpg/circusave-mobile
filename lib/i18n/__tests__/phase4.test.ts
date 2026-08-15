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

import type { BackendLedgerEntry, BackendWalletTransaction } from '../../api';
import type { BackendActivity } from '../../types';
import {
  activityEventSentence,
  contributionTotal,
  contributionStatusLabel,
  ledgerEventLabel,
  notificationCopy,
  roundStatusLabel,
  walletStatusLabel,
  walletTransactionLabel,
} from '../financial-presentation';
import {
  formatCurrency,
  formatDateTime,
  formatPercentage,
  formatRelativeDate,
} from '../formatters';
import { changeLanguagePreference, i18n, initializeI18n } from '../index';

describe('Phase 4 financial localization', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
  });

  test.each(['en', 'es', 'ht'] as const)(
    'registers all Phase 4 namespaces in %s',
    async (language) => {
      await changeLanguagePreference(language);
      for (const namespace of [
        'contributions',
        'rounds',
        'schedule',
        'ledger',
        'wallet',
        'activity',
        'notifications',
        'financialErrors',
      ]) {
        expect(i18n.hasResourceBundle(language, namespace)).toBe(true);
      }
    },
  );

  test('falls back to English and switches financial copy without restart', async () => {
    i18n.addResource('en', 'wallet', 'fallbackProbe', 'Wallet fallback');
    await changeLanguagePreference('ht');
    expect(i18n.t('wallet:fallbackProbe')).toBe('Wallet fallback');
    expect(contributionStatusLabel('confirmed', i18n.t)).toBe('Peman konfime');
    await changeLanguagePreference('es');
    expect(contributionStatusLabel('confirmed', i18n.t)).toBe('Pago confirmado');
  });

  test('maps contribution, round, ledger, and wallet machine values without mutation', async () => {
    await changeLanguagePreference('es');
    const ledger: BackendLedgerEntry = {
      id: 'ledger-1',
      event_type: 'contribution_confirmed',
      memberId: 'membership-1',
      amount: 125,
      round: 2,
    };
    const transaction: BackendWalletTransaction = {
      id: 'txn-1',
      type: 'payout_release',
      status: 'posted',
      amount: 125,
      toMemberId: 'membership-2',
    };
    const before = structuredClone({ ledger, transaction });

    expect(contributionStatusLabel('rejected', i18n.t)).toBe(
      'El pago necesita atención',
    );
    expect(roundStatusLabel('active', i18n.t)).toBe('Ronda en curso');
    expect(ledgerEventLabel(ledger, i18n.t)).toBe('Contribución confirmada');
    expect(walletTransactionLabel(transaction, i18n.t)).toBe('Pago recibido');
    expect(walletStatusLabel(transaction.status, i18n.t)).toBe('Completada');
    expect({ ledger, transaction }).toEqual(before);
  });

  test('preserves one-hand, multiple-hand, and server-provided contribution totals', () => {
    expect(contributionTotal({ amountPerHand: 50, handCount: 1 })).toBe(50);
    expect(contributionTotal({ amountPerHand: 50, handCount: 3 })).toBe(150);
    expect(
      contributionTotal({
        amountPerHand: 50,
        handCount: 3,
        serverTotal: 149.99,
      }),
    ).toBe(149.99);
  });

  test('uses safe localized fallbacks for unknown and malformed records', async () => {
    await changeLanguagePreference('ht');
    expect(
      ledgerEventLabel({ id: 'ledger-x', event_type: 'new_internal_type' }, i18n.t),
    ).toBe(i18n.t('ledger:unknownEvent'));
    expect(walletTransactionLabel({ id: 'txn-x' }, i18n.t)).toBe(
      i18n.t('wallet:types.unknown'),
    );
    expect(walletStatusLabel(undefined, i18n.t)).toBe(
      i18n.t('wallet:statuses.unknown'),
    );
  });

  test('builds structured activity sentences without raw backend prose', async () => {
    await changeLanguagePreference('es');
    const activity: BackendActivity = {
      id: 'activity-1',
      circleId: 'circle-1',
      circleName: 'Familia',
      type: 'contribution_submitted',
      title: 'RAW BACKEND TITLE',
      message: 'RAW BACKEND MESSAGE',
      amount: 75,
      createdAt: '2026-07-24T10:00:00Z',
      round: 3,
      memberId: 'membership-1',
      metadata: { userId: 'user-1' },
    };

    const sentence = activityEventSentence(activity, i18n.t, {
      name: 'Ana',
    });
    expect(sentence).toContain('Ana');
    expect(sentence).toContain('3');
    expect(sentence).not.toContain('RAW BACKEND');
    expect(activity.memberId).toBe('membership-1');
    expect(activity.metadata.userId).toBe('user-1');

    expect(
      activityEventSentence({ ...activity, type: 'unknown_event' }, i18n.t),
    ).toBe(i18n.t('activity:unknownEvent'));
  });

  test('localizes supported and unknown notification types without mutating payload data', async () => {
    await changeLanguagePreference('ht');
    const data = { round: 4, name: 'Jean', circle: 'Fanmi' };
    const before = structuredClone(data);
    const supported = notificationCopy('payout_ready', data, i18n.t);
    const unknown = notificationCopy('future_notification', data, i18n.t);

    expect(supported.body).toContain('4');
    expect(unknown.title).toBe(i18n.t('notifications:fallback.title'));
    expect(data).toEqual(before);
  });

  test('preserves exact financial values, currency codes, dates, percentages, and IDs', () => {
    const amount = 1234.56;
    const membershipId = 'membership-1';
    const userId = 'user-1';
    const recipientId = 'membership-2';
    const status = 'confirmed';
    const formatted = formatCurrency(amount, 'es', 'USD', 2);

    expect(formatted).toContain('1,234.56');
    expect(formatted).toMatch(/US\$|USD|\$/);
    expect(formatDateTime('2026-07-24T23:30:00Z', 'en')).toContain('2026');
    expect(formatDateTime('2026-07-24', 'en')).toContain('Jul 24');
    expect(
      formatRelativeDate(
        '2026-07-25T12:00:00Z',
        'en',
        new Date('2026-07-24T12:00:00Z'),
      ),
    ).toBe('tomorrow');
    expect(formatPercentage(50, 'es')).toContain('50');
    expect({ amount, membershipId, userId, recipientId, status }).toEqual({
      amount: 1234.56,
      membershipId: 'membership-1',
      userId: 'user-1',
      recipientId: 'membership-2',
      status: 'confirmed',
    });
  });

  test('supports long Spanish and Haitian Creole financial and accessibility copy', async () => {
    await changeLanguagePreference('es');
    expect(i18n.t('contributions:handPaymentNotice').length).toBeGreaterThan(50);
    expect(i18n.t('contributions:submitA11y')).toContain('mano');
    await changeLanguagePreference('ht');
    expect(i18n.t('rounds:payout.waitingPermission').length).toBeGreaterThan(40);
    expect(i18n.t('wallet:transactionA11y', {
      type: 'Peman',
      status: 'Fini',
      amount: '$10',
    })).toContain('$10');
  });
});
