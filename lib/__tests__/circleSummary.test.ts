import { isSetupCircleStatus } from '../circleSummary';

describe('circle summary lifecycle', () => {
  test.each(['draft', 'setup', 'forming', ' DRAFT '])('%s remains visible as setup', (status) => {
    expect(isSetupCircleStatus(status)).toBe(true);
  });

  test.each(['active', 'completed', 'paused', 'closed', undefined])('%s is not setup', (status) => {
    expect(isSetupCircleStatus(status)).toBe(false);
  });
});
