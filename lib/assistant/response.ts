/**
 * Client-side helpers for assistant-response.v2 (production backend).
 * Never treats navigation as executable; never invents financial truth.
 */
import type { AssistantResponseV2 } from '@/lib/contracts/assistant/responseV2';
import type { AssistantActionSuggestionV2 } from '@/lib/contracts/assistant/actionsV2';

export type NormalizedAssistantReply = {
  schemaVersion: 'assistant-response.v2';
  conversationId: string;
  messageId: string;
  status: 'completed' | 'refused';
  locale: string;
  responseType: 'answer' | 'refusal' | 'clarification';
  message: string;
  explanationCodes: string[];
  factRefs: string[];
  navigationSuggestions: AssistantActionSuggestionV2[];
  generatedFromContextAt: string;
  actionsExecutable: false;
  /** True when responseType is refusal (safety / policy). */
  isRefusal: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Normalize a production assistant JSON body into a stable UI model.
 * Throws if the payload is not a usable v2-shaped reply.
 */
export function normalizeAssistantResponse(payload: unknown): NormalizedAssistantReply {
  if (!isRecord(payload)) {
    throw new Error('Assistant response was not an object.');
  }

  const schemaVersion = String(payload.schemaVersion || '');
  const message = String(payload.message || '').trim();
  const responseType = String(payload.responseType || '');
  const status = String(payload.status || '');

  if (!message) {
    throw new Error('Assistant response had an empty message.');
  }

  // Accept production v2; tolerate older shells that only returned message.
  const normalizedType =
    responseType === 'refusal' ||
    responseType === 'clarification' ||
    responseType === 'answer'
      ? responseType
      : 'answer';

  const normalizedStatus =
    status === 'refused' || status === 'completed'
      ? status
      : normalizedType === 'refusal'
        ? 'refused'
        : 'completed';

  if (
    normalizedType === 'refusal' &&
    normalizedStatus !== 'refused'
  ) {
    // Prefer type when status is inconsistent (should be rare after backend fix).
  }

  const navigationRaw = Array.isArray(payload.navigationSuggestions)
    ? payload.navigationSuggestions
    : [];
  const navigationSuggestions: AssistantActionSuggestionV2[] = [];
  for (const item of navigationRaw) {
    if (!isRecord(item)) continue;
    const actionId = String(item.actionId || '').trim();
    if (!actionId) continue;
    // Force non-executable regardless of provider drift.
    navigationSuggestions.push({
      actionId: actionId as AssistantActionSuggestionV2['actionId'],
      reason: String(item.reason || ''),
      assistantExecutable: false,
    });
  }

  const factRefs = Array.isArray(payload.factRefs)
    ? payload.factRefs.map((x) => String(x))
    : [];
  const explanationCodes = Array.isArray(payload.explanationCodes)
    ? payload.explanationCodes.map((x) => String(x))
    : [];

  return {
    schemaVersion:
      schemaVersion === 'assistant-response.v2'
        ? 'assistant-response.v2'
        : 'assistant-response.v2',
    conversationId: String(payload.conversationId || ''),
    messageId: String(payload.messageId || ''),
    status: normalizedType === 'refusal' ? 'refused' : 'completed',
    locale: String(payload.locale || 'en'),
    responseType: normalizedType as NormalizedAssistantReply['responseType'],
    message,
    explanationCodes,
    factRefs,
    navigationSuggestions,
    generatedFromContextAt: String(payload.generatedFromContextAt || ''),
    actionsExecutable: false,
    isRefusal: normalizedType === 'refusal',
  };
}

/** Create a client Idempotency-Key (backend requires 8–128 chars). */
export function createAssistantIdempotencyKey(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `m-ai-${time}-${rand}`;
}

export type { AssistantResponseV2 };
