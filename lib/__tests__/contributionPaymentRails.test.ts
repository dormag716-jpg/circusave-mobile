import { readFileSync } from 'fs';
import path from 'path';

import contributionsEn from '../i18n/locales/en/contributions.json';
import contributionsEs from '../i18n/locales/es/contributions.json';
import contributionsHt from '../i18n/locales/ht/contributions.json';
import {
  buildContributionPaymentRails,
  contributionRailsUseSameHand,
} from '../contributionPaymentRails';

const contributionSource = readFileSync(
  path.join(__dirname, '..', '..', 'app', 'payment', 'contribution.tsx'),
  'utf8',
);
const packageSource = readFileSync(
  path.join(__dirname, '..', '..', 'package.json'),
  'utf8',
);
const layoutSource = readFileSync(
  path.join(__dirname, '..', '..', 'app', '_layout.tsx'),
  'utf8',
);

describe('buildContributionPaymentRails', () => {
  test('never shows an in-app contribution payment rail, even when flags are true', () => {
    const rails = buildContributionPaymentRails({
      paymentInstructions: 'Zelle: organizer@email.com',
      stripeSupported: true,
      contributionPaymentsEnabled: true,
    });
    expect(rails.showStripeRail).toBe(false);
    expect(rails.showManualRail).toBe(true);
    expect(rails.hasInstructions).toBe(true);
    expect(rails.instructions).toBe('Zelle: organizer@email.com');
    expect(rails.destinations).toEqual([]);
  });

  test('manual rail shows structured destinations when the circle has them', () => {
    const rails = buildContributionPaymentRails({
      paymentInstructions: 'Legacy',
      paymentDestinations: [{ method: 'venmo', destination: '@circle' }],
      stripeSupported: true,
      contributionPaymentsEnabled: true,
    });
    expect(rails.showStripeRail).toBe(false);
    expect(rails.hasInstructions).toBe(true);
    expect(rails.destinations).toEqual([{ method: 'venmo', destination: '@circle' }]);
    expect(rails.instructions).toBe('Venmo: @circle');
  });

  test('missing instructions still show the manual rail and do not invent destination', () => {
    const rails = buildContributionPaymentRails({
      paymentInstructions: '   ',
      stripeSupported: false,
    });
    expect(rails.showStripeRail).toBe(false);
    expect(rails.showManualRail).toBe(true);
    expect(rails.hasInstructions).toBe(false);
    expect(rails.instructions).toBeNull();
  });

  test('missing or false capability still keeps only manual recording', () => {
    const missing = buildContributionPaymentRails({
      paymentInstructions: 'Cash to organizer',
      stripeSupported: true,
    });
    const disabled = buildContributionPaymentRails({
      paymentInstructions: 'Cash to organizer',
      stripeSupported: true,
      contributionPaymentsEnabled: false,
    });
    expect(missing.showStripeRail).toBe(false);
    expect(disabled.showStripeRail).toBe(false);
    expect(missing.showManualRail).toBe(true);
    expect(disabled.showManualRail).toBe(true);
  });

  test('selected-hand helper still requires an exact match', () => {
    expect(
      contributionRailsUseSameHand({
        selectedHandId: 'hand-2',
        stripeHandId: 'hand-2',
        manualHandId: 'hand-2',
      }),
    ).toBe(true);
    expect(
      contributionRailsUseSameHand({
        selectedHandId: 'hand-2',
        stripeHandId: 'hand-2',
        manualHandId: 'hand-1',
      }),
    ).toBe(false);
  });
});

describe('contribution.tsx external/manual contribution screen', () => {
  test('keeps manual recording and does not restore in-app contribution payment', () => {
    expect(contributionSource).toContain("contributionCopy(t, 'rails.payOutsideTitle')");
    expect(contributionSource).toContain("contributionCopy(t, 'workspace.markAsSent')");
    expect(contributionSource).toContain('buildContributionPaymentRails');
    expect(contributionSource).toContain('buildManualContributionSubmitPayload');
    expect(contributionSource).toContain('selectedDestinationIndex');
    expect(contributionSource).toContain('requestedHandId ?? null');
    expect(contributionSource).toContain('setSelectedHandId(requestedHandId ?? null)');
    expect(contributionSource).not.toContain('handleStripePayment');
    expect(contributionSource).not.toContain('runStripeContributionPayment');
    expect(contributionSource).not.toContain('createPaymentIntent');
    expect(contributionSource).not.toContain('@stripe/stripe-react-native');
    expect(contributionSource).not.toContain("contributionCopy(t, 'rails.payInTitle')");
    expect(contributionSource).not.toContain("contributionCopy(t, 'rails.payInAction')");
    expect(contributionSource).not.toContain("t('contributions:confirmManual')");
    expect(contributionSource).not.toContain("t('contributions:payWithStripe')");
    expect(packageSource).not.toContain('@stripe/stripe-react-native');
    expect(layoutSource).not.toContain('StripeProvider');
    expect(layoutSource).not.toContain('@stripe/stripe-react-native');
  });

  test('payment instructions render only in the manual rail', () => {
    const manualStart = contributionSource.indexOf(
      "contributionCopy(t, 'rails.payOutsideTitle')",
    );
    expect(manualStart).toBeGreaterThan(-1);
    const manualBlock = contributionSource.slice(manualStart);
    expect(manualBlock).toContain('rails.hasInstructions');
    expect(manualBlock).toContain('rails.instructions');
    expect(manualBlock).toContain('rails.destinations');
    expect(manualBlock).toContain('PaymentDestinationList');
    expect(manualBlock).toContain(
      "contributionCopy(t, 'workspace.instructionsMissingTitle')",
    );
    expect(contributionSource).not.toContain("contributionCopy(t, 'rails.payInTitle')");
  });

  test('manual Mark as sent confirms before submit and is not gated on instructions', () => {
    expect(contributionSource).toContain('function promptMarkContributionSent');
    expect(contributionSource).toContain(
      "contributionCopy(t, 'markAsSent.confirmTitle')",
    );
    expect(contributionSource).toContain(
      'void handleSubmitContribution()',
    );
    expect(contributionSource).toContain('confirmMarkAsSentVisible');
    expect(contributionSource).toContain('DecisionSheet');
    const payDisabledLine = contributionSource
      .split('\n')
      .find((line) => line.includes('const payDisabled'));
    expect(payDisabledLine).toBeDefined();
    expect(payDisabledLine).not.toContain('hasInstructions');
    expect(payDisabledLine).not.toContain('paymentInstructions');
  });

  test('Mark as sent meaning toggle is local UI and does not start payment', () => {
    const meaningStart = contributionSource.indexOf('style={styles.meaningHeader}');
    const meaningEnd = contributionSource.indexOf('</Pressable>', meaningStart);
    expect(meaningStart).toBeGreaterThan(-1);
    expect(meaningEnd).toBeGreaterThan(meaningStart);
    const meaningBlock = contributionSource.slice(meaningStart, meaningEnd);
    expect(meaningBlock).toContain('setMeaningExpanded((open) => !open)');
    expect(meaningBlock).not.toContain('loadContribution');
    expect(meaningBlock).not.toContain('createPaymentIntent');
    expect(meaningBlock).not.toContain('handleStripePayment');
    expect(meaningBlock).not.toContain('handleSubmitContribution');
  });

  test('EN / ES / HT keep external/manual contribution copy', () => {
    expect(contributionsEn.rails.payOutsideTitle).toBe('Pay outside CircuSave');
    expect(contributionsEn.rails.payOutsideBody).toContain('organizer');
    expect(contributionsEn.workspace.markAsSent).toBe('Mark as sent');
    expect(contributionsEs.rails.payOutsideTitle.length).toBeGreaterThan(0);
    expect(contributionsHt.rails.payOutsideTitle.length).toBeGreaterThan(0);
    expect(contributionsEn.rails.contributionPaymentsDisabledBody).toBe(
      'Pay the organizer outside CircuSave, then record your payment for organizer confirmation.',
    );
    expect(
      contributionsEs.rails.contributionPaymentsDisabledBody.length,
    ).toBeGreaterThan(0);
    expect(
      contributionsHt.rails.contributionPaymentsDisabledBody.length,
    ).toBeGreaterThan(0);
  });

  test('Mark as sent does not start an in-app contribution payment', () => {
    const promptStart = contributionSource.indexOf(
      'function promptMarkContributionSent',
    );
    const promptEnd = contributionSource.indexOf(
      'async function handleSubmitContribution',
    );
    const promptBlock = contributionSource.slice(promptStart, promptEnd);
    expect(promptBlock).not.toContain('handleStripePayment');
    expect(promptBlock).not.toContain('createPaymentIntent');
    expect(promptBlock).not.toContain('initPaymentSheet');
    expect(promptBlock).toContain('setConfirmMarkAsSentVisible(true)');
    expect(contributionSource).toContain('void handleSubmitContribution()');
  });
});
