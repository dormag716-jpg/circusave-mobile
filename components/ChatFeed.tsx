import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import type { BackendChatMessage } from '@/lib/api';

type ChatFeedProps = {
  messages: BackendChatMessage[];
  currentUserId?: string;
};

export default function ChatFeed({ messages, currentUserId }: ChatFeedProps) {
  return (
    <FlatList
      data={messages}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => {
        const isMe = item.senderId === currentUserId;

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
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.senderName[0]}</Text>
              </View>
            )}
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              {!isMe && <Text style={styles.senderName}>{item.senderName}</Text>}
              <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{item.text}</Text>
              <Text style={[styles.timestamp, isMe && styles.timestampMe]}>{item.timestamp}</Text>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 12,
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
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    color: colors.primaryDark,
    fontWeight: '800',
    fontSize: 14,
  },
  bubble: {
    padding: 12,
    borderRadius: 18,
  },
  bubbleThem: {
    backgroundColor: '#fff',
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
    color: '#fff',
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
