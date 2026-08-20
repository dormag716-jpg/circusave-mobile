import { readFileSync } from 'fs';
import path from 'path';

import type { BackendChatMessage } from '../api';
import {
  CIRCLE_CHAT_POLL_MS,
  areChatMessagesEquivalent,
  chatPollIntervalMs,
  composerDraftAfterSend,
  isChatPollAppActive,
  appendConversationMessage,
  mergeChatMessages,
  messagesForSelectedConversation,
  shouldAutoScrollChat,
  shouldClearMessagesOnConversationSwitch,
  storeConversationMessages,
  shouldRunUnreadConversationPoll,
} from '../circleChatState';
import {
  bindCircleChatStoreUser,
  claimCircleChatClient,
  getCircleChatSnapshot,
  isCircleChatClientActive,
  publishCircleChatSnapshot,
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
    bindCircleChatStoreUser('usr_test');
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

  it('does not leak snapshots or chat ownership across users', () => {
    publishCircleChatSnapshot('circle-1', {
      conversations: [],
      unreadCount: 4,
    });
    claimCircleChatClient('circle-1');
    expect(getCircleChatSnapshot('circle-1')?.unreadCount).toBe(4);
    expect(isCircleChatClientActive('circle-1')).toBe(true);

    bindCircleChatStoreUser('usr_other');
    expect(getCircleChatSnapshot('circle-1')).toBeNull();
    expect(isCircleChatClientActive('circle-1')).toBe(false);

    bindCircleChatStoreUser('usr_test');
    expect(getCircleChatSnapshot('circle-1')).toBeNull();
    expect(isCircleChatClientActive('circle-1')).toBe(false);
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

  it('pauses conversation, message, and badge polls when the app is not active', () => {
    expect(isChatPollAppActive('active')).toBe(true);
    expect(isChatPollAppActive('inactive')).toBe(false);
    expect(isChatPollAppActive('background')).toBe(false);

    expect(
      chatPollIntervalMs({
        kind: 'messages',
        focused: true,
        appActive: false,
      }),
    ).toBe(0);
    expect(
      chatPollIntervalMs({
        kind: 'conversations',
        focused: true,
        appActive: false,
      }),
    ).toBe(0);
    expect(
      shouldRunUnreadConversationPoll({
        chatClientActive: false,
        appActive: false,
      }),
    ).toBe(false);
    expect(
      shouldRunUnreadConversationPoll({
        chatClientActive: false,
        appActive: true,
      }),
    ).toBe(true);
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

  it('removes messages that are no longer returned by the server', () => {
    const current = [message('1', 'keep'), message('2', 'deleted')];
    expect(mergeChatMessages([message('1', 'keep')], current)).toEqual([
      message('1', 'keep'),
    ]);
  });

  it('keeps each conversation thread when switching selections', () => {
    expect(shouldClearMessagesOnConversationSwitch()).toBe(false);

    let store: Record<string, ReturnType<typeof message>[]> = {};
    store = storeConversationMessages(store, 'group', [
      message('g1', 'group hello'),
    ]);
    store = storeConversationMessages(store, 'direct', [
      message('d1', 'private hello'),
    ]);

    expect(
      messagesForSelectedConversation(store, 'group').map((item) => item.id),
    ).toEqual(['g1']);
    expect(
      messagesForSelectedConversation(store, 'direct').map((item) => item.id),
    ).toEqual(['d1']);
    expect(messagesForSelectedConversation(store, 'group')).toBe(store.group);

    store = appendConversationMessage(store, 'group', message('g2', 'next'));
    expect(messagesForSelectedConversation(store, 'direct')[0]?.id).toBe('d1');
    expect(
      messagesForSelectedConversation(store, 'group').map((item) => item.id),
    ).toEqual(['g1', 'g2']);
  });

  it('does not clear the selected thread before the next conversation loads', () => {
    const source = readFileSync(
      path.join(__dirname, '..', 'useConversations.ts'),
      'utf8',
    );
    expect(source).toMatch(/messagesForSelectedConversation/);
    expect(source).toMatch(/storeConversationMessages/);
    expect(source).not.toMatch(/setMessages\(\[\]\)/);
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
    expect(composerDraftAfterSend('new draft', true, 'sent draft')).toBe(
      'new draft',
    );
    expect(composerDraftAfterSend('sent draft', true, 'sent draft')).toBe('');
  });
});
