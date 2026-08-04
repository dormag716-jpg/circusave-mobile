import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createDirectChatConversation,
  getChatConversations,
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
  type BackendChatConversation,
  type BackendChatMessage,
} from './api';

export function useConversations(
  circleId: string,
  token: string,
  initialConversationId?: string,
) {
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
      setConversations(response.conversations);
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
        setMessages((current) => mergeMessages(response.messages, current));
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
    setLoading(true);
    void loadConversations();
    const interval = setInterval(() => {
      void loadConversations();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }
    setMessages([]);
    lastMarkedMessageId.current = null;
    void loadMessages(selectedConversationId);
    const interval = setInterval(() => {
      void loadMessages(selectedConversationId, { quiet: true });
    }, 3000);
    return () => clearInterval(interval);
  }, [loadMessages, selectedConversationId]);

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
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    if (!circleId || !token) return;
    try {
      const response = await getChatConversations(circleId, token);
      setUnreadCount(response.unreadCount);
    } catch (error) {
      console.error('Failed to load conversation unread count', error);
    }
  }, [circleId, token]);

  useEffect(() => {
    void loadUnreadCount();
    const interval = setInterval(() => {
      void loadUnreadCount();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  return { unreadCount, refreshUnreadCount: loadUnreadCount };
}

function mergeMessages(
  incoming: BackendChatMessage[],
  current: BackendChatMessage[],
) {
  const incomingIds = new Set(incoming.map((message) => message.id));
  const missingCurrent = current.filter(
    (message) => !incomingIds.has(message.id),
  );
  return missingCurrent.length > 0
    ? [...incoming, ...missingCurrent]
    : incoming;
}
