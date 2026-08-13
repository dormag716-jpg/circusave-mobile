import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { composerDraftAfterSend } from '@/lib/circleChatState';
import { colors, shadows } from '@/lib/theme';

type AssistantComposerProps = {
  onSend: (text: string) => void | Promise<void>;
  placeholder: string;
  sendA11y: string;
  sending?: boolean;
  disabled?: boolean;
  bottomPad?: number;
};

/**
 * Isolated Susu AI composer. Draft state stays here so typing does not
 * rerender the virtualized thread.
 */
export default function AssistantComposer({
  onSend,
  placeholder,
  sendA11y,
  sending = false,
  disabled = false,
  bottomPad = 8,
}: AssistantComposerProps) {
  const [text, setText] = useState('');
  const blocked = sending || disabled;
  const canSend = Boolean(text.trim()) && !blocked;

  const handleSend = async () => {
    if (!canSend) return;
    const payload = text.trim();
    try {
      await onSend(payload);
      setText((current) => composerDraftAfterSend(current, true));
    } catch {
      setText((current) => composerDraftAfterSend(current, false));
    }
  };

  return (
    <View style={[styles.composer, { paddingBottom: bottomPad }]}>
      <View style={styles.composerPill}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={colors.subtle}
          multiline
          maxLength={2000}
          editable={!blocked}
          style={styles.input}
          accessibilityLabel={placeholder}
          blurOnSubmit={false}
          textAlignVertical="center"
        />
        <Pressable
          onPress={() => void handleSend()}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={sendA11y}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.onColor} />
          ) : (
            <FontAwesome name="arrow-up" size={15} color={colors.onColor} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
