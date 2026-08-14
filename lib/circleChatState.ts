import type { BackendChatConversation, BackendChatMessage } from './api';

export const CIRCLE_CHAT_POLL_MS = {
  conversationsFocused: 5000,
  conversationsHidden: 30_000,
  messagesFocused: 3000,
  messagesHidden: 0,
} as const;

export type ConversationChipToggleInput = {
  chatPanelExpanded: boolean;
  selectedId: string | null;
  tappedId: string;
};

export type ConversationChipToggleResult = {
  chatPanelExpanded: boolean;
  selectedId: string | null;
  shouldSelect: boolean;
  dismissKeyboard: boolean;
  showThread: boolean;
  showComposer: boolean;
};

/**
 * Chip toggle for the conversation panel. Never clears the selected id.
 * Same chip while expanded collapses; otherwise the tapped conversation opens.
 */
export function toggleConversationPanel(
  input: ConversationChipToggleInput,
): ConversationChipToggleResult {
  const tappedId = String(input.tappedId || '').trim();
  const selectedId = String(input.selectedId || '').trim() || null;
  if (!tappedId) {
    return {
      chatPanelExpanded: input.chatPanelExpanded,
      selectedId,
      shouldSelect: false,
      dismissKeyboard: false,
      showThread: input.chatPanelExpanded,
      showComposer: input.chatPanelExpanded,
    };
  }

  const isActiveChip = selectedId === tappedId;
  if (isActiveChip && input.chatPanelExpanded) {
    return {
      chatPanelExpanded: false,
      selectedId,
      shouldSelect: false,
      dismissKeyboard: true,
      showThread: false,
      showComposer: false,
    };
  }

  return {
    chatPanelExpanded: true,
    selectedId: tappedId,
    shouldSelect: !isActiveChip,
    dismissKeyboard: false,
    showThread: true,
    showComposer: true,
  };
}

/**
 * Chip collapse hides the thread and composer. It must not unmount them,
 * or the composer draft and ChatFeed scroll position are destroyed.
 */
export function shouldKeepConversationSurfaceMounted(input: {
  hasSelectedConversation: boolean;
}): boolean {
  return input.hasSelectedConversation === true;
}

/** Message polls follow the hidden policy unless the tab and panel are both open. */
export function chatThreadPollFocused(input: {
  tabFocused: boolean;
  panelExpanded: boolean;
}): boolean {
  return input.tabFocused === true && input.panelExpanded === true;
}

/** Chat polls run only while the process is in the foreground. */
export function isChatPollAppActive(appState?: string | null): boolean {
  return String(appState || '').trim().toLowerCase() === 'active';
}

export function chatPollIntervalMs(input: {
  kind: 'conversations' | 'messages';
  focused: boolean;
  appActive?: boolean;
}): number {
  if (input.appActive === false) {
    return 0;
  }
  if (input.kind === 'messages') {
    return input.focused
      ? CIRCLE_CHAT_POLL_MS.messagesFocused
      : CIRCLE_CHAT_POLL_MS.messagesHidden;
  }
  return input.focused
    ? CIRCLE_CHAT_POLL_MS.conversationsFocused
    : CIRCLE_CHAT_POLL_MS.conversationsHidden;
}

/** Unread badge must not start a second conversations poll while Chat owns the circle. */
export function shouldRunUnreadConversationPoll(input: {
  chatClientActive: boolean;
  appActive?: boolean;
}): boolean {
  if (input.appActive === false) {
    return false;
  }
  return !input.chatClientActive;
}

export function chatMessageRenderKey(message: BackendChatMessage): string {
  return `${message.id}:${message.text}:${message.timestamp}`;
}

export function areChatMessagesEquivalent(
  left: BackendChatMessage[],
  right: BackendChatMessage[],
): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (chatMessageRenderKey(left[index]) !== chatMessageRenderKey(right[index])) {
      return false;
    }
  }
  return true;
}

export function shouldClearMessagesOnConversationSwitch(): false {
  return false;
}

export function messagesForSelectedConversation(
  messagesByConversationId: Record<string, BackendChatMessage[]>,
  selectedId: string | null | undefined,
): BackendChatMessage[] {
  const id = String(selectedId || '').trim();
  if (!id) {
    return [];
  }
  return messagesByConversationId[id] ?? [];
}

export function storeConversationMessages(
  current: Record<string, BackendChatMessage[]>,
  conversationId: string,
  incoming: BackendChatMessage[],
): Record<string, BackendChatMessage[]> {
  const id = String(conversationId || '').trim();
  if (!id) {
    return current;
  }
  const merged = mergeChatMessages(incoming, current[id] ?? []);
  if (merged === current[id]) {
    return current;
  }
  return { ...current, [id]: merged };
}

export function appendConversationMessage(
  current: Record<string, BackendChatMessage[]>,
  conversationId: string,
  message: BackendChatMessage,
): Record<string, BackendChatMessage[]> {
  const id = String(conversationId || '').trim();
  if (!id) {
    return current;
  }
  return { ...current, [id]: [...(current[id] ?? []), message] };
}

export function mergeChatMessages(
  incoming: BackendChatMessage[],
  current: BackendChatMessage[],
): BackendChatMessage[] {
  if (areChatMessagesEquivalent(incoming, current)) {
    return current;
  }
  const incomingIds = new Set(incoming.map((message) => message.id));
  const missingCurrent = current.filter((message) => !incomingIds.has(message.id));
  return missingCurrent.length > 0 ? [...incoming, ...missingCurrent] : incoming;
}

export function areConversationsEquivalent(
  left: BackendChatConversation[],
  right: BackendChatConversation[],
): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a.id !== b.id ||
      a.unreadCount !== b.unreadCount ||
      a.lastMessage?.id !== b.lastMessage?.id ||
      a.lastMessage?.text !== b.lastMessage?.text
    ) {
      return false;
    }
  }
  return true;
}

export function shouldAutoScrollChat(input: {
  reason: 'user-send' | 'new-tail' | 'layout';
  pinnedToBottom: boolean;
}): boolean {
  if (input.reason === 'user-send') {
    return true;
  }
  return input.pinnedToBottom;
}

export function isPinnedNearBottom(input: {
  offsetFromEnd: number;
  threshold?: number;
}): boolean {
  const threshold = input.threshold ?? 80;
  return Number.isFinite(input.offsetFromEnd) && input.offsetFromEnd <= threshold;
}

export function composerDraftAfterSend(
  current: string,
  succeeded: boolean,
): string {
  return succeeded ? '' : current;
}
