import {
  createAssistantIdempotencyKey,
  normalizeAssistantResponse,
} from '@/lib/assistant/response';
import {
  hrefForAssistantAction,
  labelForAssistantAction,
} from '@/lib/assistant/navigation';

describe('assistant client helpers', () => {
  test('createAssistantIdempotencyKey meets backend length rules', () => {
    const key = createAssistantIdempotencyKey();
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(128);
    expect(key.startsWith('m-ai-')).toBe(true);
  });

  test('normalizeAssistantResponse maps production v2 fields', () => {
    const reply = normalizeAssistantResponse({
      schemaVersion: 'assistant-response.v2',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      status: 'completed',
      locale: 'en',
      responseType: 'answer',
      message: 'One contribution is still due.',
      explanationCodes: [],
      factRefs: ['currentRound.remainingDueCents'],
      navigationSuggestions: [
        {
          actionId: 'view_round_status',
          reason: 'See round progress',
          assistantExecutable: false,
        },
      ],
      generatedFromContextAt: '2026-08-10T12:00:00Z',
      actionsExecutable: false,
    });

    expect(reply.conversationId).toBe('conv-1');
    expect(reply.message).toContain('still due');
    expect(reply.isRefusal).toBe(false);
    expect(reply.actionsExecutable).toBe(false);
    expect(reply.navigationSuggestions).toHaveLength(1);
    expect(reply.navigationSuggestions[0].assistantExecutable).toBe(false);
  });

  test('normalizeAssistantResponse forces refusal status for refusal type', () => {
    const reply = normalizeAssistantResponse({
      schemaVersion: 'assistant-response.v2',
      conversationId: 'c',
      messageId: 'm',
      status: 'completed',
      locale: 'en',
      responseType: 'refusal',
      message: 'I cannot release the payout.',
      explanationCodes: ['MUTATION_REQUEST'],
      factRefs: [],
      navigationSuggestions: [],
      generatedFromContextAt: '2026-08-10T12:00:00Z',
      actionsExecutable: false,
    });
    expect(reply.isRefusal).toBe(true);
    expect(reply.status).toBe('refused');
  });

  test('normalizeAssistantResponse forces navigation non-executable', () => {
    const reply = normalizeAssistantResponse({
      message: 'Ok',
      responseType: 'answer',
      status: 'completed',
      navigationSuggestions: [
        {
          actionId: 'view_activity',
          reason: 'x',
          assistantExecutable: true,
        },
      ],
    });
    expect(reply.navigationSuggestions[0].assistantExecutable).toBe(false);
  });

  test('hrefForAssistantAction maps known action ids', () => {
    const round = hrefForAssistantAction('view_round_status', 'circle-1');
    expect(round).not.toBeNull();
    expect(round?.fallbackLabel).toBe('Round status');

    const upgrade = hrefForAssistantAction('upgrade_to_premium', 'circle-1');
    expect(upgrade?.href).toBe('/subscription');

    expect(hrefForAssistantAction('not_a_real_action', 'circle-1')).toBeNull();
    expect(labelForAssistantAction('view_payout_order')).toBe('Payout order');
  });
});
