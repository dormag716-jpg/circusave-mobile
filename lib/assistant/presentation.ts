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
