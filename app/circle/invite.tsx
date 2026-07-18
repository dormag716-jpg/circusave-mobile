import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
      setError('Missing token or circle ID.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const circleResponse = await getCircleDetail(token, circleId);
      setCircle(circleResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load invite details.',
      );
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
      Alert.alert('Invite unavailable', 'Circle details are not loaded yet.');
      return;
    }

    const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ');
    const trimmedContact = contact.trim();

    if (!firstName) {
      Alert.alert('Full name required', 'Enter the person you want to invite.');
      return;
    }

    if (!trimmedContact) {
      Alert.alert('Contact required', 'Enter a phone number or email address.');
      return;
    }

    const capacity = circle.rosterCapacity;
    if (capacity?.atCapacity || (capacity?.remainingHands ?? 1) <= 0) {
      Alert.alert(
        'Plan limit reached',
        capacity?.tier === 'premium'
          ? `This premium circle already has ${capacity.maxHands ?? 50} participating hands.`
          : `Free circles support up to ${capacity?.maxHands ?? 20} participating hands. Upgrade to Premium for up to 50.`,
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
        'Planned hand added',
        'This hand is on the roster. Share their claim invite so they can connect their account.',
      );
    } catch (inviteError) {
      Alert.alert(
        'Unable to add member',
        inviteError instanceof Error
          ? inviteError.message
          : 'The backend rejected the invite request.',
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
        }),
      });
    } catch {
      Alert.alert(
        'Unable to share link',
        'An error occurred while trying to open the share menu.',
      );
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
          handName: member.displayLabel || memberName(member),
          claimUrl,
        }),
      });
    } catch (shareError) {
      Alert.alert(
        'Unable to share claim invite',
        shareError instanceof Error
          ? shareError.message
          : 'Could not generate a claim link for this hand.',
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
          <Text style={styles.statusText}>Loading invite details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !circle) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.statusCard}>
          <FontAwesome name="warning" size={32} color={colors.warning} />
          <Text style={styles.statusTitle}>Invite unavailable</Text>
          <Text style={styles.statusText}>
            {error ?? 'The backend did not return this circle.'}
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => void loadInviteData()}
            accessibilityRole="button"
            accessibilityLabel="Retry invite details"
          >
            <Text style={styles.primaryButtonText}>Retry</Text>
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
          <Text style={styles.statusTitle}>Roster locked</Text>
          <Text style={styles.statusText}>
            {phase === 'completed'
              ? 'This circle is completed. Membership and payout order cannot be changed.'
              : 'Membership, additional positions, and payout order are locked after the circle starts. New hands cannot be added.'}
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.replace(circleWorkspaceHref(circle.id))}
            accessibilityRole="button"
            accessibilityLabel="Back to circle workspace"
          >
            <Text style={styles.primaryButtonText}>Back to workspace</Text>
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
            accessibilityLabel="Back to circle workspace"
          >
            <FontAwesome name="angle-left" size={24} color={colors.primaryDark} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>Invite hands</Text>
            <Text style={styles.title}>{circle.name}</Text>
          </View>
        </View>

        <Pressable
          style={styles.shareHeroCard}
          onPress={() => void handleShareGenericLink()}
          accessibilityRole="button"
          accessibilityLabel="Share circle invite link"
        >
          <View style={styles.shareHeroIcon}>
            <FontAwesome name="share-alt" size={24} color={colors.primary} />
          </View>
          <View style={styles.shareHeroContent}>
            <Text style={styles.shareHeroTitle}>Share circle invite</Text>
            <Text style={styles.shareHeroText}>
              Code or general link — unmatched joiners go to pending requests
            </Text>
          </View>
        </Pressable>

        {unclaimedHands.length > 0 ? (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Claim invites by hand</Text>
            <Text style={styles.sectionSubtitle}>
              Each unclaimed hand has its own secure claim link. Share the right
              link so the person attaches to that payout position.
            </Text>
            <View style={styles.claimList}>
              {unclaimedHands.map((member, index) => (
                <View key={member.id} style={styles.claimRow}>
                  <View style={styles.claimPosition}>
                    <Text style={styles.claimPositionText}>{index + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.claimName} numberOfLines={1}>
                      {member.displayLabel || memberName(member)}
                    </Text>
                    <Text style={styles.claimMeta}>
                      Awaiting claim
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
                    accessibilityLabel={`Share claim invite for ${memberName(member)}`}
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
                        <Text style={styles.claimShareText}>Share claim</Text>
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
              All hands claimed
            </Text>
            <Text style={[styles.sectionSubtitle, { color: '#15803d' }]}>
              Every planned hand is connected to a CircuSave account. You can
              still share the circle code for new join requests.
            </Text>
          </View>
        )}

        {hasReachedLimit ? (
          <View style={[styles.formCard, { borderColor: colors.warning, borderWidth: 1 }]}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <FontAwesome name="lock" size={32} color={colors.warning} />
            </View>
            <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>
              Hand limit reached
            </Text>
            <Text
              style={[
                styles.sectionSubtitle,
                { textAlign: 'center', marginBottom: 24 },
              ]}
            >
              Free accounts are limited to 20 hands per circle. Upgrade to
              Premium to add more.
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push('/subscription')}
            >
              <Text style={styles.primaryButtonText}>View Plans</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Add a planned hand</Text>
              <Text style={styles.sectionSubtitle}>
                Creates an unclaimed roster position. Share their claim invite
                after saving.
              </Text>
              <View style={styles.formSpacer} />
              <Field
                label="Full name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter member name"
              />
              <Field
                label="Phone or email"
                value={contact}
                onChangeText={setContact}
                placeholder="Phone number or email"
                keyboardType="email-address"
              />
            </View>

            <Pressable
              style={[styles.primaryButton, submitting && styles.disabledButton]}
              disabled={submitting}
              onPress={() => void sendInvite()}
              accessibilityRole="button"
              accessibilityLabel="Add planned hand"
            >
              <Text style={styles.primaryButtonText}>
                {submitting ? 'Saving...' : 'Add planned hand'}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function memberName(member: BackendCircleMember | undefined) {
  return member?.full_name || member?.name || 'Unavailable';
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
