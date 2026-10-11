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
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

import { activityEventSentence } from '../i18n/financial-presentation';
import { changeLanguagePreference, i18n, initializeI18n } from '../i18n/index';
import type { SupportedLanguage } from '../i18n/types';
import { visibleActivityRosterNames } from '../shared/activityFeed';
import type { BackendActivity } from '../shared/types';

const LANGUAGES: SupportedLanguage[] = ['en', 'es', 'ht'];
const UNKNOWN = ['Unknown member', 'Miembro desconocido', 'Manm enkoni'];

const entry = (type: string): BackendActivity =>
  ({
    id: 'a1',
    circleId: 'c1',
    circleName: 'Audit Circle',
    type,
    title: '',
    message: '',
    amount: 50,
    createdAt: '2026-10-10T15:00:00Z',
    round: 2,
    memberId: 'm-other',
    metadata: {},
  }) as unknown as BackendActivity;

const roster = [
  { id: 'm-org', userId: 'u-org', full_name: 'Olive Organizer' },
  { id: 'm-mia', userId: 'u-mia', full_name: 'Mia Member' },
  { id: 'm-theo', userId: 'u-theo', full_name: 'Theo Third' },
];

describe('Activity roster visibility', () => {
  it('lets an organizer resolve every member of their circle', () => {
    const names = visibleActivityRosterNames(roster, { organizes: true, viewerUserId: 'u-org' }, 'A member');
    expect(names['m-theo']).toBe('Theo Third');
    expect(names['u-mia']).toBe('Mia Member');
    expect(Object.keys(names)).toHaveLength(6);
  });

  it('lets a member resolve only their own hands', () => {
    const names = visibleActivityRosterNames(roster, { organizes: false, viewerUserId: 'u-mia' }, 'A member');
    expect(names).toEqual({ 'm-mia': 'Mia Member', 'u-mia': 'Mia Member' });
    expect(JSON.stringify(names)).not.toContain('Theo');
    expect(JSON.stringify(names)).not.toContain('Olive');
  });

  it('names no one when the viewer is unknown', () => {
    expect(visibleActivityRosterNames(roster, { organizes: false, viewerUserId: null }, 'A member')).toEqual({});
  });

  it('uses the neutral fallback for a nameless own hand', () => {
    const names = visibleActivityRosterNames(
      [{ id: 'm1', userId: 'u1' }],
      { organizes: false, viewerUserId: 'u1' },
      'A member',
    );
    expect(names.m1).toBe('A member');
  });
});

describe('Activity sentences without a permitted name', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
  });
  afterAll(async () => {
    await changeLanguagePreference('en');
  });

  test.each(LANGUAGES)('%s reads neutrally and never says "Unknown member"', async (language) => {
    await changeLanguagePreference(language);
    for (const type of [
      'contribution_submitted',
      'contribution_confirmed',
      'contribution_rejected',
      'contribution_missed',
      'payout_completed',
    ]) {
      const sentence = activityEventSentence(entry(type), i18n.t, { round: 2 });
      expect(sentence).toContain('2');
      for (const unknown of UNKNOWN) expect(sentence).not.toContain(unknown);
      expect(sentence).not.toContain('{{');
    }
    expect(activityEventSentence(entry('contribution_rejected'), i18n.t)).toBe(
      language === 'en'
        ? "A member's contribution for Round 2 was rejected."
        : language === 'es'
          ? 'Se rechazó la contribución de un miembro para la ronda 2.'
          : 'Yo rejte kontribisyon yon manm pou tou 2.',
    );
  });

  test('still names a permitted person (organizer view, or your own event)', async () => {
    await changeLanguagePreference('en');
    expect(
      activityEventSentence(entry('contribution_submitted'), i18n.t, { name: 'Mia Member', round: 2 }),
    ).toBe('Mia Member submitted a contribution for Round 2.');
  });
});
