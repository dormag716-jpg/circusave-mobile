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
  capacityExceededMessage,
  openCircleLimitMessage,
  buildRosterCapacity,
  buildOpenCircleCapacity,
} from '../circleCapacity';
import { validatePlanCapacity } from '../createCircleWizard';
import { changeLanguagePreference, i18n, initializeI18n } from '../i18n';
import type { SupportedLanguage } from '../i18n/types';
import { humanizeStatus } from '../statementPresentation';
import { runStripeContributionPayment } from '../stripeContributionPayment';

const LANGUAGES: SupportedLanguage[] = ['en', 'es', 'ht'];

function source(relativePath: string) {
  return readFileSync(path.join(__dirname, relativePath), 'utf8');
}

describe('narrow localization correction', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
  });

  test('ES and HT circle removal copy does not claim permanent deletion', async () => {
    const expected = {
      en: 'This removes Family Circle from Active Circles.',
      es: 'Esto quita “Family Circle” de Círculos activos.',
      ht: 'Sa retire “Family Circle” nan Gwoup aktif.',
    } as const;

    for (const language of LANGUAGES) {
      await changeLanguagePreference(language);
      const message = i18n.t('circles:deleteMessage', {
        circleName: 'Family Circle',
      });
      expect(message).toBe(expected[language]);
      expect(message.toLowerCase()).not.toMatch(/permanent|permanentemente|nèt/);
      expect(message.toLowerCase()).not.toMatch(/eliminará|efase/);
    }
  });

  test('workspace phrases resolve in EN, ES, and HT', async () => {
    const expected = {
      en: {
        unknownMember: 'Unknown member',
        confirmedOfTotal: '3 of 8 confirmed',
        unavailable: 'Unavailable',
        roundStatusUnavailable: 'Round status unavailable',
        collectingContributions: 'Collecting contributions',
        biweekly: 'Bi-weekly',
      },
      es: {
        unknownMember: 'Miembro desconocido',
        confirmedOfTotal: '3 de 8 confirmados',
        unavailable: 'No disponible',
        roundStatusUnavailable: 'Estado de la ronda no disponible',
        collectingContributions: 'Recaudando aportes',
        biweekly: 'Cada dos semanas',
      },
      ht: {
        unknownMember: 'Manm enkoni',
        confirmedOfTotal: '3 sou 8 konfime',
        unavailable: 'Pa disponib',
        roundStatusUnavailable: 'Estati wonn lan pa disponib',
        collectingContributions: 'N ap kolekte kontribisyon',
        biweekly: 'Chak de semèn',
      },
    } as const;

    const workspace = source('../../app/circle/workspace.tsx');
    expect(workspace).toContain("workspaceCopy('unknownMember'");
    expect(workspace).toContain("workspaceCopy('confirmedOfTotal'");
    expect(workspace).toContain("i18n.t('common:unavailable')");
    expect(workspace).toContain("workspaceCopy('roundStatusUnavailable'");
    expect(workspace).toContain("workspaceCopy('collectingContributions'");
    expect(workspace).toContain("workspaceCopy('frequency.biweekly', 'Bi-weekly')");

    for (const language of LANGUAGES) {
      await changeLanguagePreference(language);
      const copy = expected[language];
      expect(i18n.t('circleWorkspace:unknownMember')).toBe(copy.unknownMember);
      expect(
        i18n.t('circleWorkspace:confirmedOfTotal', { confirmed: 3, total: 8 }),
      ).toBe(copy.confirmedOfTotal);
      expect(i18n.t('common:unavailable')).toBe(copy.unavailable);
      expect(i18n.t('circleWorkspace:roundStatusUnavailable')).toBe(
        copy.roundStatusUnavailable,
      );
      expect(i18n.t('circleWorkspace:collectingContributions')).toBe(
        copy.collectingContributions,
      );
      expect(i18n.t('circleWorkspace:frequency.biweekly')).toBe(copy.biweekly);
    }
  });

  test('RecordsStatementCenter humanizeStatus localizes EN/ES/HT', async () => {
    const expected = {
      en: {
        confirmed: 'Contribution confirmed',
        due: 'Payment due',
        late: 'Submitted after due time',
        scheduled: 'Scheduled',
      },
      es: {
        confirmed: 'Contribución confirmada',
        due: 'Pago pendiente',
        late: 'Enviada después de la fecha límite',
        scheduled: 'Programado',
      },
      ht: {
        confirmed: 'Kontribisyon konfime',
        due: 'Peman dwe',
        late: 'Soumèt apre dat limit la',
        scheduled: 'Pwograme',
      },
    } as const;

    const records = source('../../components/records/RecordsStatementCenter.tsx');
    expect(records).toContain('humanizeStatus(snapshot.member.membershipStatus, t)');
    expect(records).toContain('humanizeStatus(r.status, t)');
    expect(records).toContain('humanizeStatus(payout.status, t)');

    expect(humanizeStatus('confirmed')).toBe('Contribution confirmed');

    for (const language of LANGUAGES) {
      await changeLanguagePreference(language);
      const t = i18n.getFixedT(language, 'ledger');
      const copy = expected[language];
      expect(humanizeStatus('confirmed', t)).toBe(copy.confirmed);
      expect(humanizeStatus('due', t)).toBe(copy.due);
      expect(humanizeStatus('late', t)).toBe(copy.late);
      expect(humanizeStatus('scheduled', t)).toBe(copy.scheduled);
    }
  });

  test('remaining paid-product labels use Organizer Pro and keep isPremium identifiers', () => {
    const capacity = source('../circleCapacity.ts');
    const wizard = source('../createCircleWizard.ts');
    const conversations = source('../useConversations.ts');
    expect(capacity).toMatch(/isPremiumPlan/);
    expect(wizard).toMatch(/const isPremium =/);
    expect(capacity).not.toMatch(/Upgrade to Premium/);
    expect(wizard).not.toMatch(/Upgrade to Premium/);
    expect(capacity).not.toMatch(/Premium circles/);
    expect(wizard).not.toMatch(/Premium circles/);
    expect(conversations).not.toMatch(/Upgrade to Premium/);

    const freeCapacity = buildRosterCapacity({
      organizerRoleOrTier: 'free',
      members: Array.from({ length: 20 }, () => ({ isParticipating: true })),
    });
    expect(capacityExceededMessage(freeCapacity)).toContain('Organizer Pro');
    expect(capacityExceededMessage(freeCapacity)).not.toMatch(/Premium/);

    const premiumCapacity = buildRosterCapacity({
      organizerRoleOrTier: 'premium',
      members: Array.from({ length: 50 }, () => ({ isParticipating: true })),
    });
    expect(capacityExceededMessage(premiumCapacity)).toContain('Organizer Pro');
    expect(capacityExceededMessage(premiumCapacity)).not.toMatch(/Premium/);

    const openFree = buildOpenCircleCapacity({
      organizerRoleOrTier: 'free',
      circles: [{ id: 'c1', status: 'active', userRole: 'organizer' }],
    });
    expect(openCircleLimitMessage(openFree)).toContain('Organizer Pro');
    expect(openCircleLimitMessage(openFree)).not.toMatch(/Premium/);

    const overflowMembers = Array.from({ length: 20 }, (_, index) => ({
      draftId: `md_${index}`,
      email: '',
      firstName: 'A',
      lastName: `${index}`,
      phone: `555${index}`,
      handNumber: 1,
    }));
    const wizardMessage = validatePlanCapacity(overflowMembers, true, 'free');
    expect(wizardMessage).toContain('Organizer Pro');
    expect(wizardMessage).not.toMatch(/Premium/);
  });

  test('chat and contribution-payment fallback errors localize in EN/ES/HT', async () => {
    const conversations = source('../useConversations.ts');
    expect(conversations).toContain("t('circleWorkspace:chat.loadError'");
    expect(conversations).toContain("t('circleWorkspace:chat.loadMessagesError'");
    expect(conversations).toContain("t('circleWorkspace:chat.createError'");
    expect(conversations).toContain("t('circleWorkspace:chat.sendError'");
    expect(conversations).toContain("t('circleWorkspace:chat.deleteError'");

    const expectedChat = {
      en: {
        loadError: 'Unable to load chat.',
        sendError: 'Unable to send message.',
      },
      es: {
        loadError: 'No se pudo cargar el chat.',
        sendError: 'No se pudo enviar el mensaje.',
      },
      ht: {
        loadError: 'Nou pa t kapab chaje konvèsasyon an.',
        sendError: 'Nou pa t kapab voye mesaj la.',
      },
    } as const;

    const expectedPayment = {
      en: {
        identifyHand: 'Unable to identify your hand.',
        handMismatch:
          'Payment was not started for the selected hand. Please try again.',
        stripePayment: 'Unable to complete the payment. Please try again.',
      },
      es: {
        identifyHand: 'No se pudo identificar tu mano.',
        handMismatch:
          'El pago no se inició para la mano seleccionada. Inténtalo de nuevo.',
        stripePayment: 'No se pudo completar el pago con Stripe.',
      },
      ht: {
        identifyHand: 'Nou pa t kapab idantifye men ou.',
        handMismatch:
          'Peman an pa t kòmanse pou men ou chwazi a. Tanpri eseye ankò.',
        stripePayment: 'Nou pa kapab fini peman Stripe la.',
      },
    } as const;

    const deps = {
      createPaymentIntent: jest.fn(),
      initPaymentSheet: jest.fn(),
      presentPaymentSheet: jest.fn(),
      loadHandStatus: jest.fn(),
    };

    for (const language of LANGUAGES) {
      await changeLanguagePreference(language);
      expect(i18n.t('circleWorkspace:chat.loadError')).toBe(
        expectedChat[language].loadError,
      );
      expect(i18n.t('circleWorkspace:chat.sendError')).toBe(
        expectedChat[language].sendError,
      );

      const missingHand = await runStripeContributionPayment(
        {
          token: 'tok',
          circleId: 'circle-1',
          roundNumber: 1,
          handId: '',
          contributionPaymentsEnabled: true,
        },
        deps,
      );
      expect(missingHand).toEqual({
        kind: 'error',
        message: expectedPayment[language].identifyHand,
        handId: '',
      });

      const mismatch = await runStripeContributionPayment(
        {
          token: 'tok',
          circleId: 'circle-1',
          roundNumber: 1,
          handId: 'hand-selected',
          contributionPaymentsEnabled: true,
        },
        {
          createPaymentIntent: async () => ({
            clientSecret: 'cs_test',
            paymentIntentId: 'pi_test',
            handId: 'hand-other',
          }),
          initPaymentSheet: jest.fn(),
          presentPaymentSheet: jest.fn(),
          loadHandStatus: jest.fn(),
        },
      );
      expect(mismatch).toEqual({
        kind: 'error',
        message: expectedPayment[language].handMismatch,
        handId: 'hand-selected',
      });

      expect(i18n.t('financialErrors:stripePayment')).toBe(
        expectedPayment[language].stripePayment,
      );
    }
  });

  test('legal chrome notice is localized while English bodies remain controlling', async () => {
    const chrome = source('../../components/LegalDocumentScreen.tsx');
    const legal = source('../legal.ts');
    expect(chrome).toContain("t('englishNotice')");
    expect(legal).not.toContain('englishNotice');
    expect(legal).toMatch(/these Terms of Service/);

    const expected = {
      en: 'This legal document is currently provided in English. The English text is the controlling version.',
      es: 'Este documento legal se ofrece actualmente en inglés. El texto en inglés es la versión que rige.',
      ht: 'Dokiman legal sa a disponib an anglè kounye a. Tèks angle a se vèsyon ki fè otorite.',
    } as const;

    for (const language of LANGUAGES) {
      await changeLanguagePreference(language);
      expect(i18n.t('legal:englishNotice')).toBe(expected[language]);
    }
  });
});
