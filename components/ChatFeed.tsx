import React, { useEffect, useRef } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type FlatListProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useTranslation } from 'react-i18next';

import type { BackendChatMessage } from '@/lib/api';
import {
  isPinnedNearBottom,
  shouldAutoScrollChat,
} from '@/lib/circles/circleChatState';
import { colors } from '@/lib/shared/theme';
import { useLayoutMetrics } from '@/lib/shared/useLayoutMetrics';

import { Avatar } from './Avatar';

function senderColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return colors.chatSenders[hash % colors.chatSenders.length];
}

function isSystemMessage(message: BackendChatMessage | undefined): boolean {
  return !!message && (!!message.isSystem || message.senderId === 'system');
}

function sameSender(a: BackendChatMessage, b: BackendChatMessage): boolean {
  const left = a.senderUserId ?? a.senderId;
  const right = b.senderUserId ?? b.senderId;
  return left != null && left === right;
}

type ChatFeedProps = {
  messages: BackendChatMessage[];
  currentUserId?: string;
  /**
   * When true (default), the feed owns scrolling — required so the composer
   * can stay pinned below a flex message list.
   */
  scrollEnabled?: boolean;
  /** Extra bottom inset so bubbles clear a floating composer / keyboard. */
  bottomPadding?: number;
  /** Increment after a successful send to pin the list to the newest message. */
  pinToBottomNonce?: number;
  deletingMessageId?: string | null;
  onDeleteMessage?: (message: BackendChatMessage) => void;
  style?: FlatListProps<BackendChatMessage>['style'];
};

export default function ChatFeed({
  messages,
  currentUserId,
  scrollEnabled = true,
  bottomPadding = 0,
  pinToBottomNonce = 0,
  deletingMessageId,
  onDeleteMessage,
  style,
}: ChatFeedProps) {
  const { t } = useTranslation('circleWorkspace');
  const compact = useLayoutMetrics().compact;
  const listRef = useRef<FlatList<BackendChatMessage>>(null);
  const pinnedToBottomRef = useRef(true);
  const lastTailIdRef = useRef<string | null>(null);
  const lastSendNonceRef = useRef(pinToBottomNonce);
  const didInitialScrollRef = useRef(false);

  const scrollToEnd = (animated: boolean) => {
    listRef.current?.scrollToEnd({ animated });
    pinnedToBottomRef.current = true;
  };

  useEffect(() => {
    if (!scrollEnabled || messages.length === 0) return;

    const tailId = messages[messages.length - 1]?.id ?? null;
    const sendRequested = pinToBottomNonce !== lastSendNonceRef.current;
    lastSendNonceRef.current = pinToBottomNonce;

    const newTail = tailId != null && tailId !== lastTailIdRef.current;
    lastTailIdRef.current = tailId;

    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      const handle = requestAnimationFrame(() => {
        scrollToEnd(false);
      });
      return () => cancelAnimationFrame(handle);
    }

    const reason = sendRequested ? 'user-send' : newTail ? 'new-tail' : 'layout';
    if (
      !shouldAutoScrollChat({
        reason,
        pinnedToBottom: pinnedToBottomRef.current,
      })
    ) {
      return;
    }

    const handle = requestAnimationFrame(() => {
      scrollToEnd(reason !== 'layout');
    });
    return () => cancelAnimationFrame(handle);
  }, [messages, pinToBottomNonce, scrollEnabled]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    pinnedToBottomRef.current = isPinnedNearBottom({
      offsetFromEnd:
        contentSize.height - (contentOffset.y + layoutMeasurement.height),
    });
  };

  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(item) => item.id}
      style={[styles.list, style]}
      contentContainerStyle={[
        styles.container,
        bottomPadding > 0 ? { paddingBottom: 16 + bottomPadding } : null,
      ]}
      scrollEnabled={scrollEnabled}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      onContentSizeChange={() => {
        if (
          scrollEnabled &&
          messages.length > 0 &&
          shouldAutoScrollChat({
            reason: 'layout',
            pinnedToBottom: pinnedToBottomRef.current,
          })
        ) {
          scrollToEnd(false);
        }
      }}
      renderItem={({ item, index }) => {
        const isMe =
          item.senderUserId === currentUserId || item.senderId === currentUserId;
        // Consecutive messages from one person form a group: the avatar and name
        // show once, the gap is tighter, and only the last bubble has a tail.
        const previous = messages[index - 1];
        const next = messages[index + 1];
        const startsGroup =
          !previous || isSystemMessage(previous) || !sameSender(previous, item);
        const endsGroup =
          !next || isSystemMessage(next) || !sameSender(next, item);

        if (item.isSystem || item.senderId === 'system') {
          return (
            <View style={styles.systemMessage}>
              <Text style={styles.systemText}>{item.text}</Text>
            </View>
          );
        }

        return (
          <View
            style={[
              styles.messageWrapper,
              isMe ? styles.messageWrapperMe : null,
              { marginBottom: endsGroup ? 8 : 2 },
            ]}
          >
            {!isMe && (
              <View style={[styles.avatar, { width: compact ? 24 : 28 }]}>
                {endsGroup ? (
                  <Avatar name={item.senderName} size={compact ? 24 : 28} />
                ) : null}
              </View>
            )}
            <Pressable
              style={[
                styles.bubble,
                compact && styles.bubbleCompact,
                isMe ? styles.bubbleMe : styles.bubbleThem,
                isMe && !endsGroup ? styles.bubbleMeMid : null,
                !isMe && !endsGroup ? styles.bubbleThemMid : null,
                deletingMessageId === item.id ? styles.bubbleDeleting : null,
              ]}
              disabled={!isMe || !onDeleteMessage || deletingMessageId != null}
              onLongPress={() => onDeleteMessage?.(item)}
              delayLongPress={350}
              accessibilityRole={isMe && onDeleteMessage ? 'button' : undefined}
              accessibilityLabel={
                isMe && onDeleteMessage ? t('chat.deleteA11y') : undefined
              }
              accessibilityHint={
                isMe && onDeleteMessage ? t('chat.deleteA11yHint') : undefined
              }
            >
              {!isMe && startsGroup ? (
                <Text
                  style={[
                    styles.senderName,
                    { color: senderColor(String(item.senderUserId ?? item.senderId ?? item.senderName)) },
                  ]}
                  numberOfLines={1}
                >
                  {item.senderName}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.messageText,
                  compact && styles.messageTextCompact,
                  isMe && styles.messageTextMe,
                ]}
              >
                {item.text}
              </Text>
              <Text style={[styles.timestamp, isMe && styles.timestampMe]}>
                {item.timestamp}
              </Text>
            </Pressable>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    minHeight: 0,
  },
  container: {
    flexGrow: 1,
    paddingBottom: 16,
    paddingHorizontal: 4,
    paddingTop: 12,
  },
  messageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
    maxWidth: '84%',
  },
  // Own bubbles hug their text instead of always filling 82% of the width.
  messageWrapperMe: {
    alignSelf: 'flex-end',
  },
  avatar: {
    marginRight: 7,
  },
  bubble: {
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleThem: {
    backgroundColor: colors.surfaceMuted,
    borderBottomLeftRadius: 5,
    flexShrink: 1,
  },
  bubbleCompact: { paddingHorizontal: 10, paddingVertical: 6 },
  bubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 5,
    flexShrink: 1,
  },
  bubbleMeMid: { borderBottomRightRadius: 17 },
  bubbleThemMid: { borderBottomLeftRadius: 17 },
  bubbleDeleting: {
    opacity: 0.5,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
  },
  messageText: {
    fontSize: 15,
    color: colors.textStrong,
    lineHeight: 21,
  },
  messageTextCompact: { fontSize: 14, lineHeight: 20 },
  messageTextMe: {
    color: colors.onColor,
  },
  timestamp: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 3,
    alignSelf: 'flex-end',
  },
  timestampMe: {
    color: 'rgba(255,255,255,0.7)',
  },
  systemMessage: {
    alignSelf: 'center',
    marginVertical: 10,
    paddingHorizontal: 16,
  },
  systemText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
    textAlign: 'center',
  },
});
