import { readFileSync } from 'fs';
import path from 'path';

function readSource(...segments: string[]) {
  return readFileSync(path.join(__dirname, '..', '..', ...segments), 'utf8');
}

describe('contribution payment capability wiring', () => {
  test('direct contribution navigation cannot bypass the capability guard', () => {
    const source = readSource('app', 'payment', 'contribution.tsx');
    expect(source).toContain('useContributionPaymentCapability()');
    expect(source).toContain('if (!contributionPaymentsEnabled)');
    expect(source).toContain('preflightContributionPayments()');
    expect(source).toContain('revokeContributionPayments()');
    expect(source).toContain('rails.showStripeRail');
  });

  test('workspace hides the Stripe contribution entry action when disabled', () => {
    const source = readSource('app', 'circle', 'workspace.tsx');
    expect(source).toContain(
      'const contributionPaymentsEnabled = hasCapability(',
    );
    expect(source).toContain("'contributionPaymentsEnabled'");
    const payAction = source.indexOf('onPress={() => onPayInApp(hand.handId)}');
    const capabilityGuard = source.lastIndexOf(
      '<ContributionCapabilityGate',
      payAction,
    );
    expect(payAction).toBeGreaterThan(-1);
    expect(capabilityGuard).toBeGreaterThan(-1);
    expect(source.slice(capabilityGuard, payAction)).toContain(
      'contributionPaymentsEnabled',
    );
    expect(source).toContain('onMarkAsSent={onMarkContributionSent}');
  });

  test('settings and automated-payment screens do not call contribution Stripe APIs when disabled', () => {
    const settings = readSource('app', '(tabs)', 'settings.tsx');
    const automated = readSource('app', 'automated-payments.tsx');
    expect(settings).toContain(
      '!session?.session.token || !contributionPaymentsEnabled',
    );
    expect(settings).toContain('{contributionPaymentsEnabled ? (');
    expect(automated).toContain(
      'contributionPaymentsEnabled && isStripeSupported',
    );
    expect(automated).toContain(
      "t('contributions:rails.contributionPaymentsDisabledBody')",
    );
  });
});
