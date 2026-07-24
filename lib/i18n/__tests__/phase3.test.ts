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

import { changeLanguagePreference, i18n, initializeI18n } from '../index';
import { formatCurrency, formatOrdinal } from '../formatters';
import { resolveJoinOutcome } from '../../joinOutcome';
import {
  groupCurrentApiHandsForDisplay,
  validateCurrentPayoutOrder,
} from '../../peopleWorkspace';

describe('Phase 3 circle workspace localization', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
  });

  test.each([
    ['en', 'People', 'Approve', 'Review payout order'],
    ['es', 'Personas', 'Aprobar', 'Revisar orden de pagos'],
    ['ht', 'Moun', 'Apwouve', 'Revize lòd peman an'],
  ] as const)('provides workspace, People, and payout copy in %s', async (
    language,
    peopleTab,
    approve,
    payoutTitle,
  ) => {
    await changeLanguagePreference(language);

    expect(i18n.t('circleWorkspace:tabs.people')).toBe(peopleTab);
    expect(i18n.t('people:common.approve')).toBe(approve);
    expect(i18n.t('payoutOrder:review.title')).toBe(payoutTitle);
  });

  test.each(['en', 'es', 'ht'] as const)(
    'provides all Phase 3 namespaces in %s',
    async (language) => {
      await changeLanguagePreference(language);

      for (const key of [
        'createCircle:landing.title',
        'joinCircle:title',
        'invite:invitedTitle',
        'circleWorkspace:tabs.people',
        'people:requests.pendingApproval',
        'payoutOrder:review.moveUp',
      ]) {
        expect(i18n.t(key)).not.toBe(key);
      }
    },
  );

  test('missing Phase 3 keys fall back to English', async () => {
    i18n.addResource(
      'en',
      'createCircle',
      'fallbackProbe',
      'Create-circle fallback',
    );
    await changeLanguagePreference('ht');

    expect(i18n.t('createCircle:fallbackProbe')).toBe(
      'Create-circle fallback',
    );
  });

  test('create-circle validation and accessibility copy switch immediately', async () => {
    await changeLanguagePreference('es');
    expect(i18n.t('createCircle:errors.circleNameTitle')).toBe(
      'Falta el nombre',
    );
    expect(i18n.t('createCircle:accessibility.removeMember', { name: 'Ana' }))
      .toContain('Ana');

    await changeLanguagePreference('ht');
    expect(i18n.t('createCircle:errors.circleNameTitle')).not.toBe(
      'Falta el nombre',
    );
  });

  test('join and invite outcomes use localized display copy', async () => {
    expect(
      resolveJoinOutcome(
        { viewerHands: [{ id: 'membership-1', userId: 'user-1' }] },
        'user-1',
      ),
    ).toBe('claimed');
    expect(
      resolveJoinOutcome(
        { waitlist: [{ id: 'request-1', userId: 'user-1' }] },
        'user-1',
      ),
    ).toBe('pending');

    await changeLanguagePreference('es');
    expect(i18n.t('joinCircle:outcome.pendingTitle')).toBe(
      'Solicitud enviada',
    );
    expect(i18n.t('invite:accept')).toBe('Aceptar invitación');
  });

  test('multiple hands remain independently addressable', async () => {
    const hands = [
      { id: 'membership-1', userId: 'user-1' },
      { id: 'membership-2', userId: 'user-1' },
      { id: 'membership-3', userId: 'user-2' },
    ];
    const groups = groupCurrentApiHandsForDisplay(hands);
    const order = ['membership-2', 'membership-1', 'membership-3'];

    expect(groups[0].hands.map((hand) => hand.id)).toEqual([
      'membership-1',
      'membership-2',
    ]);
    expect(validateCurrentPayoutOrder(hands, order).valid).toBe(true);
    expect(order).toEqual([
      'membership-2',
      'membership-1',
      'membership-3',
    ]);

    await changeLanguagePreference('ht');
    expect(i18n.t('people:hands.handLabel', { number: 2 })).toContain('2');
  });

  test('limited optional payloads and unfinalized orders remain explicit', () => {
    expect(resolveJoinOutcome({ members: undefined, waitlist: undefined }, 'user-1'))
      .toBe('pending');
    expect(validateCurrentPayoutOrder([], [])).toEqual({
      valid: true,
      missingHandIds: [],
      duplicateHandIds: [],
      unknownHandIds: [],
    });
    expect(
      validateCurrentPayoutOrder(
        [{ id: 'membership-1', userId: 'user-1' }],
        [],
      ).missingHandIds,
    ).toEqual(['membership-1']);
  });

  test('ordinal and money formatting preserve exact values', () => {
    const amount = 1250;
    expect(formatOrdinal(1, 'en')).toBe('1st');
    expect(formatOrdinal(2, 'es')).toBe('2.º');
    expect(formatOrdinal(3, 'ht')).toBe('3yèm');
    expect(formatCurrency(amount, 'en')).toContain('1,250');
    expect(formatCurrency(amount, 'es')).toContain('1,250');
    expect(amount).toBe(1250);
  });

  test('long Spanish and Haitian Creole strings remain complete', async () => {
    await changeLanguagePreference('es');
    expect(i18n.t('people:start.confirmBody').length).toBeGreaterThan(80);

    await changeLanguagePreference('ht');
    expect(i18n.t('invite:organizer.claimSubtitle').length).toBeGreaterThan(80);
  });

  test('interpolates counts without altering canonical identifiers', async () => {
    const canonical = {
      membershipId: 'membership-1',
      userId: 'user-1',
      requestId: 'request-1',
      turnOrder: ['membership-1'],
      status: 'draft',
    };
    const before = structuredClone(canonical);

    await changeLanguagePreference('es');
    expect(i18n.t('people:hands.pendingBody', { number: 2 })).toContain('2');
    expect(i18n.t('people:start.unclaimedBody', { count: 2 })).toContain('2');
    expect(canonical).toEqual(before);
  });
});
