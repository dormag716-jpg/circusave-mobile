/**
 * Map backend assistant conversation history into UI chat items.
 * Uses existing list endpoints only — no client-side invented transcript.
 */
import type { AiAssistantNavigationSuggestion } from '@/lib/api';
import type { AssistantActionSuggestionV2 } from '@/lib/contracts/assistant/actionsV2';

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

export type AssistantHistoryChatItem = {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  responseType?: 'answer' | 'refusal' | 'clarification';
  isRefusal?: boolean;
  navigationSuggestions?: AssistantActionSuggestionV2[];
  isError?: boolean;
};

/** Normalize app language to backend assistant locale. */
export function assistantApiLocale(languageTag: string): 'en' | 'es' | 'ht' {
  const base = String(languageTag || 'en').toLowerCase().slice(0, 2);
  if (base === 'es' || base === 'ht') return base;
  return 'en';
}

/**
 * Pick the most recently updated conversation for this app locale.
 * Avoids 400 "locale must match the assistant conversation locale".
 */
export function pickResumeConversation(
  conversations: readonly AssistantConversationSummary[],
  locale: 'en' | 'es' | 'ht',
): AssistantConversationSummary | null {
  const matching = conversations.filter(
    (item) => String(item.locale || '').toLowerCase() === locale,
  );
  if (matching.length === 0) return null;
  return [...matching].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || a.createdAt || '') || 0;
    const bTime = Date.parse(b.updatedAt || b.createdAt || '') || 0;
    return bTime - aTime;
  })[0];
}

function normalizeNav(
  raw: AiAssistantNavigationSuggestion[] | undefined,
): AssistantActionSuggestionV2[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantActionSuggestionV2[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const actionId = String(item.actionId || '').trim();
    if (!actionId) continue;
    out.push({
      actionId: actionId as AssistantActionSuggestionV2['actionId'],
      reason: String(item.reason || ''),
      assistantExecutable: false,
    });
  }
  return out;
}

/**
 * Convert stored messages into chat bubbles.
 * - Keeps completed user/assistant messages
 * - Skips empty / pending rows
 * - Surfaces failed assistant rows as error bubbles when content exists
 */
export function mapStoredMessagesToChatItems(
  messages: readonly AssistantStoredMessage[],
): AssistantHistoryChatItem[] {
  const items: AssistantHistoryChatItem[] = [];
  for (const row of messages) {
    const role = String(row.role || '').toLowerCase();
    const status = String(row.status || '').toLowerCase();
    const text = String(row.message || '').trim();
    if (!text) continue;
    if (status === 'pending') continue;

    if (role === 'user') {
      if (status !== 'completed' && status !== 'failed') continue;
      items.push({
        id: row.id,
        role: 'user',
        message: text,
      });
      continue;
    }

    if (role === 'assistant') {
      const responseTypeRaw = String(row.responseType || '');
      const responseType =
        responseTypeRaw === 'refusal' ||
        responseTypeRaw === 'clarification' ||
        responseTypeRaw === 'answer'
          ? responseTypeRaw
          : undefined;
      const isRefusal = responseType === 'refusal';
      const isError = status === 'failed';
      items.push({
        id: row.id,
        role: 'assistant',
        message: text,
        responseType,
        isRefusal,
        isError,
        navigationSuggestions: isError
          ? []
          : normalizeNav(row.navigationSuggestions),
      });
    }
  }
  return items;
}
