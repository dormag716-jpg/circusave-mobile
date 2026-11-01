import { requestJson } from './http';

export type BackendChatMessage = {
  id: string;
  circleId?: string;
  conversationId?: string | null;
  senderName: string;
  senderId: string;
  senderUserId?: string | null;
  text: string;
  timestamp: string;
  createdAt?: string | null;
  isSystem?: boolean;
  /** User ids of other participants who have read this message. */
  readBy?: string[];
};

export type BackendChatParticipant = {
  userId: string;
  memberId: string;
  name: string;
};

export type BackendChatConversation = {
  id: string;
  circleId: string;
  type: 'group' | 'direct';
  /** A private chat with more than two people. */
  multiPerson?: boolean;
  /** Who started a multi-person chat; only they can remove others. */
  ownerUserId?: string | null;
  title: string;
  participants: BackendChatParticipant[];
  lastMessage: BackendChatMessage | null;
  unreadCount: number;
  lastReadAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BackendChatConversationList = {
  conversations: BackendChatConversation[];
  unreadCount: number;
};

export type BackendChatThread = {
  conversation: BackendChatConversation;
  messages: BackendChatMessage[];
};

export interface BackendLinkedAccount {
  id: string;
  bankName: string;
  last4: string;
}

export async function getChatMessages(circleId: string, token: string): Promise<BackendChatMessage[]> {
  return requestJson<BackendChatMessage[]>(`/groups/${circleId}/chat`, {
    token,
  });
}

export async function sendChatMessage(circleId: string, token: string, text: string): Promise<void> {
  return requestJson<void>(`/groups/${circleId}/chat`, {
    method: 'POST',
    token,
    body: JSON.stringify({ text }),
  });
}

export function getChatConversations(
  circleId: string,
  token: string,
): Promise<BackendChatConversationList> {
  return requestJson<BackendChatConversationList>(
    `/groups/${circleId}/conversations`,
    { token },
  );
}

export function createDirectChatConversation(
  circleId: string,
  token: string,
  memberId: string,
): Promise<BackendChatConversation> {
  return requestJson<BackendChatConversation>(
    `/groups/${circleId}/conversations/direct`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({ memberId }),
    },
  );
}

export function getConversationMessages(
  circleId: string,
  conversationId: string,
  token: string,
): Promise<BackendChatThread> {
  return requestJson<BackendChatThread>(
    `/groups/${circleId}/conversations/${conversationId}/messages`,
    { token },
  );
}

export function sendConversationMessage(
  circleId: string,
  conversationId: string,
  token: string,
  text: string,
): Promise<BackendChatMessage> {
  return requestJson<BackendChatMessage>(
    `/groups/${circleId}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({ text }),
    },
  );
}

export function deleteConversationMessage(
  circleId: string,
  conversationId: string,
  messageId: string,
  token: string,
): Promise<{
  messageId: string;
  deleted: boolean;
  notificationsDeleted: number;
}> {
  return requestJson(
    `/groups/${circleId}/conversations/${conversationId}/messages/${messageId}`,
    {
      method: 'DELETE',
      token,
    },
  );
}

export function addChatParticipant(
  circleId: string,
  conversationId: string,
  token: string,
  memberId: string,
): Promise<BackendChatConversation> {
  return requestJson<BackendChatConversation>(
    `/groups/${circleId}/conversations/${conversationId}/participants`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({ memberId }),
    },
  );
}

/** Removes someone, or the signed-in user (which deletes the chat for them). */
export function removeChatParticipant(
  circleId: string,
  conversationId: string,
  userId: string,
  token: string,
): Promise<{ conversationId: string; removedUserId: string; removed: boolean }> {
  return requestJson(
    `/groups/${circleId}/conversations/${conversationId}/participants/${userId}`,
    {
      method: 'DELETE',
      token,
    },
  );
}

export function markConversationRead(
  circleId: string,
  conversationId: string,
  token: string,
): Promise<{
  conversationId: string;
  readAt: string | null;
  unreadCount: number;
  notificationsUpdated: number;
}> {
  return requestJson(
    `/groups/${circleId}/conversations/${conversationId}/read`,
    {
      method: 'POST',
      token,
    },
  );
}
