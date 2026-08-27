import { readFileSync } from 'fs';
import path from 'path';

describe('localization accessibility contracts', () => {
  test('inactive tab tint uses muted contrast token', () => {
    const source = readFileSync(
      path.join(__dirname, '../../app/(tabs)/_layout.tsx'),
      'utf8',
    );
    expect(source).toContain('tabBarInactiveTintColor: colors.muted');
    expect(source).not.toContain('tabBarInactiveTintColor: colors.subtle');
  });

  test('support accordions expose accessibilityState.expanded', () => {
    const source = readFileSync(
      path.join(__dirname, '../../app/support.tsx'),
      'utf8',
    );
    expect(source).toContain('accessibilityState={{ expanded: isExpanded }}');
  });

  test('settings subtitles are not clipped to one line', () => {
    const source = readFileSync(
      path.join(__dirname, '../../app/(tabs)/settings.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/menuSubtitle[^;]*numberOfLines=\{1\}/);
    expect(source).toContain('<Text style={styles.menuSubtitle}>{subtitle}</Text>');
  });

  test('assistant upgrade copy and composer-adjacent chips meet readable size', () => {
    const source = readFileSync(
      path.join(__dirname, '../../app/circle/assistant.tsx'),
      'utf8',
    );
    expect(source).toContain('upgradeButtonText: { color: colors.primaryDark, fontWeight: \'900\', fontSize: 12 }');
    expect(source).toContain('minHeight: 44');
    expect(source).not.toContain('upgradeButtonText: { color: colors.primaryDark, fontWeight: \'900\', fontSize: 10 }');
  });

  test('payout-handle surfaces include the external-payment disclosure', () => {
    const paymentPrefs = readFileSync(
      path.join(__dirname, '../../app/payment-preferences.tsx'),
      'utf8',
    );
    const paymentSetup = readFileSync(
      path.join(__dirname, '../../app/circle/payment-setup.tsx'),
      'utf8',
    );
    expect(paymentPrefs).toContain('externalPaymentDisclosure');
    expect(paymentSetup).toContain('paymentSetup.externalPaymentDisclosure');
  });

  test('icon-only back buttons on audited screens have accessibility labels', () => {
    const files = [
      '../../app/subscription.tsx',
      '../../app/security.tsx',
      '../../app/circle/reminder-schedule.tsx',
      '../../app/legal/index.tsx',
      '../../components/LegalDocumentScreen.tsx',
      '../../app/payment-preferences.tsx',
      '../../app/automated-payments.tsx',
    ];
    for (const relative of files) {
      const source = readFileSync(path.join(__dirname, relative), 'utf8');
      expect(source).toMatch(/accessibilityLabel=\{t\((['"])common:goBack\1\)\}/);
    }
  });
});
