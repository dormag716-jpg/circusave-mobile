import { readFileSync } from 'fs';
import path from 'path';

describe('workspace payment status card', () => {
  const source = readFileSync(
    path.join(__dirname, '..', '..', 'app', 'circle', 'workspace.tsx'),
    'utf8',
  );

  test('uses a compact payment roster with summary and status rows', () => {
    expect(source).toContain('styles.paymentRosterCard');
    expect(source).toContain('styles.paymentRosterSummary');
    expect(source).toContain('styles.paymentRosterMemberLine');
    expect(source).toContain('styles.paymentRosterStatus');
    expect(source).toContain('styles.paymentRosterDetails');
  });

  test('only offers list expansion when more than four hands exist', () => {
    expect(source).toContain('currentRoundMembers.length > 4');
    expect(source).toContain('accessibilityState={{ expanded: showAllPaid }}');
    expect(source).toContain('.slice(0, showAllPaid ? undefined : 4)');
  });
});
