import { readFileSync } from 'fs';
import path from 'path';

function readSource(...segments: string[]) {
  return readFileSync(path.join(__dirname, '..', '..', ...segments), 'utf8');
}

describe('contribution payment capability wiring', () => {
  test('direct contribution navigation cannot enable in-app contribution payment', () => {
    const source = readSource('app', 'payment', 'contribution.tsx');
    expect(source).toContain('buildContributionPaymentRails');
    expect(source).toContain('buildManualContributionSubmitPayload');
    expect(source).not.toContain('createPaymentIntent');
    expect(source).not.toContain('runStripeContributionPayment');
    expect(source).not.toContain('handleStripePayment');
    expect(source).not.toContain('@stripe/stripe-react-native');
    expect(source).not.toContain("contributionCopy(t, 'rails.payInTitle')");
    expect(source).toContain("contributionCopy(t, 'rails.payOutsideTitle')");
    expect(source).toContain("contributionCopy(t, 'workspace.markAsSent')");
  });

  test('workspace never shows an in-app contribution payment entry', () => {
    const source = readSource('app', 'circle', 'workspace.tsx');
    expect(source).toContain('onMarkAsSent={onMarkContributionSent}');
    expect(source).not.toContain('onPayInApp');
    expect(source).not.toContain('ContributionCapabilityGate');
    expect(source).not.toContain("contributionCopy(t, 'workspace.payInCircusave')");
    expect(source).not.toContain('createPaymentIntent');
    expect(source).not.toContain('runStripeContributionPayment');
  });

  test('settings and automated-payment screens do not call contribution Stripe APIs', () => {
    const settings = readSource('app', '(tabs)', 'settings.tsx');
    const automated = readSource('app', 'automated-payments.tsx');
    expect(settings).toContain(
      '!session?.session.token || !contributionPaymentsEnabled',
    );
    expect(settings).toContain('{contributionPaymentsEnabled ? (');
    expect(automated).toContain(
      "t('contributions:rails.contributionPaymentsDisabledBody')",
    );
    expect(automated).toContain("t('common:unsupported')");
    expect(automated).not.toContain('isStripeSupported');
    expect(automated).not.toContain('@stripe/stripe-react-native');
    expect(automated).not.toContain('createFinancialConnectionsSession');
    expect(automated).not.toContain('getLinkedAccounts');
  });
});
