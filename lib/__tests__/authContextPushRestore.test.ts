import { readFileSync } from 'fs';
import path from 'path';

const source = readFileSync(
  path.join(__dirname, '..', 'auth', 'authContext.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('auth context push registration wiring', () => {
  const restoreStart = source.indexOf('const runRestore = useCallback(');
  const restore = source.slice(
    restoreStart,
    source.indexOf('const refreshSession', restoreStart),
  );

  it('finds the restore function', () => {
    expect(restoreStart).toBeGreaterThan(-1);
    expect(restore.length).toBeGreaterThan(100);
  });

  it('registers a restored session only after it is validated and published', () => {
    const published = restore.indexOf(
      "setStatus(nextSession ? 'authenticated' : 'unauthenticated')",
    );
    const ensure = restore.indexOf('ensurePushTokenForRestoredSession(');
    expect(published).toBeGreaterThan(-1);
    expect(ensure).toBeGreaterThan(published);
  });

  it('skips a superseded restore and an unauthenticated result', () => {
    const superseded = restore.indexOf(
      'if (generation !== restoreGeneration.current) {\n        return nextSession;',
    );
    expect(superseded).toBeGreaterThan(-1);
    expect(superseded).toBeLessThan(restore.indexOf('ensurePushTokenForRestoredSession('));
    expect(restore).toMatch(
      /const restoredAuthToken = String\(nextSession\?\.session\.token \|\| ''\)\.trim\(\);\s+if \(restoredAuthToken\)/,
    );
  });

  it('passes a currency check, does not wait on it, and never lets a failure surface', () => {
    expect(restore).toMatch(
      /void ensurePushTokenForRestoredSession\([\s\S]*generation === restoreGeneration\.current[\s\S]*\)\.catch\(\(\) => \{\}\)/,
    );
  });

  it('does not register from the optimistic local session', () => {
    const optimistic = restore.slice(
      restore.indexOf('onOptimistic'),
      restore.indexOf('shouldAbort'),
    );
    expect(optimistic).not.toContain('PushToken');
  });

  it('keeps login registering and logout unregistering', () => {
    expect(source).toMatch(/await registerPushTokenForSession\(nextAuthToken\)/);
    expect(source).toMatch(/await unregisterPushTokenForLogout\(authToken\)/);
  });
});
