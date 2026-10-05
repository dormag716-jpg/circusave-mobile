import {
  ASSISTANT_REQUEST_FALLBACK_BUDGET_SECONDS,
  assistantRequestTimeoutMs,
  assistantSendFailureKey,
  classifyAssistantSendFailure,
  createSendGuard,
  newPendingSend,
  pickRecoveredConversation,
  sendAssistantMessageWithWait,
  type AssistantSendRequest,
} from '@/lib/assistant/sendLifecycle';
import { HTTP_JSON_TIMEOUT_MS } from '@/lib/platform/httpTimeout';
import { ApiError } from '@/lib/platform/networkErrors';

import en from '@/lib/i18n/locales/en/assistant.json';
import es from '@/lib/i18n/locales/es/assistant.json';
import ht from '@/lib/i18n/locales/ht/assistant.json';

function apiError(status: number, payload?: unknown, category?: any) {
  return new ApiError('failed', status, payload, category ? { category } : undefined);
}

const inProgress = () =>
  apiError(409, { error: 'processing', inProgress: true, generationId: 'ag_1' });

describe('assistant request timeout', () => {
  test('exceeds the backend budget and the general JSON timeout', () => {
    // Backend: two provider attempts at 25s plus 20s overhead = 70s.
    expect(assistantRequestTimeoutMs(70)).toBe(75_000);
    expect(assistantRequestTimeoutMs(70)).toBeGreaterThan(HTTP_JSON_TIMEOUT_MS);
    expect(assistantRequestTimeoutMs(70)).toBeGreaterThan(70_000);
  });

  test('falls back to the documented default when the budget is unknown', () => {
    const expected = (ASSISTANT_REQUEST_FALLBACK_BUDGET_SECONDS + 5) * 1000;
    expect(assistantRequestTimeoutMs()).toBe(expected);
    expect(assistantRequestTimeoutMs(null)).toBe(expected);
    expect(assistantRequestTimeoutMs(Number.NaN)).toBe(expected);
    expect(assistantRequestTimeoutMs(-5)).toBe(expected);
  });

  test('a single-provider budget is honored and out-of-range values are clamped', () => {
    expect(assistantRequestTimeoutMs(45)).toBe(50_000);
    expect(assistantRequestTimeoutMs(5)).toBe(35_000);
    expect(assistantRequestTimeoutMs(10_000)).toBe(185_000);
  });

  test('general API timeouts are unchanged', () => {
    expect(HTTP_JSON_TIMEOUT_MS).toBe(20_000);
  });
});

describe('send guard', () => {
  test('a second synchronous acquire is refused until release', () => {
    const guard = createSendGuard();
    expect(guard.tryAcquire()).toBe(true);
    expect(guard.tryAcquire()).toBe(false);
    expect(guard.isHeld()).toBe(true);
    guard.release();
    expect(guard.tryAcquire()).toBe(true);
  });
});

describe('failure classification', () => {
  test('allowance exhaustion cannot be retried', () => {
    expect(
      classifyAssistantSendFailure(apiError(429, { errorCode: 'AI_DAILY_REQUEST_LIMIT' })),
    ).toEqual({ kind: 'allowance_daily', retryable: false });
    expect(
      classifyAssistantSendFailure(apiError(429, { errorCode: 'AI_MONTHLY_TOKEN_LIMIT' })),
    ).toEqual({ kind: 'allowance_monthly', retryable: false });
  });

  test('throttle, busy, in-progress, and transport failures are retryable', () => {
    expect(
      classifyAssistantSendFailure(apiError(429, { errorCode: 'AI_FAILURE_THROTTLE' })).retryable,
    ).toBe(true);
    expect(
      classifyAssistantSendFailure(apiError(429, { errorCode: 'AI_CONCURRENT_LIMIT' })).kind,
    ).toBe('busy');
    expect(classifyAssistantSendFailure(inProgress()).kind).toBe('in_progress');
    expect(classifyAssistantSendFailure(apiError(0, undefined, 'timeout'))).toEqual({
      kind: 'timeout',
      retryable: true,
    });
    expect(classifyAssistantSendFailure(apiError(0, undefined, 'offline')).kind).toBe('offline');
    expect(classifyAssistantSendFailure(apiError(503)).kind).toBe('server');
    expect(classifyAssistantSendFailure(new Error('boom')).retryable).toBe(true);
  });

  test('rejected requests are not retried', () => {
    expect(classifyAssistantSendFailure(apiError(400)).retryable).toBe(false);
    expect(classifyAssistantSendFailure(apiError(403)).retryable).toBe(false);
    // A 409 that is not "in progress" (key reused for a different request).
    expect(classifyAssistantSendFailure(apiError(409, { error: 'reused' })).retryable).toBe(false);
  });

  test('every failure kind maps to a message key or the network copy', () => {
    expect(assistantSendFailureKey({ kind: 'timeout', retryable: true })).toBeNull();
    expect(assistantSendFailureKey({ kind: 'throttled', retryable: true })).toBe(
      'assistant:errors.throttled',
    );
  });
});

describe('one stable idempotency key per logical message', () => {
  test('new messages get distinct keys of valid length', () => {
    const first = newPendingSend('Question one', null);
    const second = newPendingSend('Question two', null);
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
    expect(first.idempotencyKey.length).toBeGreaterThanOrEqual(8);
    expect(first.idempotencyKey.length).toBeLessThanOrEqual(128);
    expect(first.localId).not.toBe(second.localId);
  });

  test('a retry sends the identical key, text, and conversation', async () => {
    const pending = newPendingSend('How much is due?', null, 1_000);
    const seen: AssistantSendRequest[] = [];
    const send = jest
      .fn<Promise<string>, [AssistantSendRequest]>()
      .mockImplementationOnce(async (request) => {
        seen.push(request);
        throw apiError(0, undefined, 'timeout');
      })
      .mockImplementationOnce(async (request) => {
        seen.push(request);
        return 'reply';
      });
    const deps = { send, sleep: jest.fn(async () => undefined), now: () => 1_000 };

    await expect(sendAssistantMessageWithWait(deps, pending, 70)).rejects.toBeInstanceOf(ApiError);
    await expect(sendAssistantMessageWithWait(deps, pending, 70)).resolves.toBe('reply');

    expect(seen[0].idempotencyKey).toBe(seen[1].idempotencyKey);
    expect(seen[0].message).toBe(seen[1].message);
    expect(seen[0].timeoutMs).toBe(75_000);
  });
});

describe('waiting for an in-progress generation', () => {
  test('asks again with the same key until the server finishes', async () => {
    const pending = newPendingSend('Is the round funded?', null, 0);
    let clock = 0;
    const send = jest
      .fn<Promise<string>, [AssistantSendRequest]>()
      .mockRejectedValueOnce(inProgress())
      .mockRejectedValueOnce(inProgress())
      .mockResolvedValueOnce('answer');
    const sleep = jest.fn(async (ms: number) => {
      clock += ms;
    });

    const reply = await sendAssistantMessageWithWait(
      { send, sleep, now: () => clock },
      pending,
      70,
    );

    expect(reply).toBe('answer');
    expect(send).toHaveBeenCalledTimes(3);
    expect(new Set(send.mock.calls.map(([request]) => request.idempotencyKey)).size).toBe(1);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  test('stops waiting when the budget is spent and surfaces the in-progress error', async () => {
    const pending = newPendingSend('Is the round funded?', null, 0);
    let clock = 0;
    const send = jest.fn(async () => {
      throw inProgress();
    });
    const sleep = jest.fn(async (ms: number) => {
      clock += ms;
    });

    await expect(
      sendAssistantMessageWithWait({ send, sleep, now: () => clock }, pending, 30),
    ).rejects.toMatchObject({ status: 409 });
    // 35s budget / 3s poll: bounded, not an infinite loop.
    expect(send.mock.calls.length).toBeGreaterThan(1);
    expect(send.mock.calls.length).toBeLessThan(15);
  });

  test('other failures are thrown at once without waiting', async () => {
    const pending = newPendingSend('Hello', null, 0);
    const sleep = jest.fn(async () => undefined);
    const send = jest.fn(async () => {
      throw apiError(503);
    });
    await expect(
      sendAssistantMessageWithWait({ send, sleep, now: () => 0 }, pending, 70),
    ).rejects.toMatchObject({ status: 503 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('lost response to a first message', () => {
  /** Server keyed by idempotency key, like the backend. */
  function makeServer() {
    const stored = new Map<string, { conversationId: string; message: string }>();
    let generations = 0;
    return {
      get generations() {
        return generations;
      },
      conversations: [] as { id: string; locale: string; createdAt: string }[],
      handle(request: AssistantSendRequest, loseResponse: boolean) {
        let record = stored.get(request.idempotencyKey);
        if (!record) {
          generations += 1;
          record = { conversationId: `ac_${generations}`, message: 'You owe $25.' };
          stored.set(request.idempotencyKey, record);
          this.conversations.push({
            id: record.conversationId,
            locale: 'en',
            createdAt: new Date(5_000).toISOString(),
          });
        }
        if (loseResponse) throw apiError(0, undefined, 'timeout');
        return record;
      },
    };
  }

  test('the same key recovers the stored answer and conversation with one generation', async () => {
    const server = makeServer();
    const pending = newPendingSend('What do I owe?', null, 5_000);
    let lose = true;
    const deps = {
      send: async (request: AssistantSendRequest) => {
        const loseThisResponse = lose;
        lose = false;
        return server.handle(request, loseThisResponse);
      },
      sleep: async () => undefined,
      now: () => 5_000,
    };

    await expect(sendAssistantMessageWithWait(deps, pending, 70)).rejects.toBeInstanceOf(ApiError);
    // The response was lost but the server finished. Recover the conversation.
    const recovered = pickRecoveredConversation(
      server.conversations as any,
      'en',
      pending.startedAtMs,
    );
    expect(recovered).toBe('ac_1');
    const retried = await sendAssistantMessageWithWait(
      deps,
      { ...pending, conversationId: recovered },
      70,
    );
    expect(retried.conversationId).toBe('ac_1');
    expect(server.generations).toBe(1);
  });

  test('recovery ignores old threads, other languages, and bad timestamps', () => {
    const sent = Date.parse('2026-10-03T12:00:00Z');
    const list = [
      { id: 'old', locale: 'en', createdAt: '2026-10-03T08:00:00Z', updatedAt: '' },
      { id: 'spanish', locale: 'es', createdAt: '2026-10-03T12:00:05Z', updatedAt: '' },
      { id: 'bad', locale: 'en', createdAt: 'not-a-date', updatedAt: '' },
      { id: 'older-match', locale: 'en', createdAt: '2026-10-03T12:00:02Z', updatedAt: '' },
      { id: 'newest-match', locale: 'en', createdAt: '2026-10-03T12:00:09Z', updatedAt: '' },
    ].map((item) => ({ ...item, circleId: 'c1' }));
    expect(pickRecoveredConversation(list, 'en', sent)).toBe('newest-match');
    expect(pickRecoveredConversation(list, 'ht', sent)).toBeNull();
    expect(pickRecoveredConversation([], 'en', sent)).toBeNull();
  });
});

describe('assistant send copy is present in every locale', () => {
  test.each([
    ['en', en],
    ['es', es],
    ['ht', ht],
  ])('%s has retry and failure strings', (_locale, bundle) => {
    const copy = bundle as unknown as {
      send: Record<string, string>;
      errors: Record<string, string>;
    };
    for (const key of ['retry', 'retryA11y', 'notSent', 'sending']) {
      expect(copy.send[key]).toBeTruthy();
    }
    for (const key of ['throttled', 'stillWorking']) {
      expect(copy.errors[key]).toBeTruthy();
    }
  });
});
