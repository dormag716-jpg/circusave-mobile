import { readFileSync } from 'fs';
import path from 'path';

describe('circle workspace access failure handling', () => {
  const source = readFileSync(
    path.join(__dirname, '..', '..', 'app', 'circle', 'workspace.tsx'),
    'utf8',
  );

  test('treats a 403 as terminal access denial instead of a retryable error', () => {
    expect(source).toContain(
      'loadError instanceof ApiError && loadError.status === 403',
    );
    expect(source).toContain('evictCircleWorkspaceCache(circleId)');
    expect(source).toContain('invalidateCachedGets()');
    expect(source).toContain('setAccessDenied(true)');
  });

  test('does not mount workspace sections after access is denied', () => {
    expect(source).toContain(
      'const readyWorkspace = Boolean(circle && token && !accessDenied)',
    );
    expect(source).toContain('{accessDenied ? (');
    expect(source).toContain('<BlockedAccessCard');
  });
});
