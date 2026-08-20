import { readFileSync } from 'fs';
import path from 'path';

describe('create account wizard', () => {
  const source = readFileSync(
    path.join(__dirname, '..', '..', 'app', 'create-account.tsx'),
    'utf8',
  );

  test('renders one conditional card for each sequential step', () => {
    expect(source).toContain('useState<1 | 2 | 3>(1)');
    expect(source).toContain('currentStep === 1 ?');
    expect(source).toContain('currentStep === 2 ?');
    expect(source).toContain('currentStep === 3 ?');
    expect(source).toContain('showStep(2)');
    expect(source).toContain('showStep(3)');
  });

  test('uses Continue before the final account submission', () => {
    expect(source).toContain('onPress={handleProfileContinue}');
    expect(source).toContain('onPress={handleSecurityContinue}');
    expect(source).toContain('onPress={() => void handleCreateAccount()}');
    expect(source).toContain("t('create.createAccount')");
  });

  test('keeps policy consent and submission on the review step', () => {
    const reviewStep = source.indexOf('currentStep === 3 ?');
    const legalConsent = source.indexOf(
      'checked={acceptedTermsAndPrivacy}',
      reviewStep,
    );
    const submit = source.indexOf(
      'onPress={() => void handleCreateAccount()}',
      reviewStep,
    );

    expect(reviewStep).toBeGreaterThan(-1);
    expect(legalConsent).toBeGreaterThan(reviewStep);
    expect(submit).toBeGreaterThan(legalConsent);
  });
});
