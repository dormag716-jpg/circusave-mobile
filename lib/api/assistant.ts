import { requestJson } from './http';

/**
 * Production assistant-response.v2 shape (AiAssistantService).
 * Older shells used { mode, actions }; those fields are no longer returned.
 */
export type AiAssistantNavigationSuggestion = {
  actionId: string;
  reason: string;
  assistantExecutable: false;
};

export type AiAssistantResponse = {
  schemaVersion: 'assistant-response.v2' | string;
  conversationId: string;
  messageId: string;
  status: 'completed' | 'refused';
  locale: string;
  responseType: 'answer' | 'refusal' | 'clarification';
  message: string;
  explanationCodes: string[];
  factRefs: string[];
  navigationSuggestions: AiAssistantNavigationSuggestion[];
  generatedFromContextAt: string;
  actionsExecutable: false;
  /** Present only on some entitlement/error payloads — not on v2 success body. */
  mode?: 'premium' | 'free_introduction';
};

/**
 * Send a circle assistant message (production v2).
 * Requires Idempotency-Key (8–128 chars). Prefer createAssistantIdempotencyKey().
 */
export function sendAiAssistantMessage(
  token: string,
  circleId: string,
  message: string,
  locale: string,
  options?: {
    conversationId?: string | null;
    idempotencyKey?: string;
    /**
     * Assistant requests may legitimately outlast the 20s JSON timeout (one or
     * two provider attempts). Callers pass assistantRequestTimeoutMs().
     */
    timeoutMs?: number;
  },
): Promise<AiAssistantResponse> {
  const conversationId = String(options?.conversationId || '').trim();
  const idempotencyKey = String(
    options?.idempotencyKey ||
      `m-ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  ).trim();
  const path = conversationId
    ? `/assistant/circles/${circleId}/conversations/${encodeURIComponent(conversationId)}/messages`
    : `/assistant/circles/${circleId}/messages`;
  return requestJson<AiAssistantResponse>(path, {
    method: 'POST',
    token,
    timeoutMs: options?.timeoutMs,
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      message,
      locale,
      idempotencyKey,
    }),
  });
}

export type AssistantConversationSummary = {
  id: string;
  circleId: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
};

export type AssistantStoredMessage = {
  id: string;
  conversationId: string;
  role: string;
  status: string;
  locale: string;
  message: string;
  responseType?: string | null;
  explanationCodes?: string[];
  factRefs?: string[];
  navigationSuggestions?: AiAssistantNavigationSuggestion[];
  errorCode?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

export function listAssistantConversations(
  token: string,
  circleId: string,
): Promise<{
  conversations: AssistantConversationSummary[];
  /** Backend's total request budget in seconds (provider attempts + overhead). */
  requestBudgetSeconds?: number;
}> {
  return requestJson(`/assistant/circles/${circleId}/conversations`, { token });
}

export function listAssistantMessages(
  token: string,
  circleId: string,
  conversationId: string,
): Promise<{
  conversation: AssistantConversationSummary;
  messages: AssistantStoredMessage[];
  conversationMemory?: {
    savedMessageCount: number;
    modelMessageCap: number;
    messagesIncludedAtCap: number;
    messagesSavedButNotSent: number;
    tokenBudgetMayOmitMore?: boolean;
    authoritativeFacts?: string;
    promptVersion?: string;
  };
  promptVersion?: string;
}> {
  return requestJson(
    `/assistant/circles/${circleId}/conversations/${encodeURIComponent(conversationId)}/messages`,
    { token },
  );
}
