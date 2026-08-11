import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useRef } from 'react';
import { FlatList, StyleSheet, Text, View, type FlatListProps } from 'react-native';

import type { BackendChatMessage } from '@/lib/api';
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
  style?: FlatListProps<BackendChatMessage>['style'];
};

export default function ChatFeed({
  messages,
  currentUserId,
  scrollEnabled = true,
  style,
}: ChatFeedProps) {
  const listRef = useRef<FlatList<BackendChatMessage>>(null);

  useEffect(() => {
    if (!scrollEnabled || messages.length === 0) return;
    const handle = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(handle);
  }, [messages.length, scrollEnabled]);

  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(item) => item.id}
      style={[styles.list, style]}
      contentContainerStyle={styles.container}
      scrollEnabled={scrollEnabled}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      onContentSizeChange={() => {
        if (scrollEnabled && messages.length > 0) {
          listRef.current?.scrollToEnd({ animated: false });
        }
      }}
      renderItem={({ item }) => {
        const isMe =
          item.senderUserId === currentUserId || item.senderId === currentUserId;

        if (item.isSystem || item.senderId === 'system') {
          return (
            <View style={styles.systemMessage}>
              <FontAwesome name="info-circle" size={14} color={colors.muted} />
              <Text style={styles.systemText}>{item.text}</Text>
            </View>
          );
        }

        return (
          <View style={[styles.messageWrapper, isMe ? styles.messageWrapperMe : null]}>
            {!isMe && (
              <View style={{ marginRight: 8 }}>
                <Avatar name={item.senderName} size={32} />
              </View>
            )}
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              {!isMe && <Text style={styles.senderName}>{item.senderName}</Text>}
              <Text style={[styles.messageText, isMe && styles.messageTextMe]}>
                {item.text}
              </Text>
              <Text style={[styles.timestamp, isMe && styles.timestampMe]}>
                {item.timestamp}
              </Text>
            </View>
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
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  messageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
    maxWidth: '85%',
  },
  messageWrapperMe: {
    alignSelf: 'flex-end',
  },
  bubble: {
    padding: 12,
    borderRadius: 18,
  },
  bubbleThem: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    color: colors.textStrong,
    lineHeight: 20,
  },
  messageTextMe: {
    color: colors.onColor,
  },
  timestamp: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timestampMe: {
    color: 'rgba(255,255,255,0.7)',
  },
  systemMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBorder,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignSelf: 'center',
    marginVertical: 12,
    gap: 6,
  },
  systemText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
});
