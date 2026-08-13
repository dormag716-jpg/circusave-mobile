import type { BackendChatMessage } from '../api';
import {
  CIRCLE_CHAT_POLL_MS,
  areChatMessagesEquivalent,
  chatPollIntervalMs,
  composerDraftAfterSend,
  mergeChatMessages,
  shouldAutoScrollChat,
  shouldRunUnreadConversationPoll,
} from '../circleChatState';
import {
  claimCircleChatClient,
  isCircleChatClientActive,
  releaseCircleChatClient,
  resetCircleChatStoreForTests,
} from '../circleChatStore';

function message(
  id: string,
  text: string,
  timestamp = '10:00',
): BackendChatMessage {
  return {
    id,
    senderId: 'u1',
    senderName: 'Ada',
    text,
    timestamp,
  };
}

describe('circle chat polling ownership', () => {
  beforeEach(() => {
    resetCircleChatStoreForTests();
  });

  it('prevents a duplicate conversations poll while Chat owns the circle', () => {
    expect(shouldRunUnreadConversationPoll({ chatClientActive: true })).toBe(
      false,
    );
    expect(shouldRunUnreadConversationPoll({ chatClientActive: false })).toBe(
      true,
    );

    claimCircleChatClient('circle-1');
    expect(isCircleChatClientActive('circle-1')).toBe(true);
    expect(
      shouldRunUnreadConversationPoll({
        chatClientActive: isCircleChatClientActive('circle-1'),
      }),
    ).toBe(false);

    releaseCircleChatClient('circle-1');
    expect(
      shouldRunUnreadConversationPoll({
        chatClientActive: isCircleChatClientActive('circle-1'),
      }),
    ).toBe(true);
  });

  it('slows or pauses polls when Chat is hidden', () => {
    expect(
      chatPollIntervalMs({ kind: 'messages', focused: true }),
    ).toBe(CIRCLE_CHAT_POLL_MS.messagesFocused);
    expect(
      chatPollIntervalMs({ kind: 'messages', focused: false }),
    ).toBe(0);
    expect(
      chatPollIntervalMs({ kind: 'conversations', focused: false }),
    ).toBeGreaterThan(
      chatPollIntervalMs({ kind: 'conversations', focused: true }),
    );
  });
});

describe('circle chat message state', () => {
  it('does not replace state when the poll payload is identical', () => {
    const current = [message('1', 'hello'), message('2', 'there')];
    const incoming = [message('1', 'hello'), message('2', 'there')];

    expect(areChatMessagesEquivalent(current, incoming)).toBe(true);
    expect(mergeChatMessages(incoming, current)).toBe(current);
  });

  it('replaces when ids or render-relevant content change', () => {
    const current = [message('1', 'hello')];
    expect(mergeChatMessages([message('1', 'hello'), message('2', 'new')], current)).toEqual([
      message('1', 'hello'),
      message('2', 'new'),
    ]);
    expect(mergeChatMessages([message('1', 'edited')], current)).toEqual([
      message('1', 'edited'),
    ]);
  });
});

describe('circle chat auto-scroll', () => {
  it('does not force the user to the bottom while reading history', () => {
    expect(
      shouldAutoScrollChat({ reason: 'new-tail', pinnedToBottom: false }),
    ).toBe(false);
    expect(
      shouldAutoScrollChat({ reason: 'layout', pinnedToBottom: false }),
    ).toBe(false);
  });

  it('scrolls a new tail message only when pinned', () => {
    expect(
      shouldAutoScrollChat({ reason: 'new-tail', pinnedToBottom: true }),
    ).toBe(true);
    expect(
      shouldAutoScrollChat({ reason: 'user-send', pinnedToBottom: false }),
    ).toBe(true);
  });
});

describe('circle chat send draft', () => {
  it('preserves the composer draft when send fails', () => {
    expect(composerDraftAfterSend('keep this', false)).toBe('keep this');
    expect(composerDraftAfterSend('sent', true)).toBe('');
  });
});
