import React, { useEffect, useMemo, useRef } from 'react';
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

type ChatFeedProps = {
  messages: BackendChatMessage[];
  currentUserId?: string;
  /**
   * When true (default), the feed owns scrolling — required so the composer
   * can stay pinned below a flex message list.
   */
  scrollEnabled?: boolean;
  /** Show the sender's name above other people's bubbles (group chat only). */
  showSenderName?: boolean;
  /** Show "Seen" under my newest message once someone has read it. */
  showReadReceipts?: boolean;
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
  showSenderName = true,
  showReadReceipts = false,
  bottomPadding = 0,
  pinToBottomNonce = 0,
  deletingMessageId,
  onDeleteMessage,
  style,
}: ChatFeedProps) {
  const { t } = useTranslation('circleWorkspace');
  const listRef = useRef<FlatList<BackendChatMessage>>(null);
  const pinnedToBottomRef = useRef(true);
  const lastTailIdRef = useRef<string | null>(null);
  const lastSendNonceRef = useRef(pinToBottomNonce);
  const didInitialScrollRef = useRef(false);

  // Only the newest message I sent shows "Seen", like most chat apps.
  const lastOwnMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (
        !message.isSystem &&
        message.senderId !== 'system' &&
        (message.senderUserId === currentUserId || message.senderId === currentUserId)
      ) {
        return message.id;
      }
    }
    return null;
  }, [messages, currentUserId]);

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
      onLayout={() => {
        // The visible area shrinks when the keyboard opens; keep the newest
        // message in view if the reader was already at the bottom.
        if (scrollEnabled && messages.length > 0 && pinnedToBottomRef.current) {
          scrollToEnd(false);
        }
      }}
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
      renderItem={({ item }) => {
        const isMe =
          item.senderUserId === currentUserId || item.senderId === currentUserId;

        if (item.isSystem || item.senderId === 'system') {
          return (
            <View style={styles.systemMessage}>
              <Text style={styles.systemText}>{item.text}</Text>
            </View>
          );
        }

        return (
          <View style={[styles.messageWrapper, isMe ? styles.messageWrapperMe : null]}>
            <Pressable
              style={[
                styles.bubble,
                isMe ? styles.bubbleMe : styles.bubbleThem,
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
              {!isMe && showSenderName ? (
                <Text style={styles.senderName}>{item.senderName}</Text>
              ) : null}
              <Text style={[styles.messageText, isMe && styles.messageTextMe]}>
                {item.text}
              </Text>
              <Text style={[styles.timestamp, isMe && styles.timestampMe]}>
                {item.timestamp}
              </Text>
            </Pressable>
            {showReadReceipts &&
            isMe &&
            item.id === lastOwnMessageId &&
            (item.readBy?.length ?? 0) > 0 ? (
              <Text style={styles.receipt}>
                {item.readBy!.length > 1
                  ? t('chat.seenBy', { count: item.readBy!.length })
                  : t('chat.seen')}
              </Text>
            ) : null}
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
    alignSelf: 'flex-start',
    marginBottom: 8,
    maxWidth: '80%',
  },
  messageWrapperMe: {
    alignSelf: 'flex-end',
  },
  bubble: {
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleThem: {
    backgroundColor: colors.surfaceMuted,
    borderBottomLeftRadius: 5,
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 5,
  },
  bubbleDeleting: {
    opacity: 0.5,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 3,
  },
  messageText: {
    fontSize: 15,
    color: colors.textStrong,
    lineHeight: 21,
  },
  messageTextMe: {
    color: colors.onColor,
  },
  timestamp: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 3,
    alignSelf: 'flex-end',
  },
  timestampMe: {
    color: 'rgba(255,255,255,0.7)',
  },
  receipt: {
    alignSelf: 'flex-end',
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginRight: 4,
    marginTop: 3,
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
