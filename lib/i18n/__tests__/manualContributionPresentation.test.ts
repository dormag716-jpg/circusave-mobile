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

import {
  contributionStatusLabel,
  presentManualContribution,
} from '../financial-presentation';
import { changeLanguagePreference, i18n, initializeI18n } from '../index';

describe('manual contribution presentation', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
    await changeLanguagePreference('en');
  });

  test('maps due to Payment due and reportable, not confirmed', () => {
    const view = presentManualContribution('due', i18n.t);
    expect(view.primaryLabel).toBe('Payment due');
    expect(view.secondaryLabel).toBeNull();
    expect(view.semanticState).toBe('due');
    expect(view.canReportPayment).toBe(true);
    expect(view.isConfirmed).toBe(false);
    expect(view.awaitingOrganizer).toBe(false);
    expect(view.primaryLabel.toLowerCase()).not.toBe('due');
  });

  test('maps missed to Overdue', () => {
    const view = presentManualContribution('missed', i18n.t);
    expect(view.primaryLabel).toBe('Overdue');
    expect(view.semanticState).toBe('overdue');
    expect(view.isOverdue).toBe(true);
    expect(view.canReportPayment).toBe(true);
    expect(view.isConfirmed).toBe(false);
    expect(view.primaryLabel.toLowerCase()).not.toBe('missed');
  });

  test('maps submitted to Payment reported, waiting, not confirmed', () => {
    const view = presentManualContribution('submitted', i18n.t);
    expect(view.primaryLabel).toBe('Payment reported');
    expect(view.secondaryLabel).toBe('Waiting for organizer');
    expect(view.semanticState).toBe('reported');
    expect(view.awaitingOrganizer).toBe(true);
    expect(view.isConfirmed).toBe(false);
    expect(view.canReportPayment).toBe(false);
    expect(view.primaryLabel.toLowerCase()).not.toContain('submitted');
    expect(view.primaryLabel).not.toMatch(/pending organizer confirmation/i);
    expect(contributionStatusLabel('submitted', i18n.t)).toBe('Payment reported');
  });

  test('maps late to Payment reported late and still waiting', () => {
    const view = presentManualContribution('late', i18n.t);
    expect(view.primaryLabel).toBe('Payment reported late');
    expect(view.secondaryLabel).toBe('Waiting for organizer');
    expect(view.semanticState).toBe('reported_late');
    expect(view.awaitingOrganizer).toBe(true);
    expect(view.isLateReport).toBe(true);
    expect(view.isConfirmed).toBe(false);
    expect(view.primaryLabel.toLowerCase()).not.toBe('late');
  });

  test('maps rejected to Payment needs attention and reportable again', () => {
    const view = presentManualContribution('rejected', i18n.t);
    expect(view.primaryLabel).toBe('Payment needs attention');
    expect(view.semanticState).toBe('needs_attention');
    expect(view.needsAttention).toBe(true);
    expect(view.canReportPayment).toBe(true);
    expect(view.isConfirmed).toBe(false);
    expect(view.primaryLabel.toLowerCase()).not.toBe('rejected');
  });

  test('confirmed is the only normal manual state represented as confirmed', () => {
    const confirmed = presentManualContribution('confirmed', i18n.t);
    expect(confirmed.primaryLabel).toBe('Payment confirmed');
    expect(confirmed.isConfirmed).toBe(true);
    expect(confirmed.awaitingOrganizer).toBe(false);

    for (const status of ['due', 'missed', 'submitted', 'late', 'rejected'] as const) {
      expect(presentManualContribution(status, i18n.t).isConfirmed).toBe(false);
    }
  });

  test('organizer audience shortens reported labels without calling them confirmed', () => {
    const reported = presentManualContribution('submitted', i18n.t, {
      audience: 'organizer',
    });
    const late = presentManualContribution('late', i18n.t, {
      audience: 'organizer',
    });
    expect(reported.primaryLabel).toBe('Reported');
    expect(late.primaryLabel).toBe('Reported late');
    expect(reported.awaitingOrganizer).toBe(true);
    expect(reported.isConfirmed).toBe(false);
  });

  test('does not treat Stripe lifecycle statuses as manual reported or confirmed', () => {
    for (const status of [
      'disputed',
      'refunded',
      'chargeback',
      'partially_refunded',
    ] as const) {
      const view = presentManualContribution(status, i18n.t);
      expect(view.semanticState).toBe('unknown');
      expect(view.isConfirmed).toBe(false);
      expect(view.awaitingOrganizer).toBe(false);
      expect(view.primaryLabel).not.toBe('Payment reported');
      expect(view.primaryLabel).not.toBe('Payment confirmed');
      expect(view.primaryLabel.toLowerCase()).not.toBe(status);
    }
  });

  test.each(['es', 'ht'] as const)(
    'localizes manual presentation in %s without raw status names',
    async (language) => {
      await changeLanguagePreference(language);
      for (const status of [
        'due',
        'missed',
        'submitted',
        'late',
        'rejected',
        'confirmed',
      ] as const) {
        const label = contributionStatusLabel(status, i18n.t);
        expect(label.toLowerCase()).not.toBe(status);
        expect(label.length).toBeGreaterThan(0);
      }
      expect(presentManualContribution('submitted', i18n.t).isConfirmed).toBe(
        false,
      );
      await changeLanguagePreference('en');
    },
  );
});
