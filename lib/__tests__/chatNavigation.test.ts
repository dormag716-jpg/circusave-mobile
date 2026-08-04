jest.mock('expo-linking', () => ({
  parse: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone' },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock('../i18n', () => ({
  i18n: { t: (key: string) => key },
}));

import { circleWorkspaceHref } from '../navigation';
import { conversationIdFromNotificationLink } from '../notifications';

describe('chat navigation', () => {
  test('targets a private conversation from the workspace route', () => {
    expect(circleWorkspaceHref('circle-1', 'chat', 'conversation-2')).toEqual({
      pathname: '/circle/workspace',
      params: {
        circleId: 'circle-1',
        tab: 'chat',
        conversationId: 'conversation-2',
      },
    });
  });

  test('reads the conversation id from a backend notification link', () => {
    expect(
      conversationIdFromNotificationLink(
        '/groups/circle-1/chat?conversationId=cc_private_1',
      ),
    ).toBe('cc_private_1');
    expect(conversationIdFromNotificationLink('/groups/circle-1/chat')).toBeNull();
  });
});
