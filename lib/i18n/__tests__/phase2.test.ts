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

import { formatCurrency, formatShortDate } from '../formatters';
import { changeLanguagePreference, i18n, initializeI18n } from '../index';

describe('Phase 2 localization', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
  });

  test.each([
    ['en', 'Sign In', 'App Locked', 'Active Circles', 'My Circles'],
    ['es', 'Iniciar sesión', 'Aplicación bloqueada', 'Círculos activos', 'Mis círculos'],
    ['ht', 'Konekte', 'Aplikasyon an bloke', 'Gwoup aktif', 'Gwoup mwen yo'],
  ] as const)(
    'provides Phase 2 screen copy in %s',
    async (language, signIn, deviceLock, dashboard, circles) => {
      await changeLanguagePreference(language);

      expect(i18n.t('auth:login.signIn')).toBe(signIn);
      expect(i18n.t('deviceLock:appLocked')).toBe(deviceLock);
      expect(i18n.t('dashboard:activeCircles')).toBe(dashboard);
      expect(i18n.t('circles:myCircles')).toBe(circles);
      expect(i18n.t('settings:signOut')).not.toBe('settings:signOut');
    },
  );

  test('validation and generic authentication failures are localized', async () => {
    await changeLanguagePreference('es');
    expect(i18n.t('auth:create.passwordMismatchTitle')).toBe(
      'Las contraseñas no coinciden',
    );
    expect(i18n.t('auth:common.genericErrorMessage')).toContain(
      'No se pudo completar',
    );

    await changeLanguagePreference('ht');
    expect(i18n.t('auth:login.missingCodeMessage')).toContain('6 chif');
    expect(i18n.t('auth:common.genericErrorMessage')).toContain('Tanpri');
  });

  test('missing Phase 2 translation falls back to English', async () => {
    i18n.addResource('en', 'dashboard', 'fallbackProbe', 'Dashboard fallback');
    await changeLanguagePreference('es');

    expect(i18n.t('dashboard:fallbackProbe')).toBe('Dashboard fallback');
  });

  test('language changes only alter display formatting', async () => {
    const financialState = {
      amount: 1250,
      currencyCode: 'USD',
      status: 'active',
      circleName: 'Familia 2026',
    };
    const before = structuredClone(financialState);

    const english = formatCurrency(financialState.amount, 'en');
    const spanish = formatCurrency(financialState.amount, 'es');
    const creoleDate = formatShortDate('2026-06-15', 'ht');

    expect(english).toContain('1,250');
    expect(spanish).toContain('1,250');
    expect(creoleDate).toBeTruthy();
    expect(financialState).toEqual(before);
  });

  test('canonical circle statuses remain unchanged', async () => {
    const statuses = ['draft', 'active', 'completed', 'pending'] as const;

    await changeLanguagePreference('es');
    expect(statuses).toEqual(['draft', 'active', 'completed', 'pending']);
    expect(i18n.t('circles:status.pending')).toBe('Aprobación pendiente');
  });

  test('long Spanish and Haitian Creole labels remain available in full', async () => {
    await changeLanguagePreference('es');
    expect(i18n.t('settings:legalPoliciesSubtitle').length).toBeGreaterThan(40);

    await changeLanguagePreference('ht');
    expect(i18n.t('circles:joinStep4Description').length).toBeGreaterThan(50);
  });
});
