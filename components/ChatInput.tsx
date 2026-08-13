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
        { paddingBottom: bottomPad },
        style,
      ]}
    >
      <View
        style={[
          styles.composerPill,
          floating && styles.composerPillFloating,
        ]}
      >
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 6,
    backgroundColor: 'transparent',
  },
  composerPill: {
    minHeight: 56,
    maxHeight: 120,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: colors.card,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  composerPillFloating: {
    ...shadows.medium,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 108,
    fontSize: 16,
    color: colors.textStrong,
    paddingHorizontal: 0,
    paddingVertical: 10,
    margin: 0,
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
  },
  sendButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});
