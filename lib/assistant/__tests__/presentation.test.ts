import {
  assistantComposerOwnsDraft,
  assistantMessageRowUnchanged,
  assistantThreadListKind,
  buildAssistantSendOptions,
  didConsumeAssistantIntro,
  isAssistantUpgradeEntitlementError,
  shouldAnimateAssistantMessage,
  shouldRefreshAssistantEntitlements,
} from '../presentation';

describe('Susu AI presentation', () => {
  it('keeps the composer draft isolated from message-row renders', () => {
    expect(assistantComposerOwnsDraft()).toBe(true);
    expect(
      assistantMessageRowUnchanged(
        { id: 'm1', message: 'Hello', isRefusal: false },
        { id: 'm1', message: 'Hello', isRefusal: false },
      ),
    ).toBe(true);
  });

  it('does not animate hydrated history rows', () => {
    expect(shouldAnimateAssistantMessage({ source: 'history' })).toBe(false);
    expect(shouldAnimateAssistantMessage({ source: 'live' })).toBe(true);
  });

  it('uses virtualized rendering for long histories', () => {
    expect(assistantThreadListKind()).toBe('virtualized');
  });

  it('does not refresh entitlements on an ordinary successful reply', () => {
    expect(
      shouldRefreshAssistantEntitlements({
        usedIntro: false,
        requiresUpgrade: false,
      }),
    ).toBe(false);
  });

  it('refreshes entitlements when intro is consumed or upgrade is required', () => {
    expect(
      didConsumeAssistantIntro({
        hasAiAssistant: false,
        aiIntroAvailable: true,
      }),
    ).toBe(true);
    expect(
      shouldRefreshAssistantEntitlements({
        usedIntro: true,
        requiresUpgrade: false,
      }),
    ).toBe(true);
    expect(
      isAssistantUpgradeEntitlementError({
        status: 403,
        hasUpgradePayload: true,
      }),
    ).toBe(true);
    expect(
      shouldRefreshAssistantEntitlements({
        usedIntro: false,
        requiresUpgrade: true,
      }),
    ).toBe(true);
    expect(
      isAssistantUpgradeEntitlementError({
        status: 403,
        hasUpgradePayload: false,
      }),
    ).toBe(false);
  });

  it('preserves conversationId and Idempotency-Key on send', () => {
    const withId = buildAssistantSendOptions('conv-123');
    expect(withId.conversationId).toBe('conv-123');
    expect(withId.idempotencyKey.startsWith('m-ai-')).toBe(true);
    expect(withId.idempotencyKey.length).toBeGreaterThanOrEqual(8);
    expect(withId.idempotencyKey.length).toBeLessThanOrEqual(128);

    const fresh = buildAssistantSendOptions(null);
    expect(fresh.conversationId).toBeNull();
    expect(fresh.idempotencyKey).not.toBe(withId.idempotencyKey);
  });
});
