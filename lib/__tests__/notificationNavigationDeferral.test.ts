import { readFileSync } from 'fs';
import path from 'path';

const layout = readFileSync(
  path.join(__dirname, '..', '..', 'app', '_layout.tsx'),
  'utf8',
);

describe('notification navigation while the app is starting', () => {
  const start = layout.indexOf('const openTarget = useCallback(');
  const body = layout.slice(start, layout.indexOf('[authToken, setPostAuthTarget, status]', start));

  it('finds the openTarget handler', () => {
    expect(start).toBeGreaterThan(-1);
    expect(body.length).toBeGreaterThan(0);
  });

  it('holds a tap that arrives while the saved session is still loading', () => {
    expect(body).toMatch(/status === 'loading'[\s\S]{0,80}pendingRef\.current = data/);
  });

  it('waits for the session before it can send the user to login or ask the backend', () => {
    const loading = body.indexOf("status === 'loading'");
    expect(loading).toBeGreaterThan(-1);
    expect(loading).toBeLessThan(body.indexOf('resetNavigationToLogin()'));
    expect(loading).toBeLessThan(body.indexOf('authorizeNotificationNavigation('));
  });

  it('still holds a tap while the device lock is up or starting', () => {
    expect(body).toMatch(/deferRef\.current[\s\S]{0,60}pendingRef\.current = data/);
  });

  it('replays the held tap once the lock and session are ready', () => {
    expect(layout).toMatch(/const pending = pendingRef\.current;[\s\S]{0,200}openTarget\(pending/);
    expect(layout).toMatch(/\[defer, openTarget\]/);
  });
});
