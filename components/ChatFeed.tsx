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
} from '@/lib/circleChatState';
import { colors } from '@/lib/theme';

import { Avatar } from './Avatar';

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
            {!isMe && (
              <View style={styles.avatar}>
                <Avatar name={item.senderName} size={28} />
              </View>
            )}
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
              {!isMe && <Text style={styles.senderName}>{item.senderName}</Text>}
              <Text style={[styles.messageText, isMe && styles.messageTextMe]}>
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
    maxWidth: '82%',
  },
  messageWrapperMe: {
    alignSelf: 'flex-end',
    width: '82%',
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
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 5,
    width: '100%',
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
    fontSize: 9,
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
