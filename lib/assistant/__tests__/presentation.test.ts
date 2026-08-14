import { readFileSync } from 'fs';
import path from 'path';

import {
  assistantComposerOwnsDraft,
  assistantMessageRowUnchanged,
  assistantThreadListKind,
  buildAssistantSendOptions,
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
