import type { BackendChatMessage } from '../api';
import {
  CIRCLE_CHAT_POLL_MS,
  areChatMessagesEquivalent,
  chatPollIntervalMs,
  chatThreadPollFocused,
  composerDraftAfterSend,
  isChatPollAppActive,
  mergeChatMessages,
  shouldAutoScrollChat,
  shouldKeepConversationSurfaceMounted,
  shouldRunUnreadConversationPoll,
  toggleConversationPanel,
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

describe('conversation chip panel toggle', () => {
  const group = 'conv-group';
  const direct = 'conv-direct';

  it('collapses when the active expanded chip is tapped', () => {
    const collapsed = toggleConversationPanel({
      chatPanelExpanded: true,
      selectedId: group,
      tappedId: group,
    });
    expect(collapsed.chatPanelExpanded).toBe(false);
    expect(collapsed.shouldSelect).toBe(false);
    expect(collapsed.selectedId).toBe(group);
    expect(collapsed.showThread).toBe(false);
    expect(collapsed.showComposer).toBe(false);
    expect(collapsed.dismissKeyboard).toBe(true);
  });

  it('reopens when the active collapsed chip is tapped', () => {
    const reopened = toggleConversationPanel({
      chatPanelExpanded: false,
      selectedId: group,
      tappedId: group,
    });
    expect(reopened.chatPanelExpanded).toBe(true);
    expect(reopened.shouldSelect).toBe(false);
    expect(reopened.selectedId).toBe(group);
    expect(reopened.showThread).toBe(true);
    expect(reopened.showComposer).toBe(true);
    expect(reopened.dismissKeyboard).toBe(false);
  });

  it('selects a different chip and keeps or opens the panel', () => {
    const whileOpen = toggleConversationPanel({
      chatPanelExpanded: true,
      selectedId: group,
      tappedId: direct,
    });
    expect(whileOpen.chatPanelExpanded).toBe(true);
    expect(whileOpen.shouldSelect).toBe(true);
    expect(whileOpen.selectedId).toBe(direct);

    const whileCollapsed = toggleConversationPanel({
      chatPanelExpanded: false,
      selectedId: group,
      tappedId: direct,
    });
    expect(whileCollapsed.chatPanelExpanded).toBe(true);
    expect(whileCollapsed.shouldSelect).toBe(true);
    expect(whileCollapsed.selectedId).toBe(direct);
  });

  it('retains the selected conversation when collapsed', () => {
    const messages = [message('1', 'hello')];
    const collapsed = toggleConversationPanel({
      chatPanelExpanded: true,
      selectedId: group,
      tappedId: group,
    });
    expect(collapsed.selectedId).toBe(group);
    expect(collapsed.shouldSelect).toBe(false);
    expect(messages).toEqual([message('1', 'hello')]);
  });

  it('hides both thread and composer when collapsed', () => {
    const collapsed = toggleConversationPanel({
      chatPanelExpanded: true,
      selectedId: group,
      tappedId: group,
    });
    expect(collapsed.showThread).toBe(false);
    expect(collapsed.showComposer).toBe(false);
    expect(collapsed.showThread).toBe(collapsed.showComposer);
    expect(
      shouldKeepConversationSurfaceMounted({ hasSelectedConversation: true }),
    ).toBe(true);
    expect(
      shouldKeepConversationSurfaceMounted({ hasSelectedConversation: false }),
    ).toBe(false);
  });

  it('invokes keyboard dismissal when collapsing', () => {
    const collapsed = toggleConversationPanel({
      chatPanelExpanded: true,
      selectedId: group,
      tappedId: group,
    });
    expect(collapsed.dismissKeyboard).toBe(true);

    const reopen = toggleConversationPanel({
      chatPanelExpanded: false,
      selectedId: group,
      tappedId: group,
    });
    expect(reopen.dismissKeyboard).toBe(false);

    const switchChip = toggleConversationPanel({
      chatPanelExpanded: true,
      selectedId: group,
      tappedId: direct,
    });
    expect(switchChip.dismissKeyboard).toBe(false);
  });

  it('uses the paused message poll while the panel is collapsed', () => {
    expect(
      chatThreadPollFocused({ tabFocused: true, panelExpanded: false }),
    ).toBe(false);
    expect(
      chatPollIntervalMs({
        kind: 'messages',
        focused: chatThreadPollFocused({
          tabFocused: true,
          panelExpanded: false,
        }),
      }),
    ).toBe(CIRCLE_CHAT_POLL_MS.messagesHidden);
    expect(
      chatPollIntervalMs({
        kind: 'conversations',
        focused: true,
      }),
    ).toBe(CIRCLE_CHAT_POLL_MS.conversationsFocused);
    expect(
      chatThreadPollFocused({ tabFocused: true, panelExpanded: true }),
    ).toBe(true);
  });
});

describe('circle chat send draft', () => {
  it('preserves the composer draft when send fails', () => {
    expect(composerDraftAfterSend('keep this', false)).toBe('keep this');
    expect(composerDraftAfterSend('sent', true)).toBe('');
  });
});
