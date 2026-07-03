import React, { useState } from 'react';
import { StyleSheet, TextInput, View, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { colors } from '@/lib/theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';

type ChatInputProps = {
  onSend: (text: string) => void;
  isLoading?: boolean;
};

export default function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (!text.trim() || isLoading) return;
    onSend(text);
    setText('');
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <View style={styles.container}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Send a message..."
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
          />
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            !text.trim() && styles.sendButtonDisabled,
            pressed && styles.sendButtonPressed
          ]}
          disabled={!text.trim() || isLoading}
          onPress={handleSend}
          accessibilityRole="button"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <FontAwesome name="send" size={16} color={text.trim() ? '#fff' : colors.muted} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: 12,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    maxHeight: 120,
    justifyContent: 'center',
  },
  input: {
    fontSize: 16,
    color: colors.textStrong,
    padding: 0, // Reset default padding
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.cardBorder,
  },
  sendButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});
