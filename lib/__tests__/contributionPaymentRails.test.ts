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

describe('buildContributionPaymentRails', () => {
  test('shows both rails when Stripe is supported and keeps instructions on manual only', () => {
    const rails = buildContributionPaymentRails({
      paymentInstructions: 'Zelle: organizer@email.com',
      stripeSupported: true,
    });
    expect(rails.showStripeRail).toBe(true);
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
    });
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

  test('both rails target the same preselected hand', () => {
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

describe('contribution.tsx Step 5 screen split', () => {
  test('splits Pay in CircuSave from Pay outside CircuSave and keeps Stripe orchestration', () => {
    expect(contributionSource).toContain("contributionCopy(t, 'rails.payInTitle')");
    expect(contributionSource).toContain("contributionCopy(t, 'rails.payOutsideTitle')");
    expect(contributionSource).toContain("contributionCopy(t, 'workspace.markAsSent')");
    expect(contributionSource).toContain('buildContributionPaymentRails');
    expect(contributionSource).toContain('buildManualContributionSubmitPayload');
    expect(contributionSource).toContain('selectedDestinationIndex');
    expect(contributionSource).toContain('handleStripePayment()');
    expect(contributionSource).toContain('runStripeContributionPayment');
    expect(contributionSource).toContain('createPaymentIntent');
    expect(contributionSource).toContain('requestedHandId ?? null');
    expect(contributionSource).toContain('setSelectedHandId(requestedHandId ?? null)');
    expect(contributionSource).not.toContain("t('contributions:confirmManual')");
    expect(contributionSource).not.toContain("t('contributions:payWithStripe')");
  });

  test('payment instructions render only in the manual rail', () => {
    const stripeStart = contributionSource.indexOf("contributionCopy(t, 'rails.payInTitle')");
    const manualStart = contributionSource.indexOf(
      "contributionCopy(t, 'rails.payOutsideTitle')",
    );
    expect(stripeStart).toBeGreaterThan(-1);
    expect(manualStart).toBeGreaterThan(stripeStart);
    const stripeBlock = contributionSource.slice(stripeStart, manualStart);
    const manualBlock = contributionSource.slice(manualStart);
    expect(stripeBlock).not.toContain('rails.hasInstructions');
    expect(stripeBlock).not.toContain('rails.instructions');
    expect(stripeBlock).not.toContain('PaymentDestinationList');
    expect(manualBlock).toContain('rails.hasInstructions');
    expect(manualBlock).toContain('rails.instructions');
    expect(manualBlock).toContain('rails.destinations');
    expect(manualBlock).toContain('PaymentDestinationList');
    expect(manualBlock).toContain(
      "contributionCopy(t, 'workspace.instructionsMissingTitle')",
    );
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

  test('EN / ES / HT distinguish Pay in CircuSave from Pay outside CircuSave', () => {
    expect(contributionsEn.rails.payInTitle).toBe('Pay in CircuSave');
    expect(contributionsEn.rails.payOutsideTitle).toBe('Pay outside CircuSave');
    expect(contributionsEn.rails.payInBody).toContain('payment provider');
    expect(contributionsEn.rails.payOutsideBody).toContain('organizer');
    expect(contributionsEn.workspace.markAsSent).toBe('Mark as sent');
    expect(contributionsEs.rails.payInTitle.length).toBeGreaterThan(0);
    expect(contributionsHt.rails.payInTitle.length).toBeGreaterThan(0);
    expect(contributionsEs.rails.payOutsideTitle).not.toBe(
      contributionsEs.rails.payInTitle,
    );
    expect(contributionsHt.rails.payOutsideTitle).not.toBe(
      contributionsHt.rails.payInTitle,
    );
  });

  test('Stripe PaymentSheet is not started by Mark as sent', () => {
    const promptStart = contributionSource.indexOf(
      'function promptMarkContributionSent',
    );
    const promptEnd = contributionSource.indexOf(
      'async function handleStripePayment',
    );
    const promptBlock = contributionSource.slice(promptStart, promptEnd);
    expect(promptBlock).not.toContain('handleStripePayment');
    expect(promptBlock).not.toContain('createPaymentIntent');
    expect(promptBlock).not.toContain('initPaymentSheet');
    expect(promptBlock).toContain('handleSubmitContribution');
  });
});
