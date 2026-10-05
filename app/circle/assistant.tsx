import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type KeyboardEvent,
  type ListRenderItem,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import AssistantComposer from '@/components/AssistantComposer';
import {
  assistantApiLocale,
  mapStoredMessagesToChatItems,
  pickResumeConversation,
} from '@/lib/assistant/history';
import { hrefForAssistantAction } from '@/lib/assistant/navigation';
import {
  assistantConversationMemory,
  assistantTranscriptFailureKeepsConversation,
  buildAssistantSendOptions,
  didConsumeAssistantIntro,
  isAssistantUpgradeEntitlementError,
  readAssistantConversationMemory,
  type AssistantConversationMemory,
  shouldAnimateAssistantMessage,
  shouldRefreshAssistantEntitlements,
  type AssistantMessageSource,
} from '@/lib/assistant/presentation';
import {
  normalizeAssistantResponse,
  type NormalizedAssistantReply,
} from '@/lib/assistant/response';
import {
  assistantSendFailureKey,
  classifyAssistantSendFailure,
  createSendGuard,
  newPendingSend,
  pickRecoveredConversation,
  sendAssistantMessageWithWait,
  type PendingAssistantSend,
} from '@/lib/assistant/sendLifecycle';
import {
  ApiError,
  listAssistantConversations,
  listAssistantMessages,
  sendAiAssistantMessage,
} from '@/lib/api';
import { useAuthSession } from '@/lib/auth/authContext';
import { localizedNetworkErrorBody } from '@/lib/platform/networkErrors';
import {
  FLOATING_COMPOSER_RESTING_HEIGHT,
  floatingComposerBottomOffset,
  floatingComposerDockOffset,
  floatingComposerListPadding,
} from '@/lib/circles/chatKeyboard';
import { useEntitlements } from '@/lib/billing/entitlementsContext';
import {
  shouldApplyKeyboardGeometry,
  workspaceChromeLayoutStyle,
} from '@/lib/shared/workspaceKeyboardChrome';
import { colors, radii, shadows, spacing } from '@/lib/shared/theme';

type ChatItem = {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  responseType?: NormalizedAssistantReply['responseType'];
  isRefusal?: boolean;
  isIntro?: boolean;
  navigationSuggestions?: NormalizedAssistantReply['navigationSuggestions'];
  isError?: boolean;
  source?: AssistantMessageSource;
  /** User messages: waiting on the server, or failed and eligible for retry. */
  sendStatus?: 'sending' | 'failed';
  failureMessage?: string;
  failureRetryable?: boolean;
  /** Stable idempotency key and conversation for retrying this message. */
  pending?: PendingAssistantSend;
};

const PROMPT_KEYS = ['attention', 'ready', 'explainRound'] as const;
const WELCOME_ID = 'welcome';

function welcomeItem(message: string): ChatItem {
  return { id: WELCOME_ID, role: 'assistant', message, source: 'history' };
}

const AssistantMessageRow = memo(function AssistantMessageRow({
  item,
  circleId,
  onOpenSuggestion,
  onRetry,
}: {
  item: ChatItem;
  circleId?: string;
  onOpenSuggestion: (actionId: string) => void;
  onRetry: (localId: string) => void;
}) {
  const { t } = useTranslation(['assistant', 'common']);
  const animate = shouldAnimateAssistantMessage({
    source: item.source ?? 'history',
  });
  const row = (
    <View
      style={[styles.messageRow, item.role === 'user' && styles.messageRowUser]}
    >
      {item.role === 'assistant' ? (
        <View
          style={[
            styles.avatar,
            item.isRefusal && styles.avatarRefusal,
            item.isError && styles.avatarError,
          ]}
        >
          <FontAwesome
            name={item.isRefusal || item.isError ? 'info' : 'magic'}
            size={12}
            color={colors.onColor}
          />
        </View>
      ) : null}
      <View
        style={[
          styles.bubble,
          item.role === 'user'
            ? styles.userBubble
            : item.isRefusal
              ? styles.refusalBubble
              : item.isError
                ? styles.errorBubble
                : styles.assistantBubble,
        ]}
      >
        <Text
          style={[
            styles.messageText,
            item.role === 'user' && styles.userMessageText,
          ]}
        >
          {item.message}
        </Text>
        {item.sendStatus === 'sending' ? (
          <Text style={styles.sendingLabel}>{t('assistant:send.sending')}</Text>
        ) : null}
        {item.sendStatus === 'failed' ? (
          <View style={styles.sendFailure}>
            <Text style={styles.sendFailureText}>
              {item.failureMessage || t('assistant:send.notSent')}
            </Text>
            {item.failureRetryable ? (
              <Pressable
                style={styles.retryButton}
                onPress={() => onRetry(item.id)}
                accessibilityRole="button"
                accessibilityLabel={t('assistant:send.retryA11y')}
              >
                <FontAwesome name="refresh" size={11} color={colors.primaryDark} />
                <Text style={styles.retryButtonText}>
                  {t('assistant:send.retry')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {item.isRefusal ? (
          <Text style={styles.refusalLabel}>{t('assistant:refusalBadge')}</Text>
        ) : null}
        {item.isIntro ? (
          <Text style={styles.introLabel}>{t('assistant:introBadge')}</Text>
        ) : null}
        {item.navigationSuggestions &&
        item.navigationSuggestions.length > 0 &&
        circleId ? (
          <View style={styles.navChips}>
            {item.navigationSuggestions.map((suggestion) => {
              const target = hrefForAssistantAction(
                suggestion.actionId,
                circleId,
              );
              if (!target) return null;
              const navLabel = t(`assistant:nav.${suggestion.actionId}`, {
                defaultValue: target.fallbackLabel,
              });
              return (
                <Pressable
                  key={`${item.id}-${suggestion.actionId}`}
                  style={styles.navChip}
                  onPress={() => onOpenSuggestion(suggestion.actionId)}
                  accessibilityRole="button"
                  accessibilityLabel={navLabel}
                >
                  <Text style={styles.navChipText} numberOfLines={1}>
                    {navLabel}
                  </Text>
                  <FontAwesome
                    name="chevron-right"
                    size={10}
                    color={colors.primary}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );

  if (!animate) {
    return row;
  }

  return <Animated.View entering={FadeInDown.duration(180)}>{row}</Animated.View>;
});

export default function CircleAssistantScreen() {
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;
  const { session } = useAuthSession();
  const { entitlements, refreshEntitlements } = useEntitlements();
  const { t, i18n } = useTranslation(['assistant', 'common']);
  const token = session?.session.token;
  const insets = useSafeAreaInsets();
  const rootRef = useRef<View>(null);
  const listRef = useRef<FlatList<ChatItem>>(null);
  const historyRequestId = useRef(0);
  const sendGuard = useRef(createSendGuard()).current;
  const conversationIdRef = useRef<string | null>(null);
  const requestBudgetRef = useRef<number | null>(null);
  const itemsRef = useRef<ChatItem[]>([]);
  /** Last keyboard metrics. Used to re-measure after chrome collapses. */
  const keyboardMetricsRef = useRef<{ topY: number; height: number } | null>(null);

  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [conversationMemory, setConversationMemory] =
    useState<AssistantConversationMemory | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [composerLift, setComposerLift] = useState(0);
  const [composerHeight, setComposerHeight] = useState(
    FLOATING_COMPOSER_RESTING_HEIGHT,
  );
  const [items, setItems] = useState<ChatItem[]>([
    welcomeItem(''),
  ]);

  conversationIdRef.current = conversationId;
  itemsRef.current = items;

  const composerBottomPad =
    composerLift === 0
      ? Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0)
      : 8;

  const apiLocale = assistantApiLocale(
    i18n.resolvedLanguage || i18n.language || 'en',
  );
  const welcomeMessage = t('assistant:welcome.premium');
  const welcomeMessageRef = useRef(welcomeMessage);
  welcomeMessageRef.current = welcomeMessage;

  const showSuggestedPrompts =
    items.length === 1 && items[0]?.id === WELCOME_ID && !historyLoading;

  // Keep the local welcome bubble in sync with language / entitlement mode
  // only when we are not showing a loaded thread.
  useEffect(() => {
    setItems((current) => {
      if (current.length !== 1 || current[0]?.id !== WELCOME_ID) {
        return current;
      }
      if (current[0].message === welcomeMessage) {
        return current;
      }
      return [welcomeItem(welcomeMessage)];
    });
  }, [welcomeMessage]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [items.length, sending, historyLoading, scrollToEnd]);

  const remeasureComposerLift = useCallback(() => {
    const metrics = keyboardMetricsRef.current;
    if (metrics == null) {
      setComposerLift(0);
      return;
    }
    rootRef.current?.measureInWindow((_x, y, _w, h) => {
      const containerBottomY = y + h;
      setComposerLift(
        floatingComposerBottomOffset(
          containerBottomY,
          metrics.topY,
          metrics.height,
          Platform.OS,
        ),
      );
    });
  }, []);

  const applyKeyboardFrame = useCallback(
    (event: KeyboardEvent | null) => {
      const height = event?.endCoordinates.height;
      if (!event || !shouldApplyKeyboardGeometry(height)) {
        keyboardMetricsRef.current = null;
        setKeyboardVisible(false);
        setComposerLift(0);
        return;
      }

      keyboardMetricsRef.current = {
        topY: event.endCoordinates.screenY,
        height: event.endCoordinates.height,
      };
      setKeyboardVisible(true);
      requestAnimationFrame(() => {
        remeasureComposerLift();
      });
    },
    [remeasureComposerLift],
  );

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const changeEvent =
      Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';

    const showSub = Keyboard.addListener(showEvent, applyKeyboardFrame);
    const changeSub = Keyboard.addListener(changeEvent, applyKeyboardFrame);
    const hideSub = Keyboard.addListener(hideEvent, () => {
      applyKeyboardFrame(null);
    });

    return () => {
      showSub.remove();
      changeSub.remove();
      hideSub.remove();
    };
  }, [applyKeyboardFrame]);

  // Header collapses when the keyboard opens — re-measure after that layout.
  useEffect(() => {
    if (!keyboardVisible) return;
    const handle = requestAnimationFrame(() => {
      remeasureComposerLift();
    });
    return () => cancelAnimationFrame(handle);
  }, [keyboardVisible, remeasureComposerLift]);

  const dockBottom = floatingComposerDockOffset(
    composerLift,
    keyboardVisible,
  );
  const listBottomPadding = floatingComposerListPadding(
    composerHeight,
    dockBottom,
  );

  const loadHistory = useCallback(async () => {
    if (!token || !circleId) return;
    const requestId = ++historyRequestId.current;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const listed = await listAssistantConversations(token, circleId);
      if (requestId !== historyRequestId.current) return;
      requestBudgetRef.current =
        typeof listed.requestBudgetSeconds === 'number'
          ? listed.requestBudgetSeconds
          : null;

      const resume = pickResumeConversation(
        listed.conversations || [],
        apiLocale,
      );
      if (!resume) {
        setConversationId(null);
        setConversationMemory(null);
        setItems([welcomeItem(welcomeMessageRef.current)]);
        return;
      }

      setConversationId(resume.id);
      let thread: Awaited<ReturnType<typeof listAssistantMessages>>;
      try {
        thread = await listAssistantMessages(token, circleId, resume.id);
      } catch {
        if (requestId !== historyRequestId.current) return;
        if (assistantTranscriptFailureKeepsConversation(resume.id)) {
          setHistoryError(t('assistant:errors.historyLoadContinue'));
          return;
        }
        setConversationId(null);
        setConversationMemory(null);
        setHistoryError(t('assistant:errors.historyLoad'));
        setItems([welcomeItem(welcomeMessageRef.current)]);
        return;
      }
      if (requestId !== historyRequestId.current) return;

      const mapped = mapStoredMessagesToChatItems(thread.messages || []).map(
        (item) => ({ ...item, source: 'history' as const }),
      );
      const serverMemory = readAssistantConversationMemory(
        thread.conversationMemory,
      );
      setConversationMemory(
        serverMemory ??
          (mapped.length > 0 ? assistantConversationMemory(mapped.length) : null),
      );
      setConversationId(resume.id);
      if (mapped.length === 0) {
        setItems([welcomeItem(welcomeMessageRef.current)]);
      } else {
        setItems(mapped);
      }
    } catch {
      if (requestId !== historyRequestId.current) return;
      setConversationId(null);
      setConversationMemory(null);
      setHistoryError(t('assistant:errors.historyLoad'));
      setItems([welcomeItem(welcomeMessageRef.current)]);
    } finally {
      if (requestId === historyRequestId.current) {
        setHistoryLoading(false);
      }
    }
  }, [token, circleId, apiLocale, t]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function startNewChat() {
    historyRequestId.current += 1;
    setConversationId(null);
    setConversationMemory(null);
    setHistoryError(null);
    setUpgradeRequired(false);
    setItems([welcomeItem(welcomeMessage)]);
  }

  function openSuggestion(actionId: string) {
    if (!circleId) return;
    const target = hrefForAssistantAction(actionId, circleId);
    if (!target) return;
    router.push(target.href);
  }

  async function recoverConversation(
    pending: PendingAssistantSend,
  ): Promise<string | null> {
    if (!token || !circleId) return null;
    try {
      const listed = await listAssistantConversations(token, circleId);
      return pickRecoveredConversation(
        listed.conversations || [],
        apiLocale,
        pending.startedAtMs,
      );
    } catch {
      return null;
    }
  }

  async function submit(
    initial: PendingAssistantSend,
    mode: 'new' | 'retry',
  ) {
    if (!token || !circleId) return;
    // Synchronous: a second tap in the same frame never reaches the network.
    if (!sendGuard.tryAcquire()) return;
    setSending(true);
    setUpgradeRequired(false);
    setHistoryError(null);
    let pending = initial;
    try {
      if (mode === 'new' && !pending.conversationId) {
        // An earlier first message may have lost its response. Rejoin the
        // conversation the server created instead of forking a new thread.
        const unresolved = itemsRef.current.find(
          (item) =>
            item.sendStatus === 'failed' &&
            item.pending &&
            !item.pending.conversationId,
        )?.pending;
        if (unresolved) {
          const recovered = await recoverConversation(unresolved);
          if (recovered) {
            conversationIdRef.current = recovered;
            setConversationId(recovered);
            pending = { ...pending, conversationId: recovered };
          }
        }
      }
      const working = pending;
      setItems((current) =>
        mode === 'new'
          ? [
              ...current,
              {
                id: working.localId,
                role: 'user',
                message: working.text,
                source: 'live',
                sendStatus: 'sending',
                pending: working,
              },
            ]
          : current.map((item) =>
              item.id === working.localId
                ? { ...item, sendStatus: 'sending', failureMessage: undefined }
                : item,
            ),
      );

      const raw = await sendAssistantMessageWithWait(
        {
          send: (request) =>
            sendAiAssistantMessage(
              token,
              circleId,
              request.message,
              apiLocale,
              {
                conversationId: request.conversationId,
                idempotencyKey: request.idempotencyKey,
                timeoutMs: request.timeoutMs,
              },
            ),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          now: () => Date.now(),
        },
        working,
        requestBudgetRef.current,
      );
      const reply = normalizeAssistantResponse(raw);
      if (reply.conversationId) {
        conversationIdRef.current = reply.conversationId;
        setConversationId(reply.conversationId);
      }
      setConversationMemory((current) =>
        assistantConversationMemory((current?.savedMessageCount ?? 0) + 2),
      );

      const usedIntro = didConsumeAssistantIntro({
        hasAiAssistant: entitlements.capabilities.aiAssistant,
        aiIntroAvailable: entitlements.capabilities.aiIntroAvailable,
      });

      setItems((current) => [
        ...current.map((item) =>
          item.id === working.localId
            ? { ...item, sendStatus: undefined, pending: undefined }
            : item,
        ),
        {
          id: reply.messageId || `assistant-${Date.now()}`,
          role: 'assistant',
          message: reply.message,
          responseType: reply.responseType,
          isRefusal: reply.isRefusal,
          isIntro: usedIntro,
          navigationSuggestions: reply.navigationSuggestions,
          source: 'live',
        },
      ]);
      if (
        shouldRefreshAssistantEntitlements({
          usedIntro,
          requiresUpgrade: false,
        })
      ) {
        await refreshEntitlements();
      }
    } catch (error) {
      const failure = classifyAssistantSendFailure(error);
      const requiresUpgrade = isAssistantUpgradeEntitlementError({
        status: error instanceof ApiError ? error.status : undefined,
        hasUpgradePayload: Boolean(
          error instanceof ApiError &&
            error.payload &&
            typeof error.payload === 'object' &&
            'upgrade' in (error.payload as object),
        ),
      });
      setUpgradeRequired(requiresUpgrade);
      // A first message may have been created and answered by the server even
      // though the response never arrived. Find that conversation so the next
      // question continues it and Retry replays the stored answer.
      let knownConversationId = pending.conversationId;
      if (!knownConversationId && !conversationIdRef.current) {
        knownConversationId = await recoverConversation(pending);
        if (knownConversationId) {
          conversationIdRef.current = knownConversationId;
          setConversationId(knownConversationId);
        }
      }
      const failureKey = assistantSendFailureKey(failure);
      const failureMessage = requiresUpgrade
        ? t('assistant:upgrade.proRequired')
        : failureKey
          ? t(failureKey)
          : localizedNetworkErrorBody(error, t);
      const failedPending = {
        ...pending,
        conversationId: knownConversationId,
      };
      setItems((current) =>
        current.map((item) =>
          item.id === pending.localId
            ? {
                ...item,
                sendStatus: 'failed',
                failureMessage,
                failureRetryable: failure.retryable && !requiresUpgrade,
                pending: failedPending,
              }
            : item,
        ),
      );
      if (
        shouldRefreshAssistantEntitlements({
          usedIntro: false,
          requiresUpgrade,
        })
      ) {
        await refreshEntitlements();
      }
    } finally {
      sendGuard.release();
      setSending(false);
    }
  }

  const submitRef = useRef(submit);
  submitRef.current = submit;

  async function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed || !token || !circleId || historyLoading) return;
    if (sendGuard.isHeld()) return;
    await submit(newPendingSend(trimmed, conversationIdRef.current), 'new');
  }

  // Stable identity: rows are memoized and must not capture stale closures.
  const retrySend = useCallback((localId: string) => {
    const item = itemsRef.current.find((entry) => entry.id === localId);
    if (!item?.pending || item.sendStatus !== 'failed') return;
    void submitRef.current(item.pending, 'retry');
  }, []);

  const suggestedPrompts = PROMPT_KEYS.map((key) => ({
    key,
    text: t(`assistant:prompts.${key}`),
  }));

  const renderItem: ListRenderItem<ChatItem> = useCallback(
    ({ item }) => (
      <AssistantMessageRow
        item={item}
        circleId={circleId}
        onOpenSuggestion={openSuggestion}
        onRetry={retrySend}
      />
    ),
    [circleId, retrySend],
  );

  const listHeader = (
    <>
      <View style={styles.contextCard}>
        <View style={styles.contextIcon}>
          <FontAwesome name="shield" size={16} color={colors.primaryDark} />
        </View>
        <View style={styles.contextText}>
          <Text style={styles.contextTitle}>{t('assistant:contextTitle')}</Text>
          <Text style={styles.contextCopy}>{t('assistant:contextCopy')}</Text>
        </View>
      </View>
      {historyLoading ? (
        <View style={styles.thinking}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.thinkingText}>
            {t('assistant:history.loading')}
          </Text>
        </View>
      ) : null}
      {historyError && !historyLoading ? (
        <View style={styles.historyErrorCard}>
          <Text style={styles.historyErrorText}>{historyError}</Text>
        </View>
      ) : null}
      {conversationMemory && conversationMemory.savedMessageCount > 0 ? (
        <View style={styles.historyErrorCard}>
          <Text style={styles.historyErrorText}>
            {t(
              conversationMemory.messagesSavedButNotSent > 0
                ? 'assistant:memory.beyond'
                : 'assistant:memory.within',
              {
                saved: conversationMemory.savedMessageCount,
                sent: conversationMemory.messagesIncludedAtCap,
                omitted: conversationMemory.messagesSavedButNotSent,
              },
            )}
          </Text>
        </View>
      ) : null}
    </>
  );

  const listFooter = (
    <>
      {showSuggestedPrompts ? (
        <View style={styles.prompts}>
          {suggestedPrompts.map((prompt) => (
            <Pressable
              key={prompt.key}
              style={styles.prompt}
              onPress={() => void send(prompt.text)}
              disabled={historyLoading || sending}
            >
              <Text style={styles.promptText}>{prompt.text}</Text>
              <FontAwesome name="arrow-right" size={11} color={colors.primary} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {sending ? (
        <View style={styles.thinking}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.thinkingText}>{t('assistant:thinking')}</Text>
        </View>
      ) : null}
      {upgradeRequired ? (
        <View style={styles.upgradeCard}>
          <View style={styles.upgradeIcon}>
            <FontAwesome name="diamond" size={16} color={colors.premiumGold} />
          </View>
          <View style={styles.upgradeText}>
            <Text style={styles.upgradeTitle}>{t('assistant:upgrade.title')}</Text>
            <Text style={styles.upgradeCopy}>{t('assistant:upgrade.body')}</Text>
          </View>
          <Pressable
            style={styles.upgradeButton}
            onPress={() => router.push('/subscription' as Href)}
            accessibilityRole="button"
            accessibilityLabel={t('assistant:upgrade.cta')}
          >
            <Text style={styles.upgradeButtonText}>
              {t('assistant:upgrade.cta')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );

  // Same floating composer contract as circle group/private chat:
  // flex column, list owns scroll, dock lifts by measured keyboard overlap.
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View
        ref={rootRef}
        style={styles.screen}
        collapsable={false}
        onLayout={() => {
          if (keyboardMetricsRef.current != null) {
            remeasureComposerLift();
          }
        }}
      >
        <View
          style={[
            styles.header,
            workspaceChromeLayoutStyle(keyboardVisible),
          ]}
          collapsable={false}
        >
          <Pressable
            onPress={() => router.back()}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={t('assistant:backA11y')}
          >
            <FontAwesome
              name="chevron-left"
              size={18}
              color={colors.textStrong}
            />
          </Pressable>
          <View style={styles.headerTitle}>
            <View style={styles.sparkle}>
              <FontAwesome name="magic" size={13} color={colors.onColor} />
            </View>
            <View>
              <Text style={styles.title}>{t('assistant:title')}</Text>
              <Text style={styles.subtitle}>{t('assistant:subtitle')}</Text>
            </View>
          </View>
          <Pressable
            onPress={startNewChat}
            style={styles.newChatButton}
            accessibilityRole="button"
            accessibilityLabel={t('assistant:history.newChatA11y')}
            disabled={historyLoading || sending}
          >
            <FontAwesome name="plus" size={12} color={colors.primaryDark} />
            <Text style={styles.newChatText}>
              {t('assistant:history.newChat')}
            </Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          extraData={`${sending}:${historyLoading}:${upgradeRequired}`}
          style={styles.messageList}
          contentContainerStyle={[
            styles.messages,
            { paddingBottom: 16 + listBottomPadding },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
        />

        {/* Floating assistant console — rides above the keyboard. */}
        <View
          style={[styles.composerDock, { bottom: dockBottom }]}
          onLayout={(e) => {
            const next = Math.ceil(e.nativeEvent.layout.height);
            if (next > 0 && next !== composerHeight) {
              setComposerHeight(next);
            }
          }}
        >
          <AssistantComposer
            onSend={send}
            placeholder={t('assistant:composerPlaceholder')}
            sendA11y={t('assistant:sendA11y')}
            sending={sending}
            disabled={upgradeRequired || historyLoading}
            bottomPad={composerBottomPad}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sendingLabel: {
    marginTop: 4,
    fontSize: 11,
    color: colors.onColor,
    opacity: 0.8,
  },
  sendFailure: {
    marginTop: 6,
    gap: 6,
  },
  sendFailureText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.onColor,
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  screen: { flex: 1, backgroundColor: colors.premiumCanvas, minHeight: 0 },
  safeArea: { flex: 1, backgroundColor: colors.premiumCanvas },
  messageList: { flex: 1, minHeight: 0 },
  header: {
    minHeight: 68,
    paddingHorizontal: spacing.screenX,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryBorder,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  headerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 12,
  },
  sparkle: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  title: { color: colors.textStrong, fontSize: 15, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  planDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.warning },
  planDotPremium: { backgroundColor: colors.success },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  newChatText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
  },
  messages: { padding: spacing.screenX, paddingBottom: 16 },
  historyErrorCard: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: 12,
    marginBottom: 14,
  },
  historyErrorText: {
    color: colors.dangerText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  contextCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.premiumLavenderSoft,
    borderRadius: 18,
    padding: 14,
    marginBottom: 20,
  },
  contextIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  contextText: { flex: 1 },
  contextTitle: { color: colors.primaryDark, fontWeight: '900', fontSize: 13 },
  contextCopy: {
    color: colors.primaryDark,
    opacity: 0.72,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 14,
  },
  messageRowUser: { justifyContent: 'flex-end' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRefusal: { backgroundColor: colors.warning },
  avatarError: { backgroundColor: colors.danger },
  bubble: { maxWidth: '82%', paddingHorizontal: 15, paddingVertical: 12 },
  assistantBubble: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    ...shadows.small,
  },
  refusalBubble: {
    backgroundColor: colors.warningSoft,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  errorBubble: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  userBubble: {
    backgroundColor: colors.primaryDark,
    borderRadius: 18,
    borderBottomRightRadius: 5,
    width: '82%',
  },
  messageText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  userMessageText: { color: colors.onColor },
  introLabel: {
    color: colors.primary,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: 8,
  },
  refusalLabel: {
    color: colors.warning,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginTop: 8,
  },
  navChips: { marginTop: 10, gap: 6 },
  navChip: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  navChipText: {
    flex: 1,
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
  },
  prompts: { gap: 9, marginLeft: 36, marginBottom: 16 },
  prompt: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: 'rgba(255,255,255,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  promptText: { flex: 1, color: colors.primaryDark, fontWeight: '700', fontSize: 12 },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginLeft: 36,
    marginBottom: 14,
  },
  thinkingText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  upgradeCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: 20,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 4,
  },
  upgradeIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeText: { flex: 1 },
  upgradeTitle: { color: colors.onColor, fontWeight: '900', fontSize: 13 },
  upgradeCopy: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  upgradeButton: {
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  upgradeButtonText: { color: colors.primaryDark, fontWeight: '900', fontSize: 12 },
  composerDock: {
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 20,
    elevation: 12,
  },
  composer: {
    paddingHorizontal: 16,
    paddingTop: 6,
    backgroundColor: 'transparent',
  },
  composerPill: {
    minHeight: 56,
    maxHeight: 118,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: colors.card,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    ...shadows.medium,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 106,
    paddingHorizontal: 0,
    paddingVertical: 10,
    color: colors.textStrong,
    fontSize: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.primarySoft,
    opacity: 1,
  },
});
