import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useRef, useState } from 'react';
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

import { composerDraftAfterSend } from '@/lib/circleChatState';
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
  const inputRef = useRef<TextInput>(null);
  const draftRef = useRef('');
  const inputFocusedRef = useRef(false);
  const sendAfterEndEditingRef = useRef(false);
  const insets = useSafeAreaInsets();
  const bottomPad = applyBottomInset
    ? Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0)
    : 8;

  const sendDraft = async (draft: string) => {
    if (!draft.trim() || isLoading) return;
    try {
      await onSend(draft);
      setText((current) => {
        const next = composerDraftAfterSend(current, true, draft);
        draftRef.current = next;
        return next;
      });
    } catch {
      setText((current) => {
        const next = composerDraftAfterSend(current, false, draft);
        draftRef.current = next;
        return next;
      });
    }
  };

  const handleSendPress = () => {
    if (isLoading || !draftRef.current.trim()) return;
    if (inputFocusedRef.current) {
      sendAfterEndEditingRef.current = true;
      inputRef.current?.blur();
      return;
    }
    void sendDraft(draftRef.current);
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
          ref={inputRef}
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={(next) => {
            draftRef.current = next;
            setText(next);
          }}
          onFocus={() => {
            inputFocusedRef.current = true;
          }}
          onEndEditing={(event) => {
            inputFocusedRef.current = false;
            const committedText = event.nativeEvent.text;
            draftRef.current = committedText;
            setText(committedText);
            if (!sendAfterEndEditingRef.current) return;

            sendAfterEndEditingRef.current = false;
            requestAnimationFrame(() => inputRef.current?.focus());
            void sendDraft(committedText);
          }}
          multiline
          maxLength={4000}
          editable={!isLoading}
          textAlignVertical="top"
          scrollEnabled
          blurOnSubmit={false}
        />

        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            !text.trim() && styles.sendButtonDisabled,
            pressed && styles.sendButtonPressed,
          ]}
          disabled={!text.trim() || isLoading}
          onPress={handleSendPress}
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
    paddingHorizontal: 4,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  composerPill: {
    minHeight: 54,
    maxHeight: 132,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 5,
    paddingVertical: 5,
    backgroundColor: colors.card,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  composerPillFloating: {
    ...shadows.small,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textStrong,
    paddingHorizontal: 0,
    paddingTop: 10,
    paddingBottom: 10,
    margin: 0,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
