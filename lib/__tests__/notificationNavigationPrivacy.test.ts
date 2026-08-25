import { authorizeNotificationNavigation } from '../notificationNavigation';

describe('notification navigation privacy', () => {
  it('requires authentication before following an opaque notification target', async () => {
    const authorize = jest.fn(async () => undefined);
    await expect(
      authorizeNotificationNavigation({
        authenticated: false,
        authorize,
      }),
    ).resolves.toBe('login');
    expect(authorize).not.toHaveBeenCalled();
  });

  it('opens the workspace only after backend authorization succeeds', async () => {
    await expect(
      authorizeNotificationNavigation({
        authenticated: true,
        authorize: async () => undefined,
      }),
    ).resolves.toBe('workspace');
  });

  it.each(['wrong user', 'removed member'])(
    'redirects safely for a %s without revealing notification content',
    async () => {
      await expect(
        authorizeNotificationNavigation({
          authenticated: true,
          authorize: async () => {
            throw new Error('Forbidden');
          },
        }),
      ).resolves.toBe('dashboard');
    },
  );
});
