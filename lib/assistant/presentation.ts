import { createAssistantIdempotencyKey } from './response';

export type AssistantMessageSource = 'history' | 'live';

/** Long threads must use a virtualized list, not ScrollView + map. */
export function assistantThreadListKind(): 'virtualized' {
  return 'virtualized';
}

/** Composer draft lives in the composer. Typing must not rebuild the thread. */
export function assistantComposerOwnsDraft(): true {
  return true;
}

/**
 * History fetch identity. Welcome copy updates locally and must not
 * retrigger listAssistantConversations / listAssistantMessages.
 */
export function shouldReloadAssistantHistory(input: {
  previous: { token?: string; circleId?: string; locale?: string };
  next: { token?: string; circleId?: string; locale?: string };
}): boolean {
  return (
    String(input.previous.token || '') !== String(input.next.token || '') ||
    String(input.previous.circleId || '') !== String(input.next.circleId || '') ||
    String(input.previous.locale || '') !== String(input.next.locale || '')
  );
}

export function shouldAnimateAssistantMessage(input: {
  source: AssistantMessageSource;
}): boolean {
  return input.source === 'live';
}

export function shouldRefreshAssistantEntitlements(input: {
  usedIntro: boolean;
  requiresUpgrade: boolean;
}): boolean {
  return input.usedIntro === true || input.requiresUpgrade === true;
}

export function didConsumeAssistantIntro(input: {
  hasAiAssistant: boolean;
  aiIntroAvailable: boolean;
}): boolean {
  return !input.hasAiAssistant && input.aiIntroAvailable;
}

export function isAssistantUpgradeEntitlementError(input: {
  status?: number;
  hasUpgradePayload: boolean;
}): boolean {
  return input.status === 403 && input.hasUpgradePayload;
}

export type AssistantAllowanceErrorKey =
  | 'assistant:errors.allowanceDaily'
  | 'assistant:errors.allowanceMonthly';

/** User allowance exhaustion. A zero limit is unlimited, so these codes stay finite. */
export function assistantAllowanceErrorKey(
  payload: unknown,
): AssistantAllowanceErrorKey | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const code = (payload as { errorCode?: unknown }).errorCode;
  if (code === 'AI_DAILY_REQUEST_LIMIT') {
    return 'assistant:errors.allowanceDaily';
  }
  if (code === 'AI_MONTHLY_TOKEN_LIMIT') {
    return 'assistant:errors.allowanceMonthly';
  }
  return null;
}

/**
 * A transcript fetch can fail after the saved conversation is already known.
 * Keep that id so the next question continues the thread. A failed list has
 * no id, so the next question starts a new chat.
 */
export function assistantTranscriptFailureKeepsConversation(
  resumeConversationId: string | null | undefined,
): boolean {
  return Boolean(String(resumeConversationId || '').trim());
}

/** Newest completed turns a model request may include before the token budget. */
export const ASSISTANT_MODEL_MESSAGE_CAP = 24;

export type AssistantConversationMemory = {
  savedMessageCount: number;
  modelMessageCap: number;
  messagesIncludedAtCap: number;
  messagesSavedButNotSent: number;
  tokenBudgetMayOmitMore: boolean;
  authoritativeFacts: 'current_circle_context';
  promptVersion: string | null;
};

/**
 * Saved chat length versus the turns the model can receive.
 * Remembered amounts are not current circle facts.
 */
export function assistantConversationMemory(
  savedMessageCount: number,
): AssistantConversationMemory {
  const saved = Math.max(0, Math.floor(Number(savedMessageCount) || 0));
  const messagesIncludedAtCap = Math.min(saved, ASSISTANT_MODEL_MESSAGE_CAP);
  return {
    savedMessageCount: saved,
    modelMessageCap: ASSISTANT_MODEL_MESSAGE_CAP,
    messagesIncludedAtCap,
    messagesSavedButNotSent: saved - messagesIncludedAtCap,
    tokenBudgetMayOmitMore: true,
    authoritativeFacts: 'current_circle_context',
    promptVersion: null,
  };
}

export function readAssistantConversationMemory(
  value: unknown,
): AssistantConversationMemory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const saved = Number(record.savedMessageCount);
  const cap = Number(record.modelMessageCap);
  const included = Number(record.messagesIncludedAtCap);
  const omitted = Number(record.messagesSavedButNotSent);
  if (
    !Number.isFinite(saved) ||
    !Number.isFinite(cap) ||
    !Number.isFinite(included) ||
    !Number.isFinite(omitted)
  ) {
    return null;
  }
  return {
    savedMessageCount: saved,
    modelMessageCap: cap,
    messagesIncludedAtCap: included,
    messagesSavedButNotSent: omitted,
    tokenBudgetMayOmitMore: record.tokenBudgetMayOmitMore !== false,
    authoritativeFacts: 'current_circle_context',
    promptVersion:
      typeof record.promptVersion === 'string' ? record.promptVersion : null,
  };
}

export function buildAssistantSendOptions(conversationId: string | null): {
  conversationId: string | null;
  idempotencyKey: string;
} {
  return {
    conversationId,
    idempotencyKey: createAssistantIdempotencyKey(),
  };
}

export function assistantMessageRowUnchanged(
  previous: { id: string; message: string; isRefusal?: boolean; isError?: boolean },
  next: { id: string; message: string; isRefusal?: boolean; isError?: boolean },
): boolean {
  return (
    previous.id === next.id &&
    previous.message === next.message &&
    previous.isRefusal === next.isRefusal &&
    previous.isError === next.isError
  );
}
