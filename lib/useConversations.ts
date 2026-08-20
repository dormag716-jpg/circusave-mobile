import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  ApiError,
  createDirectChatConversation,
  deleteConversationMessage,
  getChatConversations,
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
  type BackendChatConversation,
  type BackendChatMessage,
} from './api';
import { logClientError } from './errorLogging';
import {
  appendConversationMessage,
  areConversationsEquivalent,
  chatPollIntervalMs,
  isChatPollAppActive,
  messagesForSelectedConversation,
  shouldRunUnreadConversationPoll,
  storeConversationMessages,
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
  options?: { focused?: boolean },
) {
  const focused = options?.focused !== false;
  const appActive = useChatPollAppActive();
  const [conversations, setConversations] = useState<BackendChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    initialConversationId ?? null,
  );
  const [messagesByConversationId, setMessagesByConversationId] = useState<
    Record<string, BackendChatMessage[]>
  >({});
  const messagesByConversationIdRef = useRef(messagesByConversationId);
  messagesByConversationIdRef.current = messagesByConversationId;
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
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
  const messages = useMemo(
    () =>
      messagesForSelectedConversation(
        messagesByConversationId,
        selectedConversationId,
      ),
    [messagesByConversationId, selectedConversationId],
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
      logClientError('Failed to load conversations', loadError, { circleId });
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
        setMessagesByConversationId((current) =>
          storeConversationMessages(current, conversationId, response.messages),
        );
        if (activeConversationId.current !== conversationId) {
          return;
        }
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
        logClientError('Failed to load conversation messages', loadError, {
          circleId,
          conversationId,
        });
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
    setMessagesByConversationId({});
    messagesByConversationIdRef.current = {};
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
      return;
    }
    lastMarkedMessageId.current = null;
    const cached = messagesByConversationIdRef.current[selectedConversationId];
    void loadMessages(selectedConversationId, {
      quiet: Array.isArray(cached) && cached.length > 0,
    });
  }, [loadMessages, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId || !appActive) {
      return;
    }
    const intervalMs = chatPollIntervalMs({
      kind: 'messages',
      focused,
      appActive,
    });
    if (intervalMs <= 0) {
      return;
    }
    const interval = setInterval(() => {
      void loadMessages(selectedConversationId, { quiet: true });
    }, intervalMs);
    return () => clearInterval(interval);
  }, [appActive, focused, loadMessages, selectedConversationId]);

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
        logClientError('Failed to create private conversation', createError, { circleId });
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
        setMessagesByConversationId((current) =>
          appendConversationMessage(current, selectedConversationId, message),
        );
        await loadConversations();
        setError(null);
      } catch (sendError) {
        logClientError('Failed to send conversation message', sendError, {
          circleId,
          conversationId: selectedConversationId,
        });
        setError(sendError instanceof Error ? sendError.message : 'Unable to send message.');
        throw sendError;
      } finally {
        setSending(false);
      }
    },
    [circleId, loadConversations, selectedConversationId, token],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!selectedConversationId || !messageId || deletingMessageId) return;
      setDeletingMessageId(messageId);
      try {
        await deleteConversationMessage(
          circleId,
          selectedConversationId,
          messageId,
          token,
        );
        setMessagesByConversationId((current) => ({
          ...current,
          [selectedConversationId]: (
            current[selectedConversationId] ?? []
          ).filter((message) => message.id !== messageId),
        }));
        await loadConversations();
        setError(null);
      } catch (deleteError) {
        logClientError('Failed to delete conversation message', deleteError, {
          circleId,
          conversationId: selectedConversationId,
          messageId,
        });
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : 'Unable to delete message.',
        );
        throw deleteError;
      } finally {
        setDeletingMessageId(null);
      }
    },
    [
      circleId,
      deletingMessageId,
      loadConversations,
      selectedConversationId,
      token,
    ],
  );

  return {
    conversations,
    selectedConversation,
    messages,
    loading,
    threadLoading,
    sending,
    deletingMessageId,
    error,
    selectConversation,
    createDirectConversation,
    sendMessage,
    deleteMessage,
    refresh: loadConversations,
  };
}

export function useConversationUnreadCount(
  circleId: string,
  token: string,
  enabled = true,
) {
  const appActive = useChatPollAppActive();
  const [unreadCount, setUnreadCount] = useState(
    () => getCircleChatSnapshot(circleId)?.unreadCount ?? 0,
  );
  const [chatClientActive, setChatClientActive] = useState(() =>
    isCircleChatClientActive(circleId),
  );
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    setAccessDenied(false);
    if (!enabled) {
      setUnreadCount(0);
    }
  }, [circleId, enabled, token]);

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
    if (!circleId || !token || !enabled || accessDenied) return;
    try {
      const response = await getChatConversations(circleId, token);
      publishCircleChatSnapshot(circleId, {
        conversations: response.conversations,
        unreadCount: response.unreadCount,
      });
      setUnreadCount(response.unreadCount);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setAccessDenied(true);
        setUnreadCount(0);
        return;
      }
      logClientError('Failed to load conversation unread count', error, { circleId });
    }
  }, [accessDenied, circleId, enabled, token]);

  useEffect(() => {
    if (
      !shouldRunUnreadConversationPoll({
        chatClientActive,
        appActive,
      }) ||
      !enabled ||
      accessDenied
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
  }, [accessDenied, appActive, chatClientActive, enabled, loadUnreadCount]);

  return {
    unreadCount,
    accessDenied,
    refreshUnreadCount: loadUnreadCount,
  };
}
