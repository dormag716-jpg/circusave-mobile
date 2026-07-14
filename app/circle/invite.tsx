import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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
  type BackendCircleDetail,
  type BackendCircleMember,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { circleWorkspaceHref } from '@/lib/navigation';
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
        'Invite updated',
        'The person was added to the active roster.'
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

  async function handleShareLink() {
    if (!circle) return;
    try {
      await Share.share({
        message: `Join my savings circle '${circle.name}' on CircuSave! Download the app and sign up to see our round: https://circusave.com/invite/${circle.id}`,
      });
    } catch (error) {
      Alert.alert('Unable to share link', 'An error occurred while trying to open the share menu.');
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
            <Text style={styles.kicker}>Invite Members</Text>
            <Text style={styles.title}>{circle.name}</Text>
          </View>
        </View>

        {hasReachedLimit ? (
          <View style={[styles.formCard, { borderColor: colors.warning, borderWidth: 1 }]}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <FontAwesome name="lock" size={32} color={colors.warning} />
            </View>
            <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>Member Limit Reached</Text>
            <Text style={[styles.sectionSubtitle, { textAlign: 'center', marginBottom: 24 }]}>
              Free accounts are limited to 20 members per circle. Upgrade to Premium to add more members.
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
            <Pressable
              style={styles.shareHeroCard}
              onPress={() => void handleShareLink()}
              accessibilityRole="button"
              accessibilityLabel="Share invite link"
            >
              <View style={styles.shareHeroIcon}>
                <FontAwesome name="share-alt" size={24} color={colors.primary} />
              </View>
              <View style={styles.shareHeroContent}>
                <Text style={styles.shareHeroTitle}>Share invite link</Text>
                <Text style={styles.shareHeroText}>
                  Send a secure link for members to join
                </Text>
              </View>
            </Pressable>

            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Or add manually</Text>
              <Text style={styles.sectionSubtitle}>
                If you know their contact info, add them here
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
              accessibilityLabel="Send invite"
            >
              <Text style={styles.primaryButtonText}>
                {submitting ? 'Sending...' : 'Send Invite'}
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
    gap: 12,
    marginBottom: 18,
  },
  headerCopy: {
    flex: 1,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 18,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  kicker: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    color: colors.textStrong,
    fontSize: 30,
    fontWeight: '900',
    marginTop: 2,
  },
  shareHeroCard: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.card,
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
    padding: 20,
  },
  shareHeroIcon: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  shareHeroContent: {
    flex: 1,
  },
  shareHeroTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  shareHeroText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  formCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 16,
    padding: spacing.card,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  formSpacer: {
    height: 16,
  },
  fieldWrap: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 7,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: '#e7e5e4',
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  noteInput: {
    minHeight: 94,
    paddingTop: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 54,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.55,
  },
  statusCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    margin: spacing.screenX,
    padding: spacing.card,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 12,
  },
  statusText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
});
