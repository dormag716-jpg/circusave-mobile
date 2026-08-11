import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  hrefForAssistantAction,
  labelForAssistantAction,
} from '@/lib/assistant/navigation';
import {
  createAssistantIdempotencyKey,
  normalizeAssistantResponse,
  type NormalizedAssistantReply,
} from '@/lib/assistant/response';
import {
  ApiError,
  sendAiAssistantMessage,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { useEntitlements } from '@/lib/entitlementsContext';
import { colors, radii, shadows, spacing } from '@/lib/theme';

type ChatItem = {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  responseType?: NormalizedAssistantReply['responseType'];
  isRefusal?: boolean;
  isIntro?: boolean;
  navigationSuggestions?: NormalizedAssistantReply['navigationSuggestions'];
  isError?: boolean;
};

const SUGGESTED_PROMPTS = [
  'What needs my attention today?',
  'Is this circle ready for the next step?',
  'Explain the current round in simple terms.',
];

export default function CircleAssistantScreen() {
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;
  const { session } = useAuthSession();
  const { entitlements, refreshEntitlements } = useEntitlements();
  const { i18n } = useTranslation();
  const token = session?.session.token;
  const scrollRef = useRef<ScrollView>(null);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      message: entitlements.capabilities.aiAssistant
        ? 'I am ready. Ask me about this circle, its setup, contributions, payout readiness, or what to do next.'
        : 'You have one complimentary organizer overview. Ask me what this circle needs next.',
    },
  ]);

  const locale = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [items, sending, scrollToEnd]);

  function openSuggestion(actionId: string) {
    if (!circleId) return;
    const target = hrefForAssistantAction(actionId, circleId);
    if (!target) return;
    router.push(target.href);
  }

  async function send(message = input) {
    const trimmed = message.trim();
    if (!trimmed || !token || !circleId || sending) return;

    setInput('');
    setSending(true);
    setUpgradeRequired(false);
    setItems((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', message: trimmed },
    ]);

    try {
      const raw = await sendAiAssistantMessage(
        token,
        circleId,
        trimmed,
        locale === 'es' || locale === 'ht' ? locale : 'en',
        {
          conversationId,
          idempotencyKey: createAssistantIdempotencyKey(),
        },
      );
      const reply = normalizeAssistantResponse(raw);
      if (reply.conversationId) {
        setConversationId(reply.conversationId);
      }

      // Intro consumption: free overview may end after a successful turn.
      const usedIntro =
        !entitlements.capabilities.aiAssistant &&
        entitlements.capabilities.aiIntroAvailable;

      setItems((current) => [
        ...current,
        {
          id: reply.messageId || `assistant-${Date.now()}`,
          role: 'assistant',
          message: reply.message,
          responseType: reply.responseType,
          isRefusal: reply.isRefusal,
          isIntro: usedIntro,
          navigationSuggestions: reply.navigationSuggestions,
        },
      ]);
      await refreshEntitlements();
    } catch (error) {
      const requiresUpgrade =
        error instanceof ApiError &&
        error.status === 403 &&
        Boolean(
          error.payload &&
            typeof error.payload === 'object' &&
            'upgrade' in (error.payload as object),
        );
      setUpgradeRequired(requiresUpgrade);
      setItems((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          isError: true,
          message: requiresUpgrade
            ? 'Your complimentary overview is complete. Organizer Pro keeps your circle-aware assistant available whenever you need it.'
            : error instanceof Error
              ? error.message
              : 'I could not answer right now. Please try again.',
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <FontAwesome name="chevron-left" size={18} color={colors.textStrong} />
          </Pressable>
          <View style={styles.headerTitle}>
            <View style={styles.sparkle}>
              <FontAwesome name="magic" size={13} color={colors.onColor} />
            </View>
            <View>
              <Text style={styles.title}>CircuSave Assistant</Text>
              <Text style={styles.subtitle}>Private · Read-only · Circle-aware</Text>
            </View>
          </View>
          <View
            style={[
              styles.planDot,
              entitlements.capabilities.aiAssistant && styles.planDotPremium,
            ]}
          />
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInDown.springify()} style={styles.contextCard}>
            <View style={styles.contextIcon}>
              <FontAwesome name="shield" size={16} color={colors.primaryDark} />
            </View>
            <View style={styles.contextText}>
              <Text style={styles.contextTitle}>Answers grounded in your circle</Text>
              <Text style={styles.contextCopy}>
                I can explain records and suggest where to look, but I cannot move
                money or change circle data.
              </Text>
            </View>
          </Animated.View>

          {items.map((item) => (
            <Animated.View
              entering={FadeInDown.springify()}
              key={item.id}
              style={[
                styles.messageRow,
                item.role === 'user' && styles.messageRowUser,
              ]}
            >
              {item.role === 'assistant' ? (
                <View
                  style={[
                    styles.avatar,
                    item.isRefusal && styles.avatarRefusal,
                    item.isError && styles.avatarError,
                  ]}
                >
                  <FontAwesome
                    name={item.isRefusal || item.isError ? 'info' : 'magic'}
                    size={12}
                    color={colors.onColor}
                  />
                </View>
              ) : null}
              <View
                style={[
                  styles.bubble,
                  item.role === 'user'
                    ? styles.userBubble
                    : item.isRefusal
                      ? styles.refusalBubble
                      : item.isError
                        ? styles.errorBubble
                        : styles.assistantBubble,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    item.role === 'user' && styles.userMessageText,
                  ]}
                >
                  {item.message}
                </Text>
                {item.isRefusal ? (
                  <Text style={styles.refusalLabel}>READ-ONLY · NO ACTION TAKEN</Text>
                ) : null}
                {item.isIntro ? (
                  <Text style={styles.introLabel}>COMPLIMENTARY OVERVIEW</Text>
                ) : null}
                {item.navigationSuggestions &&
                item.navigationSuggestions.length > 0 &&
                circleId ? (
                  <View style={styles.navChips}>
                    {item.navigationSuggestions.map((suggestion) => {
                      const target = hrefForAssistantAction(
                        suggestion.actionId,
                        circleId,
                      );
                      if (!target) return null;
                      return (
                        <Pressable
                          key={`${item.id}-${suggestion.actionId}`}
                          style={styles.navChip}
                          onPress={() => openSuggestion(suggestion.actionId)}
                        >
                          <Text style={styles.navChipText} numberOfLines={1}>
                            {labelForAssistantAction(suggestion.actionId)}
                          </Text>
                          <FontAwesome
                            name="chevron-right"
                            size={10}
                            color={colors.primary}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </Animated.View>
          ))}

          {items.length === 1 ? (
            <View style={styles.prompts}>
              {SUGGESTED_PROMPTS.map((prompt) => (
                <Pressable
                  key={prompt}
                  style={styles.prompt}
                  onPress={() => void send(prompt)}
                >
                  <Text style={styles.promptText}>{prompt}</Text>
                  <FontAwesome name="arrow-right" size={11} color={colors.primary} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {sending ? (
            <View style={styles.thinking}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.thinkingText}>
                Reading the latest circle facts…
              </Text>
            </View>
          ) : null}

          {upgradeRequired ? (
            <View style={styles.upgradeCard}>
              <View style={styles.upgradeIcon}>
                <FontAwesome name="diamond" size={16} color={colors.premiumGold} />
              </View>
              <View style={styles.upgradeText}>
                <Text style={styles.upgradeTitle}>Keep your assistant</Text>
                <Text style={styles.upgradeCopy}>
                  Organizer Pro includes ongoing circle-aware guidance.
                </Text>
              </View>
              <Pressable
                style={styles.upgradeButton}
                onPress={() => router.push('/subscription' as Href)}
              >
                <Text style={styles.upgradeButtonText}>View plan</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about this circle…"
            placeholderTextColor={colors.subtle}
            multiline
            maxLength={2000}
            editable={!sending && !upgradeRequired}
            style={styles.input}
          />
          <Pressable
            onPress={() => void send()}
            disabled={!input.trim() || sending || upgradeRequired}
            style={[
              styles.sendButton,
              (!input.trim() || sending || upgradeRequired) &&
                styles.sendButtonDisabled,
            ]}
          >
            <FontAwesome name="arrow-up" size={15} color={colors.onColor} />
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.premiumCanvas },
  safeArea: { flex: 1 },
  header: {
    minHeight: 68,
    paddingHorizontal: spacing.screenX,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryBorder,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  headerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 12,
  },
  sparkle: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  title: { color: colors.textStrong, fontSize: 15, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 10, marginTop: 2 },
  planDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.warning },
  planDotPremium: { backgroundColor: colors.success },
  messages: { padding: spacing.screenX, paddingBottom: 30 },
  contextCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.premiumLavenderSoft,
    borderRadius: 18,
    padding: 14,
    marginBottom: 20,
  },
  contextIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  contextText: { flex: 1 },
  contextTitle: { color: colors.primaryDark, fontWeight: '900', fontSize: 13 },
  contextCopy: {
    color: colors.primaryDark,
    opacity: 0.72,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 14,
  },
  messageRowUser: { justifyContent: 'flex-end' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRefusal: { backgroundColor: colors.warning },
  avatarError: { backgroundColor: colors.danger },
  bubble: { maxWidth: '82%', paddingHorizontal: 15, paddingVertical: 12 },
  assistantBubble: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    ...shadows.small,
  },
  refusalBubble: {
    backgroundColor: colors.warningSoft,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  errorBubble: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  userBubble: {
    backgroundColor: colors.primaryDark,
    borderRadius: 18,
    borderBottomRightRadius: 5,
  },
  messageText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  userMessageText: { color: colors.onColor },
  introLabel: {
    color: colors.primary,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: 8,
  },
  refusalLabel: {
    color: colors.warning,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginTop: 8,
  },
  navChips: { marginTop: 10, gap: 6 },
  navChip: {
    minHeight: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  navChipText: {
    flex: 1,
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
  },
  prompts: { gap: 9, marginLeft: 36, marginBottom: 16 },
  prompt: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: 'rgba(255,255,255,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  promptText: { flex: 1, color: colors.primaryDark, fontWeight: '700', fontSize: 12 },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginLeft: 36,
    marginBottom: 14,
  },
  thinkingText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  upgradeCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: 20,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 4,
  },
  upgradeIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeText: { flex: 1 },
  upgradeTitle: { color: colors.onColor, fontWeight: '900', fontSize: 13 },
  upgradeCopy: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  upgradeButton: {
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  upgradeButtonText: { color: colors.primaryDark, fontWeight: '900', fontSize: 10 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: spacing.screenX,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.primaryBorder,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: colors.textStrong,
    fontSize: 14,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
});
