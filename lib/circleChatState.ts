import type { BackendChatConversation, BackendChatMessage } from './api';

export const CIRCLE_CHAT_POLL_MS = {
  conversationsFocused: 5000,
  conversationsHidden: 30_000,
  messagesFocused: 3000,
  messagesHidden: 0,
} as const;

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
  return incoming;
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
  sentDraft?: string,
): string {
  if (!succeeded) {
    return current;
  }
  return sentDraft === undefined || current === sentDraft ? '' : current;
}
