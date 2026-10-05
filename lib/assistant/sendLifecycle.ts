/**
 * Reliable assistant sends: duplicate-send guard, stable idempotency key per
 * logical message, failure classification, in-progress waiting, and recovery
 * of a first message's conversation after a lost response.
 *
 * Pure logic with injected dependencies so it runs in the Node jest environment.
 */
import { ApiError } from '@/lib/platform/networkErrors';

import type { AssistantConversationSummary } from './history';
import { createAssistantIdempotencyKey } from './response';

/**
 * Backend worst case when `GET /assistant/.../conversations` does not report
 * one: two provider attempts at the default 25s timeout plus 20s overhead.
 */
export const ASSISTANT_REQUEST_FALLBACK_BUDGET_SECONDS = 70;
const BUDGET_MIN_SECONDS = 30;
const BUDGET_MAX_SECONDS = 180;
/** Extra wait beyond the backend budget for the network round trip. */
const CLIENT_NETWORK_MARGIN_SECONDS = 5;
const IN_PROGRESS_POLL_MS = 3_000;
/** Server and device clocks may differ when matching a recovered conversation. */
const RECOVERY_CLOCK_SKEW_MS = 2 * 60_000;

/**
 * Client wait for one assistant request. Based on the backend's reported total
 * request budget (every provider attempt plus overhead), not the 20s general
 * JSON timeout. Out-of-range or missing values fall back to the safe default.
 */
export function assistantRequestTimeoutMs(
  budgetSeconds?: number | null,
): number {
  const reported = Number(budgetSeconds);
  const budget =
    Number.isFinite(reported) && reported > 0
      ? Math.min(Math.max(reported, BUDGET_MIN_SECONDS), BUDGET_MAX_SECONDS)
      : ASSISTANT_REQUEST_FALLBACK_BUDGET_SECONDS;
  return Math.round((budget + CLIENT_NETWORK_MARGIN_SECONDS) * 1000);
}

/** Synchronous mutual exclusion. React state is too late for a fast double tap. */
export function createSendGuard() {
  let held = false;
  return {
    tryAcquire(): boolean {
      if (held) return false;
      held = true;
      return true;
    },
    release(): void {
      held = false;
    },
    isHeld(): boolean {
      return held;
    },
  };
}

export type SendGuard = ReturnType<typeof createSendGuard>;

/** One logical user message. The key never changes across retries. */
export type PendingAssistantSend = {
  localId: string;
  text: string;
  idempotencyKey: string;
  /** Conversation the server is known to hold this message in, if any. */
  conversationId: string | null;
  startedAtMs: number;
};

export function newPendingSend(
  text: string,
  conversationId: string | null,
  now: number = Date.now(),
): PendingAssistantSend {
  return {
    localId: `user-${now}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    idempotencyKey: createAssistantIdempotencyKey(),
    conversationId,
    startedAtMs: now,
  };
}

export type AssistantSendFailureKind =
  | 'allowance_daily'
  | 'allowance_monthly'
  | 'throttled'
  | 'busy'
  | 'in_progress'
  | 'offline'
  | 'timeout'
  | 'server'
  | 'rejected'
  | 'unknown';

export type AssistantSendFailure = {
  kind: AssistantSendFailureKind;
  /** True when pressing Retry (same key) can succeed without new quota use. */
  retryable: boolean;
};

function payloadField(payload: unknown, field: string): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }
  return (payload as Record<string, unknown>)[field];
}

export function classifyAssistantSendFailure(
  error: unknown,
): AssistantSendFailure {
  if (!(error instanceof ApiError)) {
    return { kind: 'unknown', retryable: true };
  }
  const errorCode = payloadField(error.payload, 'errorCode');
  if (error.status === 409 && payloadField(error.payload, 'inProgress') === true) {
    return { kind: 'in_progress', retryable: true };
  }
  if (error.status === 429) {
    if (errorCode === 'AI_DAILY_REQUEST_LIMIT') {
      return { kind: 'allowance_daily', retryable: false };
    }
    if (errorCode === 'AI_MONTHLY_TOKEN_LIMIT') {
      return { kind: 'allowance_monthly', retryable: false };
    }
    if (errorCode === 'AI_CONCURRENT_LIMIT') {
      return { kind: 'busy', retryable: true };
    }
    return { kind: 'throttled', retryable: true };
  }
  if (error.category === 'offline') return { kind: 'offline', retryable: true };
  if (error.category === 'timeout') return { kind: 'timeout', retryable: true };
  if (error.status >= 500 || error.status === 0) {
    return { kind: 'server', retryable: true };
  }
  return { kind: 'rejected', retryable: false };
}

/** i18n key for a failure, or null when the network-error copy should be used. */
export function assistantSendFailureKey(
  failure: AssistantSendFailure,
): string | null {
  switch (failure.kind) {
    case 'allowance_daily':
      return 'assistant:errors.allowanceDaily';
    case 'allowance_monthly':
      return 'assistant:errors.allowanceMonthly';
    case 'throttled':
      return 'assistant:errors.throttled';
    case 'busy':
    case 'in_progress':
      return 'assistant:errors.stillWorking';
    case 'offline':
    case 'timeout':
    case 'server':
      return null;
    default:
      return 'assistant:errors.generic';
  }
}

export type AssistantSendRequest = {
  message: string;
  idempotencyKey: string;
  conversationId: string | null;
  timeoutMs: number;
};

export type AssistantSendDeps<TReply> = {
  send: (request: AssistantSendRequest) => Promise<TReply>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

/**
 * Send one logical message. If the server reports the same key is still being
 * generated (a retry racing the first request), wait and ask again with the
 * SAME key until the server finishes or the budget runs out. Never changes
 * the key, so a retry cannot start another paid generation.
 */
export async function sendAssistantMessageWithWait<TReply>(
  deps: AssistantSendDeps<TReply>,
  pending: PendingAssistantSend,
  budgetSeconds?: number | null,
): Promise<TReply> {
  const timeoutMs = assistantRequestTimeoutMs(budgetSeconds);
  const deadline = deps.now() + timeoutMs;
  for (;;) {
    try {
      return await deps.send({
        message: pending.text,
        idempotencyKey: pending.idempotencyKey,
        conversationId: pending.conversationId,
        timeoutMs,
      });
    } catch (error) {
      const failure = classifyAssistantSendFailure(error);
      if (
        failure.kind !== 'in_progress' ||
        deps.now() + IN_PROGRESS_POLL_MS >= deadline
      ) {
        throw error;
      }
      await deps.sleep(IN_PROGRESS_POLL_MS);
    }
  }
}

/**
 * After a lost response to a FIRST message the app never learned the
 * conversation id. The server creates the conversation before generating, so
 * the newest conversation for this language created since the send began is
 * that thread.
 */
export function pickRecoveredConversation(
  conversations: readonly AssistantConversationSummary[],
  locale: 'en' | 'es' | 'ht',
  sentAtMs: number,
): string | null {
  const earliest = sentAtMs - RECOVERY_CLOCK_SKEW_MS;
  let best: { id: string; createdAt: number } | null = null;
  for (const item of conversations) {
    if (String(item.locale || '').toLowerCase() !== locale) continue;
    const createdAt = Date.parse(item.createdAt || '');
    if (!Number.isFinite(createdAt) || createdAt < earliest) continue;
    if (best === null || createdAt > best.createdAt) {
      best = { id: item.id, createdAt };
    }
  }
  return best ? best.id : null;
}
