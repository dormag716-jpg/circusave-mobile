import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
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
  type LayoutChangeEvent,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
  assistantAllowanceResetPhrase,
  readAssistantConversationMemory,
  type AssistantConversationMemory,
  shouldAnimateAssistantMessage,
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
import {
  FLOATING_COMPOSER_RESTING_HEIGHT,
  floatingComposerBottomOffset,
  floatingComposerDockOffset,
  floatingComposerListPadding,
} from '@/lib/circles/chatKeyboard';
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
        {splitMessageParagraphs(item.message).map((paragraph, index) => (
          <Text
            key={index}
            style={[
              styles.messageText,
              index > 0 && styles.messageParagraph,
              item.role === 'user' && styles.userMessageText,
            ]}
          >
            {paragraph}
          </Text>
        ))}
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

export type CircleAssistantPresentation = 'page' | 'sheet';

/** How close to the end (px) still counts as "reading the newest message". */
const SCROLL_FOLLOW_THRESHOLD = 120;

export function CircleAssistantPanel({
  circleId,
  onClose,
  presentation = 'page',
}: {
  circleId?: string;
  onClose?: () => void;
  presentation?: CircleAssistantPresentation;
}) {
  const { session } = useAuthSession();
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

  // True while the reader is at (or near) the bottom of the thread. New rows,
  // a failure message and the Retry button all change the content height after
  // the row is rendered, and the viewport changes when the keyboard opens or
  // closes, so the list follows both. When the reader scrolls up (a drag or
  // fling, not our own scroll) the follow pauses.
  const stickToBottomRef = useRef(true);
  const contentHeightRef = useRef(0);
  const viewportHeightRef = useRef(0);

  // FlatList.scrollToEnd lines the last row's bottom edge up with the viewport
  // and ignores the list's bottom padding, which parks the newest message
  // under the composer. Scroll to the measured end of the content instead.
  const scrollToMeasuredEnd = useCallback((animated: boolean) => {
    const offset = Math.max(
      0,
      contentHeightRef.current - viewportHeightRef.current,
    );
    listRef.current?.scrollToOffset({ offset, animated });
  }, []);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollToMeasuredEnd(true));
  }, [scrollToMeasuredEnd]);

  // Not animated: an animated scroll would be seen by the scroll handler as
  // "far from the end" while the content is still growing.
  const followTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followContentSize = useCallback(() => {
    if (!stickToBottomRef.current) return;
    requestAnimationFrame(() => scrollToMeasuredEnd(false));
    // A second pass once the sheet and keyboard have finished moving.
    if (followTimerRef.current) clearTimeout(followTimerRef.current);
    followTimerRef.current = setTimeout(() => {
      if (stickToBottomRef.current) scrollToMeasuredEnd(false);
    }, 260);
  }, [scrollToMeasuredEnd]);

  const onListContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = height;
      followContentSize();
    },
    [followContentSize],
  );

  const onListLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeightRef.current = event.nativeEvent.layout.height;
      followContentSize();
    },
    [followContentSize],
  );

  useEffect(
    () => () => {
      if (followTimerRef.current) clearTimeout(followTimerRef.current);
    },
    [],
  );

  // Only a finger drag can pause the follow. Scroll events caused by the list
  // growing or by our own scrollToEnd are ignored.
  const userDraggingRef = useRef(false);

  const markUserDrag = useCallback(() => {
    userDraggingRef.current = true;
  }, []);

  const trackBottomDistance = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!userDraggingRef.current) return;
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distance =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      stickToBottomRef.current = distance < SCROLL_FOLLOW_THRESHOLD;
    },
    [],
  );

  const endUserDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      trackBottomDistance(event);
      userDraggingRef.current = false;
    },
    [trackBottomDistance],
  );

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
    setItems([welcomeItem(welcomeMessage)]);
  }

  function openSuggestion(actionId: string) {
    if (!circleId) return;
    const target = hrefForAssistantAction(actionId, circleId);
    if (!target) return;
    if (presentation === 'sheet' && onClose) {
      onClose();
    }
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
          navigationSuggestions: reply.navigationSuggestions,
          source: 'live',
        },
      ]);
    } catch (error) {
      const failure = classifyAssistantSendFailure(error);
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
      const resetKind =
        failure.kind === 'allowance_daily'
          ? 'daily'
          : failure.kind === 'allowance_monthly'
            ? 'monthly'
            : null;
      const resetPhrase =
        resetKind && error instanceof ApiError
          ? assistantAllowanceResetPhrase(error.payload, resetKind, apiLocale)
          : null;
      // The "...At" copy names when the allowance refills; without a time from
      // the server the plain copy ("tomorrow" / "next month") is used.
      const failureMessage = resetPhrase
        ? t(`${failureKey}At`, { when: resetPhrase })
        : t(failureKey);
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
                failureRetryable: failure.retryable,
                pending: failedPending,
              }
            : item,
        ),
      );
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
    stickToBottomRef.current = true;
    await submit(newPendingSend(trimmed, conversationIdRef.current), 'new');
  }

  // Stable identity: rows are memoized and must not capture stale closures.
  const retrySend = useCallback((localId: string) => {
    const item = itemsRef.current.find((entry) => entry.id === localId);
    if (!item?.pending || item.sendStatus !== 'failed') return;
    stickToBottomRef.current = true;
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
      {presentation === 'sheet' ? null : (
      <View style={styles.contextCard}>
        <View style={styles.contextIcon}>
          <FontAwesome name="shield" size={16} color={colors.primaryDark} />
        </View>
        <View style={styles.contextText}>
          <Text style={styles.contextTitle}>{t('assistant:contextTitle')}</Text>
          <Text style={styles.contextCopy}>{t('assistant:contextCopy')}</Text>
        </View>
      </View>
      )}
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
        <View style={styles.memoryNoticeCard}>
          <Text style={styles.memoryNoticeText}>
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
    </>
  );

  // Same floating composer contract as circle group/private chat:
  // flex column, list owns scroll, dock lifts by measured keyboard overlap.
  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        presentation === 'sheet' && styles.sheetSafeArea,
      ]}
      edges={presentation === 'sheet' ? ['bottom'] : ['top']}
    >
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
            // The page collapses its header for the keyboard; the sheet keeps it so
            // Close and New chat stay reachable while typing.
            workspaceChromeLayoutStyle(keyboardVisible && presentation !== 'sheet'),
          ]}
          collapsable={false}
        >
          <Pressable
            onPress={() => {
              if (onClose) onClose();
              else router.back();
            }}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={
              presentation === 'sheet'
                ? t('common:closeDialog', { defaultValue: t('assistant:backA11y') })
                : t('assistant:backA11y')
            }
          >
            <FontAwesome
              name={presentation === 'sheet' ? 'times' : 'chevron-left'}
              size={18}
              color={colors.textStrong}
            />
          </Pressable>
          <View style={styles.headerTitle}>
            <View style={styles.sparkle}>
              <FontAwesome name="magic" size={13} color={colors.onColor} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title} numberOfLines={2}>
                {t('assistant:title')}
              </Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                {t('assistant:subtitle')}
              </Text>
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

        {presentation === 'sheet' ? (
          // Pinned so the "cannot move money" limit stays visible however long the
          // conversation gets; the page version keeps it as the list's first card.
          <View
            style={styles.pinnedNote}
            accessible
            accessibilityLabel={`${t('assistant:contextTitle')}. ${t('assistant:contextCopy')}`}
          >
            <FontAwesome name="shield" size={13} color={colors.primaryDark} />
            <Text style={styles.pinnedNoteText} numberOfLines={3}>
              {t('assistant:contextCopy')}
            </Text>
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          extraData={`${sending}:${historyLoading}`}
          style={styles.messageList}
          contentContainerStyle={[
            styles.messages,
            { paddingBottom: 24 + listBottomPadding },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onContentSizeChange={onListContentSizeChange}
          onLayout={onListLayout}
          onScrollBeginDrag={markUserDrag}
          onScrollEndDrag={trackBottomDistance}
          onMomentumScrollEnd={endUserDrag}
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
            disabled={historyLoading}
            bottomPad={composerBottomPad}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

/** Paragraphs split on blank lines; single line breaks inside one are folded into spaces. */
function splitMessageParagraphs(message: string): string[] {
  const parts = String(message ?? '')
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  return parts.length ? parts : [String(message ?? '')];
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
  sheetSafeArea: { backgroundColor: colors.card },
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
    minWidth: 0,
  },
  // Lets long titles and subtitles wrap instead of running under New chat.
  headerCopy: { flexShrink: 1, minWidth: 0 },
  pinnedNote: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderBottomColor: colors.primaryBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.screenX,
    paddingVertical: 8,
  },
  pinnedNoteText: { color: colors.primaryDark, flex: 1, fontSize: 12, lineHeight: 16 },
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
    flexShrink: 0,
    marginLeft: 8,
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
  memoryNoticeCard: {
    backgroundColor: colors.infoSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    padding: 12,
    marginBottom: 14,
  },
  memoryNoticeText: {
    color: colors.infoText,
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
  bubble: { maxWidth: '86%', paddingHorizontal: 16, paddingVertical: 12 },
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
  },
  messageText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '400',
    letterSpacing: 0.1,
  },
  messageParagraph: { marginTop: 10 },
  userMessageText: { color: colors.onColor },
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
