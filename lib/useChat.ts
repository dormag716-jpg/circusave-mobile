import { useState, useEffect, useCallback } from 'react';
import { useAuthSession } from './authContext';
import { getChatMessages, sendChatMessage, type BackendChatMessage } from './api';

export function useChat(circleId: string) {
  const { session } = useAuthSession();
  const [messages, setMessages] = useState<BackendChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!session?.session.token) return;
    try {
      const data = await getChatMessages(circleId, session.session.token);
      setMessages(data);
    } catch (e) {
      console.error('Failed to fetch messages', e);
    } finally {
      setLoading(false);
    }
  }, [circleId, session]);

  useEffect(() => {
    // Initial fetch
    void fetchMessages();
    
    // Polling every 3 seconds to simulate real-time API
    const interval = setInterval(() => {
      void fetchMessages();
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchMessages]);

  const sendMessage = async (text: string) => {
    if (!session?.session.token || !text.trim()) return;
    
    setSending(true);
    // Optimistic UI update
    const optimisticMessage: BackendChatMessage = {
      id: Math.random().toString(),
      senderName: session.user.name,
      senderId: session.user.id,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    
    setMessages(prev => [...prev, optimisticMessage]);
    
    try {
      await sendChatMessage(circleId, session.session.token, text, session.user.name, session.user.id);
      await fetchMessages();
    } catch (e) {
      console.error('Failed to send message', e);
    } finally {
      setSending(false);
    }
  };

  return { messages, sendMessage, loading, sending, currentUserId: session?.user.id };
}
