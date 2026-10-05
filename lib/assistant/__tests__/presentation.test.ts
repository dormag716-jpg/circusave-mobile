import { readFileSync } from 'fs';
import path from 'path';

import {
  assistantComposerOwnsDraft,
  assistantMessageRowUnchanged,
  assistantThreadListKind,
  assistantConversationMemory,
  assistantTranscriptFailureKeepsConversation,
  buildAssistantSendOptions,
  readAssistantConversationMemory,
  assistantAllowanceErrorKey,
  didConsumeAssistantIntro,
  isAssistantUpgradeEntitlementError,
  shouldAnimateAssistantMessage,
  shouldRefreshAssistantEntitlements,
  shouldReloadAssistantHistory,
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

  it('does not reload history when only welcome copy or entitlements change', () => {
    const identity = {
      token: 'tok',
      circleId: 'circle-1',
      locale: 'en',
    };
    expect(
      shouldReloadAssistantHistory({
        previous: identity,
        next: identity,
      }),
    ).toBe(false);
    expect(
      shouldReloadAssistantHistory({
        previous: identity,
        next: { ...identity, token: 'tok-2' },
      }),
    ).toBe(true);
    expect(
      shouldReloadAssistantHistory({
        previous: identity,
        next: { ...identity, circleId: 'circle-2' },
      }),
    ).toBe(true);
    expect(
      shouldReloadAssistantHistory({
        previous: identity,
        next: { ...identity, locale: 'es' },
      }),
    ).toBe(true);
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
    expect(
      assistantAllowanceErrorKey({ errorCode: 'AI_DAILY_REQUEST_LIMIT' }),
    ).toBe('assistant:errors.allowanceDaily');
    expect(
      assistantAllowanceErrorKey({ errorCode: 'AI_MONTHLY_TOKEN_LIMIT' }),
    ).toBe('assistant:errors.allowanceMonthly');
    expect(assistantAllowanceErrorKey({ errorCode: 'AI_GLOBAL_COST_LIMIT' })).toBe(
      null,
    );
    expect(assistantAllowanceErrorKey(null)).toBe(null);
  });

  it('distinguishes the saved transcript from the model window', () => {
    const within = assistantConversationMemory(4);
    expect(within.savedMessageCount).toBe(4);
    expect(within.messagesIncludedAtCap).toBe(4);
    expect(within.messagesSavedButNotSent).toBe(0);
    expect(within.authoritativeFacts).toBe('current_circle_context');

    const beyond = assistantConversationMemory(30);
    expect(beyond.messagesIncludedAtCap).toBe(24);
    expect(beyond.messagesSavedButNotSent).toBe(6);
    expect(readAssistantConversationMemory(beyond)?.promptVersion).toBeNull();
    expect(readAssistantConversationMemory({ savedMessageCount: 'nope' })).toBe(
      null,
    );
  });

  it('keeps a known conversation when the transcript fails to load', () => {
    expect(assistantTranscriptFailureKeepsConversation('conv-123')).toBe(true);
    expect(assistantTranscriptFailureKeepsConversation(null)).toBe(false);
    expect(assistantTranscriptFailureKeepsConversation('  ')).toBe(false);
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

  it('keeps assistant history load independent of welcome copy', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', '..', 'app', 'circle', 'assistant.tsx'),
      'utf8',
    );
    expect(source).toMatch(/welcomeMessageRef\.current = welcomeMessage/);
    expect(source).toMatch(/\[token, circleId, apiLocale, t\]/);
    expect(source).not.toMatch(
      /\[token, circleId, apiLocale, welcomeMessage, t\]/,
    );
  });
});
