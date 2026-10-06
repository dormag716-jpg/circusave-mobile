import {
  createHandledResponseTracker,
  resolveNotificationTarget,
} from '../notificationTarget';

const CIRCLE = 'c_test_circle_1';

/** The default payload the backend builds for every non-chat push. */
function serverPush(type: string, link: string, extra: Record<string, unknown> = {}) {
  return {
    link,
    circle_id: CIRCLE,
    member_id: 'm_1',
    notification_type: type,
    ...extra,
  };
}

describe('resolveNotificationTarget: server pushes without a screen field', () => {
  // [type, link the backend sends, expected tab]
  const cases: [string, string, string | undefined][] = [
    ['payment_submitted', `/groups/${CIRCLE}/round`, 'round'],
    ['payment_confirmed', `/groups/${CIRCLE}/round`, 'round'],
    ['payment_rejected', `/groups/${CIRCLE}/round`, 'round'],
    ['payment_reminder', `/groups/${CIRCLE}/round`, 'round'],
    ['payment_instructions_updated', `/groups/${CIRCLE}/round`, 'round'],
    ['round_started', `/groups/${CIRCLE}/round`, 'round'],
    ['round_completed', `/groups/${CIRCLE}/round`, 'round'],
    ['payout_sent', `/groups/${CIRCLE}/round`, 'round'],
    ['join_request_pending', `/groups/${CIRCLE}/members`, 'people'],
    ['join_request_approved', `/groups/${CIRCLE}`, undefined],
    ['circle_invite', `/groups/${CIRCLE}`, undefined],
  ];

  it.each(cases)('%s opens the circle workspace', (type, link, tab) => {
    expect(resolveNotificationTarget(serverPush(type, link))).toEqual({
      screen: 'workspace',
      circleId: CIRCLE,
      tab,
      conversationId: undefined,
    });
  });

  it('uses the type to choose a tab when the link names none', () => {
    expect(
      resolveNotificationTarget(serverPush('payment_submitted', `/groups/${CIRCLE}`)),
    ).toMatchObject({ tab: 'round' });
  });

  it('prefers the tab in the link over the type default', () => {
    expect(
      resolveNotificationTarget(
        serverPush('payment_submitted', `/groups/${CIRCLE}/members`),
      ),
    ).toMatchObject({ tab: 'people' });
  });

  it('still opens the circle for a type it does not know', () => {
    expect(
      resolveNotificationTarget(serverPush('brand_new_type', `/groups/${CIRCLE}`)),
    ).toEqual({
      screen: 'workspace',
      circleId: CIRCLE,
      tab: undefined,
      conversationId: undefined,
    });
  });

  it('falls back to the circle id in the link when circle_id is missing', () => {
    expect(
      resolveNotificationTarget({
        link: `/groups/${CIRCLE}/round`,
        notification_type: 'round_started',
      }),
    ).toMatchObject({ circleId: CIRCLE, tab: 'round' });
  });
});

describe('resolveNotificationTarget: payloads that already worked', () => {
  it('keeps the chat push exactly as sent (screen, circle, conversation, no tab)', () => {
    expect(
      resolveNotificationTarget({
        screen: 'workspace',
        circleId: CIRCLE,
        conversationId: 'conv_9',
        notification_type: 'chat_message',
      }),
    ).toEqual({ screen: 'workspace', circleId: CIRCLE, conversationId: 'conv_9' });
  });

  it('keeps the local test notification target', () => {
    expect(
      resolveNotificationTarget({ screen: 'workspace', circleId: CIRCLE }),
    ).toEqual({ screen: 'workspace', circleId: CIRCLE, conversationId: undefined });
  });

  it('routes a chat type without a screen to the chat tab and reads the conversation from the link', () => {
    expect(
      resolveNotificationTarget({
        circle_id: CIRCLE,
        notification_type: 'chat_message',
        link: `/groups/${CIRCLE}/chat?conversationId=conv_7`,
      }),
    ).toEqual({
      screen: 'workspace',
      circleId: CIRCLE,
      tab: 'chat',
      conversationId: 'conv_7',
    });
  });

  it('keeps swap_request on the people tab', () => {
    expect(
      resolveNotificationTarget({ circleId: CIRCLE, type: 'swap_request' }),
    ).toMatchObject({ screen: 'workspace', tab: 'people' });
  });
});

describe('resolveNotificationTarget: input it must not follow', () => {
  it.each([
    ['no data', null],
    ['empty data', {}],
    ['no circle anywhere', { notification_type: 'payment_submitted' }],
    ['a non-string circle id', { circle_id: 42, notification_type: 'round_started' }],
    ['a blank circle id', { circle_id: '   ' }],
    ['a circle id with path characters', { circle_id: '../../login' }],
    ['a circle id with a query', { circle_id: 'c_1?tab=x' }],
    ['a circle id that is too long', { circle_id: 'c'.repeat(65) }],
    ['a link that is not a group link', { link: '/settings/security' }],
  ])('returns null for %s', (_label, data) => {
    expect(resolveNotificationTarget(data as Record<string, unknown> | null)).toBeNull();
  });

  it('ignores an unknown tab name in the link', () => {
    const target = resolveNotificationTarget(
      serverPush('brand_new_type', `/groups/${CIRCLE}/admin`),
    );
    expect(target?.circleId).toBe(CIRCLE);
    expect(target?.tab).toBeUndefined();
  });
});

describe('createHandledResponseTracker', () => {
  it('accepts a response once and rejects repeats', () => {
    const tracker = createHandledResponseTracker();
    expect(tracker.markHandled('a')).toBe(true);
    expect(tracker.markHandled('a')).toBe(false);
    expect(tracker.markHandled('b')).toBe(true);
  });

  it('forgets the oldest key past its limit', () => {
    const tracker = createHandledResponseTracker(2);
    tracker.markHandled('a');
    tracker.markHandled('b');
    tracker.markHandled('c');
    expect(tracker.markHandled('a')).toBe(true);
    expect(tracker.markHandled('c')).toBe(false);
  });
});
