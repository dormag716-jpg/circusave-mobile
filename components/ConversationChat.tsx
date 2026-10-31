import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BackendCircleMember } from '@/lib/api';
import { useConversations } from '@/lib/circles/useConversations';
import { colors, radii } from '@/lib/shared/theme';

import { Avatar } from './Avatar';
import ChatFeed from './ChatFeed';
import ChatInput from './ChatInput';

type ConversationChatProps = {
  circleId: string;
  token: string;
  currentUserId: string;
  members: BackendCircleMember[];
  initialConversationId?: string;
  focused?: boolean;
};

/**
 * Group + private chat share this surface.
 *
 * Layout contract:
 * - Parent gives a bounded flex height (not nested in an outer ScrollView).
 * - One row picks the conversation; below it the message list fills the
 *   space and the composer sits at the bottom.
 * - When the keyboard opens, the root is measured against the keyboard's top
 *   edge and the thread gets exactly that much bottom padding. If the window
 *   already resized, the overlap is 0 and nothing is added.
 */

export default function ConversationChat({
  circleId,
  token,
  currentUserId,
  members,
  initialConversationId,
  focused = true,
}: ConversationChatProps) {
  const { t } = useTranslation('circleWorkspace');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [creatingMemberId, setCreatingMemberId] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardOverlap, setKeyboardOverlap] = useState(0);
  const insets = useSafeAreaInsets();
  const rootRef = useRef<View>(null);
  const keyboardTopRef = useRef<number | null>(null);
  const [sendScrollNonce, setSendScrollNonce] = useState(0);

  const {
    conversations,
    selectedConversation,
    messages,
    loading,
    threadLoading,
    sending,
    deletingMessageId,
    error,
    selectConversation,
    createDirectConversation,
    sendMessage,
    deleteMessage,
    refresh,
  } = useConversations(circleId, token, initialConversationId, {
    focused,
  });

  const availableMembers = useMemo(() => {
    const seenUserIds = new Set<string>();
    return members.filter((member) => {
      const userId = String(member.userId || '').trim();
      if (!userId || userId === currentUserId || seenUserIds.has(userId)) {
        return false;
      }
      seenUserIds.add(userId);
      return true;
    });
  }, [currentUserId, members]);

  const measureKeyboardOverlap = useCallback(() => {
    const keyboardTop = keyboardTopRef.current;
    if (keyboardTop == null) {
      setKeyboardOverlap(0);
      return;
    }
    // measureInWindow under-reports the top edge on edge-to-edge Android (it
    // drops the status bar), so use the page position instead.
    rootRef.current?.measure((_x, _y, _w, height, _pageX, pageY) => {
      const overlap = Math.round(pageY + height - keyboardTop);
      setKeyboardOverlap(overlap > 0 ? overlap : 0);
    });
  }, []);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      keyboardTopRef.current = event.endCoordinates.screenY;
      setKeyboardVisible(true);
      requestAnimationFrame(measureKeyboardOverlap);
      // The workspace header collapses just after the keyboard opens, which
      // moves this view; measure again once that layout has settled.
      [120, 350, 700].forEach((delay) => {
        setTimeout(() => {
          if (keyboardTopRef.current != null) measureKeyboardOverlap();
        }, delay);
      });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardTopRef.current = null;
      setKeyboardVisible(false);
      setKeyboardOverlap(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [measureKeyboardOverlap]);

  async function startDirectChat(member: BackendCircleMember) {
    setCreatingMemberId(member.id);
    setPickerError(null);
    try {
      await createDirectConversation(member.id);
      setPickerVisible(false);
    } catch (createError) {
      setPickerError(
        createError instanceof Error
          ? createError.message
          : t('chat.createError'),
      );
    } finally {
      setCreatingMemberId(null);
    }
  }

  if (loading && conversations.length === 0) {
    return (
      <View style={styles.loadingCard}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>{t('chat.loading')}</Text>
      </View>
    );
  }

  const isGroup = selectedConversation?.type === 'group';

  return (
    <View
      ref={rootRef}
      style={styles.container}
      collapsable={false}
      onLayout={() => {
        if (keyboardTopRef.current != null) measureKeyboardOverlap();
      }}
    >
      <View style={styles.topRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.chipScroll}
          contentContainerStyle={styles.chipStrip}
        >
          {conversations.map((conversation) => {
            const selected = conversation.id === selectedConversation?.id;
            return (
              <Pressable
                key={conversation.id}
                style={({ pressed }) => [
                  styles.chip,
                  selected && styles.chipSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => selectConversation(conversation.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t('chat.openConversationA11y', {
                  name: conversation.title,
                  count: conversation.unreadCount,
                })}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.chipTitle, selected && styles.chipTitleSelected]}
                >
                  {conversation.type === 'group'
                    ? t('chat.group')
                    : conversation.title}
                </Text>
                {conversation.unreadCount > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {conversation.unreadCount > 99
                        ? '99+'
                        : conversation.unreadCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
        {threadLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : null}
        <Pressable
          style={({ pressed }) => [
            styles.newChatButton,
            pressed && styles.pressed,
          ]}
          onPress={() => setPickerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t('chat.newPrivateA11y')}
        >
          <FontAwesome name="pencil" size={15} color={colors.primary} />
        </Pressable>
      </View>

      {error ? (
        <Pressable
          style={styles.errorCard}
          onPress={() => void refresh()}
          accessibilityRole="button"
          accessibilityLabel={t('chat.retryA11y')}
        >
          <FontAwesome name="warning" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retryText}>{t('chat.retry')}</Text>
        </Pressable>
      ) : null}

      {selectedConversation ? (
        <View style={[styles.thread, { paddingBottom: keyboardOverlap }]}>
          {messages.length > 0 ? (
            <ChatFeed
              key={selectedConversation.id}
              messages={messages}
              currentUserId={currentUserId}
              showSenderName={isGroup}
              pinToBottomNonce={sendScrollNonce}
              deletingMessageId={deletingMessageId}
              onDeleteMessage={(message) => {
                Alert.alert(
                  t('chat.deleteTitle'),
                  t('chat.deleteBody'),
                  [
                    { text: t('chat.deleteCancel'), style: 'cancel' },
                    {
                      text: t('chat.deleteConfirm'),
                      style: 'destructive',
                      onPress: () => {
                        void deleteMessage(message.id).catch(() => undefined);
                      },
                    },
                  ],
                );
              }}
            />
          ) : (
            <View style={styles.emptyThread}>
              <FontAwesome
                name={isGroup ? 'comments-o' : 'comment-o'}
                size={30}
                color={colors.primary}
              />
              <Text style={styles.emptyTitle}>{t('chat.emptyTitle')}</Text>
              <Text style={styles.emptyText}>
                {isGroup
                  ? t('chat.emptyGroup')
                  : t('chat.emptyPrivate', {
                      name: selectedConversation.title,
                    })}
              </Text>
            </View>
          )}

          <ChatInput
            onSend={async (text) => {
              await sendMessage(text);
              setSendScrollNonce((current) => current + 1);
            }}
            isLoading={sending}
            placeholder={t('chat.placeholder')}
            applyBottomInset={!keyboardVisible}
          />
        </View>
      ) : (
        <View style={styles.emptyThread}>
          <Text style={styles.emptyTitle}>{t('chat.noConversationTitle')}</Text>
          <Text style={styles.emptyText}>{t('chat.noConversationBody')}</Text>
        </View>
      )}

      <Modal
        visible={pickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerVisible(false)}
      >
        <SafeAreaView style={styles.modalScreen} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{t('chat.chooseMember')}</Text>
              <Text style={styles.modalSubtitle}>
                {t('chat.chooseMemberBody')}
              </Text>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={() => setPickerVisible(false)}
              accessibilityRole="button"
              accessibilityLabel={t('chat.closePickerA11y')}
            >
              <FontAwesome name="close" size={20} color={colors.textStrong} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.memberList}
            keyboardShouldPersistTaps="handled"
          >
            {pickerError ? (
              <View style={styles.errorCard}>
                <FontAwesome name="warning" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{pickerError}</Text>
              </View>
            ) : null}
            {availableMembers.length > 0 ? (
              availableMembers.map((member) => {
                const name = displayMemberName(member);
                const creating = creatingMemberId === member.id;
                return (
                  <Pressable
                    key={member.id}
                    style={({ pressed }) => [
                      styles.memberRow,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => void startDirectChat(member)}
                    disabled={creatingMemberId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.messageMemberA11y', { name })}
                  >
                    <Avatar name={name} size={44} />
                    <View style={styles.memberCopy}>
                      <Text style={styles.memberName}>{name}</Text>
                      <Text style={styles.memberHint}>
                        {t('chat.privateHint')}
                      </Text>
                    </View>
                    {creating ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <FontAwesome
                        name="chevron-right"
                        size={14}
                        color={colors.muted}
                      />
                    )}
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.noMembers}>
                <FontAwesome name="user-o" size={30} color={colors.muted} />
                <Text style={styles.emptyTitle}>{t('chat.noMembersTitle')}</Text>
                <Text style={styles.emptyText}>{t('chat.noMembersBody')}</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function displayMemberName(member: BackendCircleMember) {
  return (
    member.full_name ||
    member.name ||
    member.displayLabel ||
    member.handLabel ||
    'Member'
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    gap: 8,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  chipScroll: {
    flex: 1,
    flexGrow: 1,
  },
  chipStrip: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    maxWidth: 170,
    minHeight: 40,
    paddingHorizontal: 16,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipTitle: {
    color: colors.textStrong,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  chipTitleSelected: {
    color: colors.onColor,
  },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 18,
    minWidth: 18,
    paddingHorizontal: 5,
  },
  unreadBadgeText: {
    color: colors.onColor,
    fontSize: 10,
    fontWeight: '900',
  },
  newChatButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  thread: {
    flex: 1,
    minHeight: 0,
  },
  emptyThread: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  emptyTitle: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  errorCard: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 11,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontSize: 12,
  },
  retryText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    padding: 18,
  },
  loadingText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  modalScreen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  modalHeader: {
    alignItems: 'flex-start',
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  modalTitle: {
    color: colors.textStrong,
    fontSize: 22,
    fontWeight: '900',
  },
  modalSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  memberList: {
    gap: 10,
    padding: 18,
  },
  memberRow: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  memberCopy: {
    flex: 1,
  },
  memberName: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: '900',
  },
  memberHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  noMembers: {
    alignItems: 'center',
    gap: 8,
    padding: 30,
  },
  pressed: {
    opacity: 0.8,
  },
});
