import { readFileSync } from 'fs';
import path from 'path';

import contributionsEn from '../i18n/locales/en/contributions.json';
import contributionsEs from '../i18n/locales/es/contributions.json';
import contributionsHt from '../i18n/locales/ht/contributions.json';

const MOJIBAKE = /Ã‚|Ã¢|Â·|â€|Å“/;

const workspaceSource = readFileSync(
  path.join(__dirname, '..', '..', 'app', 'circle', 'workspace.tsx'),
  'utf8',
);

const localeFiles = {
  en: contributionsEn,
  es: contributionsEs,
  ht: contributionsHt,
} as const;

describe('workspace UTF-8 source encoding', () => {
  test('workspace.tsx does not contain mojibake sequences', () => {
    expect(workspaceSource).not.toMatch(MOJIBAKE);
  });

  test('member card uses localized hierarchy keys, not contact-organizer fallback', () => {
    expect(workspaceSource).toContain("contributionCopy(t, 'workspace.payOutsideTitle')");
    expect(workspaceSource).toContain(
      "contributionCopy(t, 'workspace.instructionsMissingTitle')",
    );
    expect(workspaceSource).toContain(
      "contributionCopy(t, 'workspace.circuSaveDoesNotSend')",
    );
    expect(workspaceSource).not.toContain(
      "t('contributions:workspace.instructionsFallback')",
    );
    expect(workspaceSource).not.toContain("{t('workspace.myContributions')}");
    expect(workspaceSource).not.toContain("{t('workspace.amountDue'");
  });

  test('member card uses compact rows instead of nested per-hand cards', () => {
    expect(workspaceSource).toContain('styles.memberHandInlineButton');
    expect(workspaceSource).toContain('styles.memberHandRowDivider');
    expect(workspaceSource).not.toContain('styles.memberHandPrimaryButton');
    expect(workspaceSource).not.toContain('onMarkAsSent(firstHand.handId)');
  });

  test('organizer payment-setup navigation is wired, not an unused import', () => {
    expect(workspaceSource).toContain('circlePaymentSetupHref');
    expect(workspaceSource).toContain('circlePaymentSetupHref(circleId)');
    expect(workspaceSource).toContain('set_contribution_instructions');
  });

  test('create-circle success offers payment-setup via the shared helper', () => {
    const createSetupSource = readFileSync(
      path.join(__dirname, '..', '..', 'app', 'create-circle', 'setup.tsx'),
      'utf8',
    );
    expect(createSetupSource).toContain('createCircleSuccessDestinations');
    expect(createSetupSource).toContain('contributionPaymentSetup');
    expect(createSetupSource).toContain('setContributionInstructions');
  });

  test('Mark as sent is the primary CTA and I sent it checkmark is gone', () => {
    expect(workspaceSource).toContain("contributionCopy(t, 'workspace.markAsSent')");
    expect(workspaceSource).toContain("t('contributions:workspace.markAsSent')");
    expect(workspaceSource).toContain('submitContribution(');
    expect(workspaceSource).toContain('buildManualContributionSubmitPayload');
    expect(workspaceSource).not.toContain(
      "{t('contributions:workspace.sentAction')} ✓",
    );
    expect(workspaceSource).not.toContain('I sent it ✓');
    expect(workspaceSource).not.toMatch(/createPaymentIntent|runStripeContributionPayment/);
    expect(workspaceSource).toContain("t('contributions:markAsSent.confirmTitle')");
    expect(workspaceSource).toContain("kind: 'mark_as_sent'");
  });

  test('single-hand Mark as sent confirms before submitting the exact hand', () => {
    expect(workspaceSource).toContain('function promptMarkContributionSent');
    expect(workspaceSource).toContain('function submitMarkContributionSent');
    expect(workspaceSource).toContain(
      'resolveMarkAsSentTarget(memberContributionCard, handId)',
    );
    expect(workspaceSource).toContain(
      "t('contributions:markAsSent.confirmTitle')",
    );
    expect(workspaceSource).toContain(
      "t('contributions:markAsSent.confirmBody'",
    );
    expect(workspaceSource).toContain("kind: 'mark_as_sent'");
    expect(workspaceSource).toContain('void submitMarkContributionSent(handId)');
    expect(workspaceSource.indexOf('function promptMarkContributionSent')).toBeLessThan(
      workspaceSource.indexOf('void submitMarkContributionSent(handId)'),
    );
    expect(workspaceSource).toContain(
      'onMarkAsSent(hand.handId)',
    );
  });

  test('multi-hand Mark as sent navigates the exact hand to contribution.tsx', () => {
    expect(workspaceSource).toContain('function handleMarkContributionSent');
    expect(workspaceSource).toContain('resolveMarkAsSentContributionHrefHandId');
    expect(workspaceSource).toContain(
      'router.push(contributionHref(circle.id, navigationHandId))',
    );
    expect(workspaceSource).toContain('onMarkAsSent(hand.handId)');
    expect(workspaceSource.indexOf('function handleMarkContributionSent')).toBeLessThan(
      workspaceSource.indexOf('promptMarkContributionSent(handId)'),
    );
    expect(workspaceSource).not.toContain(
      'submitContribution(token, circle.id, viewerMember',
    );
    expect(workspaceSource).not.toMatch(
      /submitContribution\(token, circle\.id, hand\.handId\)/,
    );
  });

  test('success refreshes authoritative state and failure does not fake reported', () => {
    expect(workspaceSource).toContain('await submitContribution(');
    expect(workspaceSource).toContain('target.handId');
    expect(workspaceSource).toContain('buildManualContributionSubmitPayload');
    expect(workspaceSource).toContain(
      'await Promise.all([onReload(), loadBackendSections()])',
    );
    expect(workspaceSource).toContain('isAlreadyReportedSubmissionError');
    expect(workspaceSource).toContain(
      "t('contributions:markAsSent.failedTitle')",
    );
    expect(workspaceSource).not.toContain("status: 'confirmed'");
    expect(workspaceSource).not.toContain("status: 'submitted'");
  });

  test('other visible workspace separators use a middle dot', () => {
    expect(workspaceSource).toContain('· {formatRelativeDate(dueDate, language)}');
    expect(workspaceSource).toContain(
      "` · ${circleNotStarted ? t('hands.planned') : t('hands.live')}`",
    );
    expect(workspaceSource).toContain(
      "` · ${t('payoutOrder:review.position', { position: orderIndex + 1 })}`",
    );
  });

  test.each(['en', 'es', 'ht'] as const)(
    '%s workspace-related locale files have no mojibake',
    (language) => {
      const dir = path.join(__dirname, '..', 'i18n', 'locales', language);
      for (const name of [
        'contributions.json',
        'circleWorkspace.json',
        'people.json',
        'payoutOrder.json',
        'rounds.json',
        'schedule.json',
      ]) {
        const source = readFileSync(path.join(dir, name), 'utf8');
        expect(source).not.toMatch(MOJIBAKE);
      }
    },
  );

  test.each(['en', 'es', 'ht'] as const)(
    '%s contribution workspace copy is valid UTF-8 and not mojibake',
    (language) => {
      const workspace = localeFiles[language].workspace;
      const serialized = JSON.stringify(workspace);
      expect(serialized).not.toMatch(MOJIBAKE);

      expect(workspace.dueBody).toContain('{{amount}}');
      expect(workspace.payoutTurn).toContain('{{position}}');
      expect(workspace.markAsSent.length).toBeGreaterThan(0);
      expect(workspace.markAsSent).not.toMatch(MOJIBAKE);
      expect(workspace.markAsSent).not.toContain('✓');
      expect(workspace.dueBody).not.toMatch(MOJIBAKE);
      expect(workspace.payoutTurn).not.toMatch(MOJIBAKE);
    },
  );

  test('composed English due + payout line has no corrupted separator', () => {
    const due = contributionsEn.workspace.dueBody.replace(
      '{{amount}}',
      '$1,000',
    );
    const turn = contributionsEn.workspace.payoutTurn.replace(
      '{{position}}',
      '5th',
    );
    const composed = `${due} · ${turn}`;
    expect(composed).toBe(
      'Your $1,000 contribution is due this round. · Your payout turn is 5th.',
    );
    expect(composed).not.toMatch(MOJIBAKE);
    expect(contributionsEn.workspace.markAsSent).toBe('Mark as sent');
    expect(contributionsEn.workspace.markAsSent).not.toContain('✓');
    expect(contributionsEn.markAsSent.confirmTitle).toBe('Mark payment as sent?');
    expect(contributionsEn.markAsSent.confirmBody).toContain(
      'already sent {{amount}} outside CircuSave',
    );
    expect(contributionsEn.markAsSent.confirmBody).toContain(
      'does not transfer money',
    );
    expect(contributionsEn.markAsSent.confirmBody).toContain(
      'organizer must verify receipt',
    );
    expect(contributionsEn.markAsSent.failedTitle).toBe('Unable to report payment');
    expect(contributionsEn.alerts.cancel).toBe('Cancel');
    expect(contributionsEs.markAsSent.confirmTitle.length).toBeGreaterThan(0);
    expect(contributionsHt.markAsSent.confirmTitle.length).toBeGreaterThan(0);
    expect(contributionsEs.markAsSent.failedTitle.length).toBeGreaterThan(0);
    expect(contributionsHt.markAsSent.failedTitle.length).toBeGreaterThan(0);
  });
});
