import {
  assistantApiLocale,
  mapStoredMessagesToChatItems,
  pickResumeConversation,
} from '@/lib/assistant/history';

describe('assistant history helpers', () => {
  test('assistantApiLocale normalizes tags', () => {
    expect(assistantApiLocale('en-US')).toBe('en');
    expect(assistantApiLocale('es')).toBe('es');
    expect(assistantApiLocale('ht-HT')).toBe('ht');
    expect(assistantApiLocale('fr')).toBe('en');
  });

  test('pickResumeConversation prefers same locale and newest updatedAt', () => {
    const picked = pickResumeConversation(
      [
        {
          id: 'old-en',
          circleId: 'c1',
          locale: 'en',
          createdAt: '2026-08-01T00:00:00Z',
          updatedAt: '2026-08-01T00:00:00Z',
        },
        {
          id: 'es-thread',
          circleId: 'c1',
          locale: 'es',
          createdAt: '2026-08-10T00:00:00Z',
          updatedAt: '2026-08-10T12:00:00Z',
        },
        {
          id: 'new-en',
          circleId: 'c1',
          locale: 'en',
          createdAt: '2026-08-09T00:00:00Z',
          updatedAt: '2026-08-10T18:00:00Z',
        },
      ],
      'en',
    );
    expect(picked?.id).toBe('new-en');
    expect(pickResumeConversation([], 'en')).toBeNull();
    expect(
      pickResumeConversation(
        [
          {
            id: 'es-only',
            circleId: 'c1',
            locale: 'es',
            createdAt: '2026-08-10T00:00:00Z',
            updatedAt: '2026-08-10T00:00:00Z',
          },
        ],
        'en',
      ),
    ).toBeNull();
  });

  test('mapStoredMessagesToChatItems maps completed rows and skips pending', () => {
    const items = mapStoredMessagesToChatItems([
      {
        id: 'u1',
        conversationId: 'conv',
        role: 'user',
        status: 'completed',
        locale: 'en',
        message: 'Who still needs to contribute?',
        createdAt: '2026-08-10T12:00:00Z',
      },
      {
        id: 'a-pending',
        conversationId: 'conv',
        role: 'assistant',
        status: 'pending',
        locale: 'en',
        message: '',
        createdAt: '2026-08-10T12:00:01Z',
      },
      {
        id: 'a1',
        conversationId: 'conv',
        role: 'assistant',
        status: 'completed',
        locale: 'en',
        message: 'One person still needs to contribute.',
        responseType: 'answer',
        navigationSuggestions: [
          {
            actionId: 'view_round_status',
            reason: 'See round',
            assistantExecutable: false,
          },
        ],
        createdAt: '2026-08-10T12:00:02Z',
        completedAt: '2026-08-10T12:00:03Z',
      },
      {
        id: 'a-ref',
        conversationId: 'conv',
        role: 'assistant',
        status: 'completed',
        locale: 'en',
        message: 'I cannot release the payout.',
        responseType: 'refusal',
        createdAt: '2026-08-10T12:01:00Z',
        completedAt: '2026-08-10T12:01:01Z',
      },
    ]);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ role: 'user', message: 'Who still needs to contribute?' });
    expect(items[1].role).toBe('assistant');
    expect(items[1].isRefusal).toBe(false);
    expect(items[1].navigationSuggestions).toHaveLength(1);
    expect(items[1].navigationSuggestions?.[0].assistantExecutable).toBe(false);
    expect(items[2].isRefusal).toBe(true);
  });
});
