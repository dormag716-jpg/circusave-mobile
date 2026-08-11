import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, shadows } from '@/lib/theme';

type ChatInputProps = {
  onSend: (text: string) => void | Promise<void>;
  isLoading?: boolean;
  placeholder?: string;
  /** When false, skip extra bottom inset (parent already handles SafeArea). */
  applyBottomInset?: boolean;
  /**
   * Floating dock look: elevated bar that sits above the keyboard.
   * Parent owns bottom offset via absolute positioning.
   */
  floating?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Composer only — keyboard lift is owned by the parent chat surface
 * (ConversationChat floating dock). Do not nest KeyboardAvoidingView here.
 */
export default function ChatInput({
  onSend,
  isLoading,
  placeholder = 'Send a message...',
  applyBottomInset = true,
  floating = false,
  style,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const insets = useSafeAreaInsets();
  const bottomPad = applyBottomInset
    ? Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0)
    : 8;

  const handleSend = async () => {
    if (!text.trim() || isLoading) return;
    try {
      await onSend(text);
      setText('');
    } catch {
      // Keep the draft so the user can retry.
    }
  };

  return (
    <View
      style={[
        styles.container,
        floating && styles.containerFloating,
        { paddingBottom: 12 + bottomPad },
        style,
      ]}
    >
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={4000}
          editable={!isLoading}
          textAlignVertical="center"
          blurOnSubmit={false}
        />
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.sendButton,
          !text.trim() && styles.sendButtonDisabled,
          pressed && styles.sendButtonPressed,
        ]}
        disabled={!text.trim() || isLoading}
        onPress={() => void handleSend()}
        accessibilityRole="button"
        accessibilityLabel="Send message"
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.onColor} />
        ) : (
          <FontAwesome
            name="send"
            size={16}
            color={text.trim() ? colors.onColor : colors.muted}
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: 12,
  },
  containerFloating: {
    borderTopWidth: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderBottomWidth: 0,
    ...shadows.medium,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
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
    padding: 0,
    margin: 0,
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
