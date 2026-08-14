import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  createDirectChatConversation,
  getChatConversations,
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
  type BackendChatConversation,
  type BackendChatMessage,
} from './api';
import {
  areConversationsEquivalent,
  chatPollIntervalMs,
  chatThreadPollFocused,
  isChatPollAppActive,
  mergeChatMessages,
  shouldRunUnreadConversationPoll,
} from './circleChatState';
import {
  claimCircleChatClient,
  getCircleChatSnapshot,
  isCircleChatClientActive,
  publishCircleChatSnapshot,
  releaseCircleChatClient,
  subscribeCircleChatOwnership,
  subscribeCircleChatSnapshot,
} from './circleChatStore';

function useChatPollAppActive(): boolean {
  const [appActive, setAppActive] = useState(() =>
    isChatPollAppActive(AppState.currentState),
  );

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      setAppActive(isChatPollAppActive(next));
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => {
      subscription.remove();
    };
  }, []);

  return appActive;
}

export function useConversations(
  circleId: string,
  token: string,
  initialConversationId?: string,
  options?: { focused?: boolean; threadVisible?: boolean },
) {
  const focused = options?.focused !== false;
  const threadVisible = options?.threadVisible !== false;
  const appActive = useChatPollAppActive();
  const messagesFocused = chatThreadPollFocused({
    tabFocused: focused,
    panelExpanded: threadVisible,
  });
  const [conversations, setConversations] = useState<BackendChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    initialConversationId ?? null,
  );
  const [messages, setMessages] = useState<BackendChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastMarkedMessageId = useRef<string | null>(null);
  const hasConversationSnapshot = useRef(false);
  const activeConversationId = useRef<string | null>(
    initialConversationId ?? null,
  );

  useEffect(() => {
    if (initialConversationId) {
      activeConversationId.current = initialConversationId;
      setSelectedConversationId(initialConversationId);
    }
  }, [initialConversationId]);

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === selectedConversationId,
      ) ?? null,
    [conversations, selectedConversationId],
  );

  const loadConversations = useCallback(async () => {
    if (!circleId || !token) return;
    try {
      const response = await getChatConversations(circleId, token);
      setConversations((current) =>
        areConversationsEquivalent(current, response.conversations)
          ? current
          : response.conversations,
      );
      publishCircleChatSnapshot(circleId, {
        conversations: response.conversations,
        unreadCount: response.unreadCount,
      });
      hasConversationSnapshot.current = true;
      setSelectedConversationId((current) => {
        if (
          current &&
          response.conversations.some((conversation) => conversation.id === current)
        ) {
          activeConversationId.current = current;
          return current;
        }
        const next =
          response.conversations.find(
            (conversation) => conversation.type === 'group',
          )?.id ??
          response.conversations[0]?.id ??
          null;
        activeConversationId.current = next;
        return next;
      });
      setError(null);
    } catch (loadError) {
      console.error('Failed to load conversations', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load chat.');
    } finally {
      setLoading(false);
    }
  }, [circleId, token]);

  const loadMessages = useCallback(
    async (conversationId: string, options?: { quiet?: boolean }) => {
      if (!options?.quiet) setThreadLoading(true);
      try {
        const response = await getConversationMessages(
          circleId,
          conversationId,
          token,
        );
        if (activeConversationId.current !== conversationId) {
          return;
        }
        setMessages((current) => mergeChatMessages(response.messages, current));
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === response.conversation.id
              ? response.conversation
              : conversation,
          ),
        );
        const newestMessage = response.messages[response.messages.length - 1];
        if (
          response.conversation.unreadCount > 0 &&
          lastMarkedMessageId.current !== (newestMessage?.id ?? conversationId)
        ) {
          await markConversationRead(circleId, conversationId, token);
          lastMarkedMessageId.current = newestMessage?.id ?? conversationId;
          setConversations((current) =>
            current.map((conversation) =>
              conversation.id === conversationId
                ? { ...conversation, unreadCount: 0 }
                : conversation,
            ),
          );
        }
        setError(null);
      } catch (loadError) {
        console.error('Failed to load conversation messages', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load messages.');
      } finally {
        if (
          !options?.quiet &&
          activeConversationId.current === conversationId
        ) {
          setThreadLoading(false);
        }
      }
    },
    [circleId, token],
  );

  useEffect(() => {
    claimCircleChatClient(circleId);
    return () => {
      releaseCircleChatClient(circleId);
    };
  }, [circleId]);

  useEffect(() => {
    if (!appActive) {
      return;
    }
    if (!hasConversationSnapshot.current) {
      setLoading(true);
    }
    void loadConversations();
    const intervalMs = chatPollIntervalMs({
      kind: 'conversations',
      focused,
      appActive,
    });
    if (intervalMs <= 0) {
      return;
    }
    const interval = setInterval(() => {
      void loadConversations();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [appActive, focused, loadConversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }
    setMessages([]);
    lastMarkedMessageId.current = null;
    void loadMessages(selectedConversationId);
  }, [loadMessages, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId || !appActive) {
      return;
    }
    const intervalMs = chatPollIntervalMs({
      kind: 'messages',
      focused: messagesFocused,
      appActive,
    });
    if (intervalMs <= 0) {
      return;
    }
    const interval = setInterval(() => {
      void loadMessages(selectedConversationId, { quiet: true });
    }, intervalMs);
    return () => clearInterval(interval);
  }, [appActive, loadMessages, messagesFocused, selectedConversationId]);

  const selectConversation = useCallback((conversationId: string) => {
    activeConversationId.current = conversationId;
    setSelectedConversationId(conversationId);
  }, []);

  const createDirectConversation = useCallback(
    async (memberId: string) => {
      setThreadLoading(true);
      try {
        const conversation = await createDirectChatConversation(
          circleId,
          token,
          memberId,
        );
        await loadConversations();
        activeConversationId.current = conversation.id;
        setSelectedConversationId(conversation.id);
        setError(null);
        return conversation;
      } catch (createError) {
        console.error('Failed to create private conversation', createError);
        setError(
          createError instanceof Error
            ? createError.message
            : 'Unable to create private chat.',
        );
        throw createError;
      } finally {
        setThreadLoading(false);
      }
    },
    [circleId, loadConversations, token],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!selectedConversationId || !text.trim()) return;
      setSending(true);
      try {
        const message = await sendConversationMessage(
          circleId,
          selectedConversationId,
          token,
          text.trim(),
        );
        setMessages((current) => [...current, message]);
        await loadConversations();
        setError(null);
      } catch (sendError) {
        console.error('Failed to send conversation message', sendError);
        setError(sendError instanceof Error ? sendError.message : 'Unable to send message.');
        throw sendError;
      } finally {
        setSending(false);
      }
    },
    [circleId, loadConversations, selectedConversationId, token],
  );

  return {
    conversations,
    selectedConversation,
    messages,
    loading,
    threadLoading,
    sending,
    error,
    selectConversation,
    createDirectConversation,
    sendMessage,
    refresh: loadConversations,
  };
}

export function useConversationUnreadCount(circleId: string, token: string) {
  const appActive = useChatPollAppActive();
  const [unreadCount, setUnreadCount] = useState(
    () => getCircleChatSnapshot(circleId)?.unreadCount ?? 0,
  );
  const [chatClientActive, setChatClientActive] = useState(() =>
    isCircleChatClientActive(circleId),
  );

  useEffect(() => {
    const sync = () => {
      setChatClientActive(isCircleChatClientActive(circleId));
      const snapshot = getCircleChatSnapshot(circleId);
      if (snapshot) {
        setUnreadCount(snapshot.unreadCount);
      }
    };
    sync();
    const stopOwnership = subscribeCircleChatOwnership(sync);
    const stopSnapshot = subscribeCircleChatSnapshot(circleId, sync);
    return () => {
      stopOwnership();
      stopSnapshot();
    };
  }, [circleId]);

  const loadUnreadCount = useCallback(async () => {
    if (!circleId || !token) return;
    try {
      const response = await getChatConversations(circleId, token);
      publishCircleChatSnapshot(circleId, {
        conversations: response.conversations,
        unreadCount: response.unreadCount,
      });
      setUnreadCount(response.unreadCount);
    } catch (error) {
      console.error('Failed to load conversation unread count', error);
    }
  }, [circleId, token]);

  useEffect(() => {
    if (
      !shouldRunUnreadConversationPoll({
        chatClientActive,
        appActive,
      })
    ) {
      return;
    }
    void loadUnreadCount();
    const intervalMs = chatPollIntervalMs({
      kind: 'conversations',
      focused: true,
      appActive,
    });
    if (intervalMs <= 0) {
      return;
    }
    const interval = setInterval(() => {
      void loadUnreadCount();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [appActive, chatClientActive, loadUnreadCount]);

  return { unreadCount, refreshUnreadCount: loadUnreadCount };
}
