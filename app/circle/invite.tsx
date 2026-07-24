import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addCircleMember,
  getCircleDetail,
  getMemberAccessToken,
  type BackendCircleDetail,
  type BackendCircleMember,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import {
  buildClaimInviteShareMessage,
  buildClaimInviteUrl,
  buildGenericCircleInviteShareMessage,
} from '@/lib/claimInvite';
import { isUnclaimedHand } from '@/lib/circleLifecycleCopy';
import { circleWorkspaceHref } from '@/lib/navigation';
import { isCircleSetupState, getCircleLifecyclePhase } from '@/lib/startCircleReadiness';
import { colors, radii, spacing } from '@/lib/theme';

export default function InviteMemberScreen() {
  const { t } = useTranslation('invite');
  const { session } = useAuthSession();
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;
  const token = session?.session.token;

  const [circle, setCircle] = useState<BackendCircleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState('');
  const [contact, setContact] = useState('');
  const [sharingClaimId, setSharingClaimId] = useState<string | null>(null);

  async function loadInviteData() {
    if (!token || !circleId) {
      setError(t('organizer.missingContext'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const circleResponse = await getCircleDetail(token, circleId);
      setCircle(circleResponse);
    } catch (loadError) {
      console.error('Unable to load organizer invite details.', loadError);
      setError(t('organizer.loadError'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInviteData();
  }, [circleId, token]);

  const unclaimedHands = useMemo(() => {
    const members = circle?.members ?? [];
    const turnOrder = Array.isArray(circle?.turnOrder) ? circle!.turnOrder : [];
    const ordered = [...members].sort((a, b) => {
      const posA = turnOrder.indexOf(a.id);
      const posB = turnOrder.indexOf(b.id);
      const norm = (p: number) => (p === -1 ? Number.MAX_SAFE_INTEGER : p);
      return norm(posA) - norm(posB);
    });
    return ordered.filter(
      (member) =>
        member.isParticipating !== false && isUnclaimedHand(member),
    );
  }, [circle]);

  async function sendInvite() {
    if (!token || !circle) {
      Alert.alert(t('unavailableTitle'), t('organizer.circleMissing'));
      return;
    }

    const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ');
    const trimmedContact = contact.trim();

    if (!firstName) {
      Alert.alert(
        t('organizer.fullNameRequiredTitle'),
        t('organizer.fullNameRequiredMessage'),
      );
      return;
    }

    if (!trimmedContact) {
      Alert.alert(
        t('organizer.contactRequiredTitle'),
        t('organizer.contactRequiredMessage'),
      );
      return;
    }

    const capacity = circle.rosterCapacity;
    if (capacity?.atCapacity || (capacity?.remainingHands ?? 1) <= 0) {
      Alert.alert(
        t('organizer.planLimitTitle'),
        capacity?.tier === 'premium'
          ? t('organizer.premiumLimit', { count: capacity.maxHands ?? 50 })
          : t('organizer.freeLimit', { count: capacity?.maxHands ?? 20 }),
      );
      return;
    }

    setSubmitting(true);
    try {
      await addCircleMember(token, circle.id, {
        firstName,
        lastName,
        email: trimmedContact.includes('@') ? trimmedContact : undefined,
        phone: trimmedContact.includes('@') ? '' : trimmedContact,
      });
      await loadInviteData();
      setFullName('');
      setContact('');
      Alert.alert(
        t('organizer.plannedAddedTitle'),
        t('organizer.plannedAddedMessage'),
      );
    } catch (inviteError) {
      console.error('Unable to add planned circle hand.', inviteError);
      Alert.alert(
        t('organizer.addErrorTitle'),
        t('genericError'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleShareGenericLink() {
    if (!circle) return;
    try {
      await Share.share({
        message: buildGenericCircleInviteShareMessage({
          circleName: circle.name,
          circleId: circle.id,
          circleCode: circle.circleCode,
          formatMessage: ({ circleName, circleCode, inviteUrl }) =>
            circleCode
              ? t('organizer.genericShareWithCode', {
                  circleName,
                  circleCode,
                  inviteUrl,
                })
              : t('organizer.genericShareWithoutCode', {
                  circleName,
                  inviteUrl,
                }),
        }),
      });
    } catch {
      Alert.alert(t('organizer.shareErrorTitle'), t('organizer.shareErrorMessage'));
    }
  }

  async function handleShareClaimInvite(member: BackendCircleMember) {
    if (!token || !circle || sharingClaimId) {
      return;
    }
    setSharingClaimId(member.id);
    try {
      const { claimToken } = await getMemberAccessToken(
        circle.id,
        member.id,
        token,
      );
      const claimUrl = buildClaimInviteUrl(circle.id, claimToken);
      await Share.share({
        message: buildClaimInviteShareMessage({
          circleName: circle.name,
          handName:
            member.displayLabel ||
            memberName(member, t('organizer.unavailableFallback')),
          claimUrl,
          formatMessage: ({ circleName, handName, claimUrl: url }) =>
            t('organizer.claimShareMessage', {
              circleName,
              handName,
              claimUrl: url,
            }),
        }),
      });
    } catch (shareError) {
      console.error('Unable to share planned-hand claim invite.', shareError);
      Alert.alert(
        t('organizer.claimShareErrorTitle'),
        t('organizer.claimShareErrorMessage'),
      );
    } finally {
      setSharingClaimId(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.statusCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.statusText}>{t('loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !circle) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.statusCard}>
          <FontAwesome name="warning" size={32} color={colors.warning} />
          <Text style={styles.statusTitle}>{t('unavailableTitle')}</Text>
          <Text style={styles.statusText}>
            {error ?? t('organizer.circleMissing')}
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => void loadInviteData()}
            accessibilityRole="button"
            accessibilityLabel={t('retryAccessibility')}
          >
            <Text style={styles.primaryButtonText}>{t('retry')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const hasReachedLimit = (circle.members?.length || 0) >= 20;
  // Authoritative: setup phase only (status/startedAt/isStarted) — never schedule.
  const structureUnlocked = isCircleSetupState(circle);
  const phase = getCircleLifecyclePhase(circle);

  if (!structureUnlocked) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.statusCard}>
          <FontAwesome name="lock" size={32} color={colors.muted} />
          <Text style={styles.statusTitle}>{t('organizer.rosterLocked')}</Text>
          <Text style={styles.statusText}>
            {phase === 'completed'
              ? t('organizer.completedLocked')
              : t('organizer.startedLocked')}
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.replace(circleWorkspaceHref(circle.id))}
            accessibilityRole="button"
            accessibilityLabel={t('organizer.backWorkspaceAccessibility')}
          >
            <Text style={styles.primaryButtonText}>{t('organizer.backWorkspace')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.replace(circleWorkspaceHref(circle.id))}
            accessibilityRole="button"
            accessibilityLabel={t('organizer.backWorkspaceAccessibility')}
          >
            <FontAwesome name="angle-left" size={24} color={colors.primaryDark} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>{t('organizer.kicker')}</Text>
            <Text style={styles.title}>{circle.name}</Text>
          </View>
        </View>

        <Pressable
          style={styles.shareHeroCard}
          onPress={() => void handleShareGenericLink()}
          accessibilityRole="button"
          accessibilityLabel={t('organizer.shareCircleAccessibility')}
        >
          <View style={styles.shareHeroIcon}>
            <FontAwesome name="share-alt" size={24} color={colors.primary} />
          </View>
          <View style={styles.shareHeroContent}>
            <Text style={styles.shareHeroTitle}>{t('organizer.shareCircle')}</Text>
            <Text style={styles.shareHeroText}>
              {t('organizer.shareCircleSubtitle')}
            </Text>
          </View>
        </Pressable>

        {unclaimedHands.length > 0 ? (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>{t('organizer.claimTitle')}</Text>
            <Text style={styles.sectionSubtitle}>
              {t('organizer.claimSubtitle')}
            </Text>
            <View style={styles.claimList}>
              {unclaimedHands.map((member, index) => (
                <View key={member.id} style={styles.claimRow}>
                  <View style={styles.claimPosition}>
                    <Text style={styles.claimPositionText}>{index + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.claimName} numberOfLines={1}>
                      {member.displayLabel ||
                        memberName(member, t('organizer.unavailableFallback'))}
                    </Text>
                    <Text style={styles.claimMeta}>
                      {t('organizer.awaitingClaim')}
                      {member.phone ? ` · ${member.phone}` : ''}
                      {member.email && !member.phone ? ` · ${member.email}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    style={[
                      styles.claimShareButton,
                      sharingClaimId === member.id && styles.disabledButton,
                    ]}
                    disabled={sharingClaimId === member.id}
                    onPress={() => void handleShareClaimInvite(member)}
                    accessibilityRole="button"
                    accessibilityLabel={t('organizer.shareClaimAccessibility', {
                      name: memberName(
                        member,
                        t('organizer.unavailableFallback'),
                      ),
                    })}
                  >
                    {sharingClaimId === member.id ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <>
                        <FontAwesome
                          name="link"
                          size={13}
                          color={colors.primary}
                        />
                        <Text style={styles.claimShareText}>
                          {t('organizer.shareClaim')}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={[styles.formCard, { backgroundColor: '#f0fdf4' }]}>
            <Text style={[styles.sectionTitle, { color: '#166534' }]}>
              {t('organizer.allClaimed')}
            </Text>
            <Text style={[styles.sectionSubtitle, { color: '#15803d' }]}>
              {t('organizer.allClaimedSubtitle')}
            </Text>
          </View>
        )}

        {hasReachedLimit ? (
          <View style={[styles.formCard, { borderColor: colors.warning, borderWidth: 1 }]}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <FontAwesome name="lock" size={32} color={colors.warning} />
            </View>
            <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>
              {t('organizer.handLimit')}
            </Text>
            <Text
              style={[
                styles.sectionSubtitle,
                { textAlign: 'center', marginBottom: 24 },
              ]}
            >
              {t('organizer.handLimitMessage')}
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push('/subscription')}
            >
              <Text style={styles.primaryButtonText}>{t('organizer.viewPlans')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>{t('organizer.addPlannedTitle')}</Text>
              <Text style={styles.sectionSubtitle}>
                {t('organizer.addPlannedSubtitle')}
              </Text>
              <View style={styles.formSpacer} />
              <Field
                label={t('organizer.fullName')}
                value={fullName}
                onChangeText={setFullName}
                placeholder={t('organizer.fullNamePlaceholder')}
              />
              <Field
                label={t('organizer.contact')}
                value={contact}
                onChangeText={setContact}
                placeholder={t('organizer.contactPlaceholder')}
                keyboardType="email-address"
              />
            </View>

            <Pressable
              style={[styles.primaryButton, submitting && styles.disabledButton]}
              disabled={submitting}
              onPress={() => void sendInvite()}
              accessibilityRole="button"
              accessibilityLabel={t('organizer.addPlanned')}
            >
              <Text style={styles.primaryButtonText}>
                {submitting ? t('organizer.saving') : t('organizer.addPlanned')}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function memberName(
  member: BackendCircleMember | undefined,
  fallback: string,
) {
  return member?.full_name || member?.name || fallback;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address';
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.subtle}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.noteInput]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingBottom: 34,
    paddingHorizontal: spacing.screenX,
    paddingTop: 22,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
    marginRight: 8,
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.textStrong,
    marginTop: 2,
  },
  statusCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textStrong,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  shareHeroCard: {
    backgroundColor: '#fff',
    borderRadius: radii.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
    marginBottom: 16,
  },
  shareHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.primary}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareHeroContent: {
    flex: 1,
  },
  shareHeroTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textStrong,
  },
  shareHeroText: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 18,
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: radii.card,
    padding: 18,
    borderWidth: 1,
    borderColor: `${colors.primary}15`,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.textStrong,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 20,
  },
  formSpacer: {
    height: 16,
  },
  fieldWrap: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: `${colors.primary}25`,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.textStrong,
  },
  noteInput: {
    minHeight: 90,
    paddingTop: 12,
  },
  claimList: {
    marginTop: 14,
    gap: 10,
  },
  claimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  claimPosition: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimPositionText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
  },
  claimName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textStrong,
  },
  claimMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  claimShareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${colors.primary}12`,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  claimShareText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.control || 12,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.55,
  },
});
