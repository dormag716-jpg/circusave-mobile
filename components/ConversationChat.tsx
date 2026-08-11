import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type KeyboardEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { BackendCircleMember } from '@/lib/api';
import {
  FLOATING_COMPOSER_RESTING_HEIGHT,
  floatingComposerBottomOffset,
  floatingComposerListPadding,
} from '@/lib/chatKeyboard';
import { colors, radii, shadows } from '@/lib/theme';
import { useConversations } from '@/lib/useConversations';

import { Avatar } from './Avatar';
import ChatFeed from './ChatFeed';
import ChatInput from './ChatInput';

type ConversationChatProps = {
  circleId: string;
  token: string;
  currentUserId: string;
  members: BackendCircleMember[];
  initialConversationId?: string;
};

/**
 * Group + private chat share this surface.
 *
 * Layout contract:
 * - Parent gives a bounded flex height (not nested in an outer ScrollView).
 * - Message list scrolls inside the thread card.
 * - Composer is a floating dock that lifts by measured keyboard overlap so
 *   typed text always stays visible above the software keyboard.
 */
export default function ConversationChat({
  circleId,
  token,
  currentUserId,
  members,
  initialConversationId,
}: ConversationChatProps) {
  const { t } = useTranslation('circleWorkspace');
  const rootRef = useRef<View>(null);
  /** Last keyboard top (window Y). Used to re-measure after chrome collapses. */
  const keyboardTopYRef = useRef<number | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [creatingMemberId, setCreatingMemberId] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  /** Extra bottom offset so the floating dock sits above the keyboard. */
  const [composerLift, setComposerLift] = useState(0);
  const [composerHeight, setComposerHeight] = useState(
    FLOATING_COMPOSER_RESTING_HEIGHT,
  );

  const {
    conversations,
    selectedConversation,
    messages,
    loading,
    threadLoading,
    sending,
    error,
    selectConversation,
    createDirectConversation,
    sendMessage,
    refresh,
  } = useConversations(circleId, token, initialConversationId);

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

  const remeasureComposerLift = useCallback(() => {
    const keyboardTopY = keyboardTopYRef.current;
    if (keyboardTopY == null) {
      setComposerLift(0);
      return;
    }
    rootRef.current?.measureInWindow((_x, y, _w, h) => {
      const containerBottomY = y + h;
      setComposerLift(
        floatingComposerBottomOffset(containerBottomY, keyboardTopY),
      );
    });
  }, []);

  const applyKeyboardFrame = useCallback(
    (event: KeyboardEvent | null) => {
      if (!event) {
        keyboardTopYRef.current = null;
        setKeyboardVisible(false);
        setComposerLift(0);
        return;
      }

      keyboardTopYRef.current = event.endCoordinates.screenY;
      setKeyboardVisible(true);

      // Measure after layout so we know how much of *this* chat root is covered.
      requestAnimationFrame(() => {
        remeasureComposerLift();
      });
    },
    [remeasureComposerLift],
  );

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const changeEvent =
      Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';

    const showSub = Keyboard.addListener(showEvent, applyKeyboardFrame);
    const changeSub = Keyboard.addListener(changeEvent, applyKeyboardFrame);
    const hideSub = Keyboard.addListener(hideEvent, () => {
      applyKeyboardFrame(null);
    });

    return () => {
      showSub.remove();
      changeSub.remove();
      hideSub.remove();
    };
  }, [applyKeyboardFrame]);

  // Chrome collapses when the keyboard opens — re-measure after that layout.
  useEffect(() => {
    if (!keyboardVisible) return;
    const handle = requestAnimationFrame(() => {
      remeasureComposerLift();
    });
    return () => cancelAnimationFrame(handle);
  }, [keyboardVisible, remeasureComposerLift]);

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

  const listBottomPadding = floatingComposerListPadding(
    selectedConversation ? composerHeight : 0,
    // List lives inside the flex root; when the window resizes, lift is 0 and
    // the dock still needs its own height reserved. When the window does not
    // resize, lift pushes the dock up and the list needs that space too.
    selectedConversation ? composerLift : 0,
  );

  if (loading && conversations.length === 0) {
    return (
      <View style={styles.loadingCard}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>{t('chat.loading')}</Text>
      </View>
    );
  }

  return (
    <View
      ref={rootRef}
      style={styles.container}
      collapsable={false}
      onLayout={() => {
        if (keyboardTopYRef.current != null) {
          remeasureComposerLift();
        }
      }}
    >
      {!keyboardVisible ? (
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{t('chat.title')}</Text>
            <Text style={styles.subtitle}>{t('chat.subtitle')}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.newChatButton,
              pressed && styles.pressed,
            ]}
            onPress={() => setPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('chat.newPrivateA11y')}
          >
            <FontAwesome name="edit" size={15} color={colors.onColor} />
            <Text style={styles.newChatButtonText}>{t('chat.newPrivate')}</Text>
          </Pressable>
        </View>
      ) : null}

      {!keyboardVisible ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.conversationStripScroll}
          contentContainerStyle={styles.conversationStrip}
        >
          {conversations.map((conversation) => {
            const selected = conversation.id === selectedConversation?.id;
            return (
              <Pressable
                key={conversation.id}
                style={({ pressed }) => [
                  styles.conversationChip,
                  selected && styles.conversationChipSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => selectConversation(conversation.id)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.openConversationA11y', {
                  name: conversation.title,
                  count: conversation.unreadCount,
                })}
              >
                <View style={styles.chipAvatar}>
                  {conversation.type === 'group' ? (
                    <View style={styles.groupAvatar}>
                      <FontAwesome name="users" size={15} color={colors.primary} />
                    </View>
                  ) : (
                    <Avatar name={conversation.title} size={34} />
                  )}
                  {conversation.unreadCount > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>
                        {conversation.unreadCount > 99
                          ? '99+'
                          : conversation.unreadCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.chipCopy}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.chipTitle,
                      selected && styles.chipTitleSelected,
                    ]}
                  >
                    {conversation.type === 'group'
                      ? t('chat.group')
                      : conversation.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.chipPreview}>
                    {conversation.lastMessage?.text || t('chat.noMessages')}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

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
        <View style={styles.threadCard}>
          {!keyboardVisible ? (
            <View style={styles.threadHeader}>
              <View style={styles.threadIdentity}>
                {selectedConversation.type === 'group' ? (
                  <View style={styles.groupAvatarLarge}>
                    <FontAwesome
                      name="users"
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                ) : (
                  <Avatar name={selectedConversation.title} size={42} />
                )}
                <View style={styles.threadHeaderCopy}>
                  <Text style={styles.threadTitle} numberOfLines={1}>
                    {selectedConversation.type === 'group'
                      ? t('chat.groupTitle')
                      : selectedConversation.title}
                  </Text>
                  <Text style={styles.threadMeta}>
                    {selectedConversation.type === 'group'
                      ? t('chat.groupMeta', {
                          count: selectedConversation.participants.length,
                        })
                      : t('chat.privateMeta')}
                  </Text>
                </View>
              </View>
              {threadLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : null}
            </View>
          ) : null}

          {messages.length > 0 ? (
            <ChatFeed
              messages={messages}
              currentUserId={currentUserId}
              bottomPadding={listBottomPadding}
            />
          ) : (
            <View
              style={[
                styles.emptyThread,
                { paddingBottom: listBottomPadding + 24 },
              ]}
            >
              <FontAwesome
                name={
                  selectedConversation.type === 'group'
                    ? 'comments-o'
                    : 'comment-o'
                }
                size={30}
                color={colors.primary}
              />
              <Text style={styles.emptyTitle}>{t('chat.emptyTitle')}</Text>
              <Text style={styles.emptyText}>
                {selectedConversation.type === 'group'
                  ? t('chat.emptyGroup')
                  : t('chat.emptyPrivate', {
                      name: selectedConversation.title,
                    })}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.emptyThread}>
          <Text style={styles.emptyTitle}>{t('chat.noConversationTitle')}</Text>
          <Text style={styles.emptyText}>{t('chat.noConversationBody')}</Text>
        </View>
      )}

      {/* Floating chat console — rides above the keyboard via measured lift. */}
      {selectedConversation ? (
        <View
          style={[styles.composerDock, { bottom: composerLift }]}
          onLayout={(e) => {
            const next = Math.ceil(e.nativeEvent.layout.height);
            if (next > 0 && next !== composerHeight) {
              setComposerHeight(next);
            }
          }}
        >
          <ChatInput
            onSend={sendMessage}
            isLoading={sending}
            placeholder={t('chat.placeholder')}
            applyBottomInset={composerLift === 0}
            floating
          />
        </View>
      ) : null}

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
    gap: 12,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    color: colors.textStrong,
    fontSize: 21,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  newChatButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  newChatButtonText: {
    color: colors.onColor,
    fontSize: 12,
    fontWeight: '900',
  },
  conversationStripScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  conversationStrip: {
    alignItems: 'stretch',
    gap: 10,
    paddingVertical: 2,
  },
  conversationChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    maxWidth: 140,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  conversationChipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipAvatar: {
    position: 'relative',
  },
  groupAvatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderColor: colors.onColor,
    borderRadius: 9,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 18,
    minWidth: 18,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -6,
    top: -6,
  },
  unreadBadgeText: {
    color: colors.onColor,
    fontSize: 9,
    fontWeight: '900',
  },
  chipCopy: {
    flexShrink: 1,
    maxWidth: 78,
  },
  chipTitle: {
    color: colors.textStrong,
    fontSize: 13,
    fontWeight: '800',
  },
  chipTitleSelected: {
    color: colors.primaryDark,
  },
  chipPreview: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  threadCard: {
    backgroundColor: colors.background,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    ...shadows.medium,
  },
  threadHeader: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
  },
  threadIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  groupAvatarLarge: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  threadHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  threadTitle: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: '900',
  },
  threadMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  emptyThread: {
    alignItems: 'center',
    flex: 1,
    gap: 7,
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
  /** Absolute floating console docked to the chat root bottom. */
  composerDock: {
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 20,
    elevation: 12,
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
