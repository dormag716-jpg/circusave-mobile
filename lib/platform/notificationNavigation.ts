export type NotificationNavigationDecision =
  | 'login'
  | 'workspace'
  | 'dashboard';

export async function authorizeNotificationNavigation(input: {
  authenticated: boolean;
  authorize: () => Promise<unknown>;
}): Promise<NotificationNavigationDecision> {
  if (!input.authenticated) {
    return 'login';
  }
  try {
    await input.authorize();
    return 'workspace';
  } catch {
    return 'dashboard';
  }
}
