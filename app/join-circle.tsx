import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  resolveCircleCode,
  requestJoin,
  type BackendInvitePreview,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { dashboardHref } from '@/lib/navigation';
import { colors, spacing } from '@/lib/theme';

function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

export default function JoinCircleScreen() {
  const { session, setPostAuthTarget } = useAuthSession();
  const token = session?.session.token;
  const [code, setCode] = useState('');
  const [resolving, setResolving] = useState(false);
  const [joining, setJoining] = useState(false);
  const [preview, setPreview] = useState<BackendInvitePreview | null>(null);
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function lookup() {
    if (!code.trim()) {
      Alert.alert('Enter a code', 'Type the code you received from the organizer.');
      return;
    }
    if (!token) {
      setPostAuthTarget('/join-circle');
      router.push('/login');
      return;
    }
    setResolving(true);
    setPreview(null);
    setResolvedId(null);
    setSent(false);
    try {
      const { circleId, preview: p } = await resolveCircleCode(token, code);
      setPreview(p);
      setResolvedId(circleId);
    } catch (e) {
      Alert.alert(
        'Circle not found',
        e instanceof Error ? e.message : 'Check the code and try again.',
      );
    } finally {
      setResolving(false);
    }
  }

  async function join() {
    if (!token || !resolvedId) return;
    setJoining(true);
    try {
      await requestJoin(token, resolvedId);
      setSent(true);
    } catch (e) {
      Alert.alert(
        'Could not request to join',
        e instanceof Error ? e.message : 'An error occurred.',
      );
    } finally {
      setJoining(false);
    }
  }

  function onCode(t: string) {
    const u = t.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setCode(u);
    if (preview) {
      setPreview(null);
      setResolvedId(null);
      setSent(false);
    }
  }

  return (
    <SafeAreaView style={sty.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={sty.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <Pressable
            style={sty.back}
            onPress={() => router.replace(dashboardHref)}
            accessibilityRole="button"
            accessibilityLabel="Back to dashboard"
          >
            <FontAwesome name="angle-left" size={26} color={colors.primary} />
          </Pressable>

          {/* Hero */}
          <View style={sty.hero}>
            <View style={sty.heroIcon}>
              <FontAwesome name="key" size={34} color={colors.primary} />
            </View>
            <Text style={sty.heroTitle}>Join a Circle</Text>
            <Text style={sty.heroSub}>
              Enter the unique code shared by the organizer to request access.
            </Text>
          </View>

          {/* Code input */}
          <View style={sty.card}>
            <Text style={sty.lbl}>CIRCLE CODE</Text>
            <View style={sty.row}>
              <TextInput
                style={sty.input}
                value={code}
                onChangeText={onCode}
                placeholder="CSX-XXXXXXXX"
                placeholderTextColor={colors.subtle}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={lookup}
                maxLength={16}
                accessibilityLabel="Circle code"
              />
              <Pressable
                style={({ pressed }) => [
                  sty.searchBtn,
                  (!code.trim() || resolving) && sty.dim,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={lookup}
                disabled={resolving || !code.trim()}
                accessibilityRole="button"
                accessibilityLabel="Look up circle"
              >
                {resolving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <FontAwesome name="search" size={18} color="#fff" />
                )}
              </Pressable>
            </View>
            <Text style={sty.hint}>
              Codes look like{' '}
              <Text style={{ fontWeight: '800', color: colors.primaryDark }}>
                CSX-A1B2C3D4
              </Text>
            </Text>
          </View>

          {/* Preview card */}
          {preview && !sent ? (
            <View style={sty.previewCard}>
              {/* Header */}
              <View style={sty.previewHead}>
                <View style={sty.previewAvatar}>
                  <FontAwesome name="group" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sty.previewName}>{preview.name}</Text>
                  <Text style={sty.previewOrg}>
                    by {preview.organizerName ?? preview.organizer_name ?? 'Organizer'}
                  </Text>
                </View>
                <View style={sty.badge}>
                  <Text style={sty.badgeTxt}>{cap(preview.status ?? 'Active')}</Text>
                </View>
              </View>

              {/* Stats row */}
              <View style={sty.stats}>
                <View style={sty.stat}>
                  <FontAwesome name="dollar" size={13} color={colors.primary} />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={sty.statLbl}>Contribution</Text>
                    <Text style={sty.statVal}>
                      ${preview.contributionAmount ?? preview.contribution_amount ?? '\u2014'}
                    </Text>
                  </View>
                </View>
                <View style={sty.divider} />
                <View style={sty.stat}>
                  <FontAwesome name="refresh" size={13} color={colors.primary} />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={sty.statLbl}>Frequency</Text>
                    <Text style={sty.statVal}>{cap(preview.frequency)}</Text>
                  </View>
                </View>
                <View style={sty.divider} />
                <View style={sty.stat}>
                  <FontAwesome name="users" size={13} color={colors.primary} />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={sty.statLbl}>Members</Text>
                    <Text style={sty.statVal}>
                      {preview.membersCount ?? preview.members_count ?? '\u2014'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Info */}
              <View style={sty.infoBanner}>
                <FontAwesome name="info-circle" size={14} color="#2563eb" />
                <Text style={sty.infoTxt}>
                  Your request goes to the organizer for approval. You'll be notified once accepted.
                </Text>
              </View>

              {/* Join button */}
              <Pressable
                style={({ pressed }) => [
                  sty.joinBtn,
                  joining && sty.dim,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={join}
                disabled={joining}
                accessibilityRole="button"
                accessibilityLabel="Request to join this circle"
              >
                {joining ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="hand-o-up" size={18} color="#fff" />
                    <Text style={sty.joinTxt}>Request to Join</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : null}

          {/* Success state */}
          {sent ? (
            <View style={sty.success}>
              <View style={sty.checkCircle}>
                <FontAwesome name="check" size={32} color="#059669" />
              </View>
              <Text style={sty.sucTitle}>Request Sent!</Text>
              <Text style={sty.sucTxt}>
                Your request to join{' '}
                <Text style={{ fontWeight: '800' }}>{preview?.name}</Text> has
                been sent. The organizer will review it and you'll be notified
                once approved.
              </Text>
              <Pressable
                style={sty.doneBtn}
                onPress={() => router.replace(dashboardHref)}
                accessibilityRole="button"
              >
                <Text style={sty.doneTxt}>Back to Dashboard</Text>
              </Pressable>
              <Pressable
                style={sty.anotherBtn}
                onPress={() => {
                  setCode('');
                  setPreview(null);
                  setResolvedId(null);
                  setSent(false);
                }}
              >
                <Text style={sty.anotherTxt}>Join another circle</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Not logged in */}
          {!token ? (
            <View style={sty.authNudge}>
              <Text style={sty.authTxt}>
                You need to be signed in to join a circle.
              </Text>
              <Pressable
                style={sty.joinBtn}
                onPress={() => {
                  setPostAuthTarget('/join-circle');
                  router.push('/login');
                }}
                accessibilityRole="button"
              >
                <Text style={sty.joinTxt}>Sign In</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const sty = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.screenX,
    paddingBottom: 60,
    paddingTop: 8,
  },
  back: { width: 44, height: 44, justifyContent: 'center', marginBottom: 8 },
  hero: { alignItems: 'center', marginBottom: 32, paddingTop: 8 },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.primary}12`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.textStrong,
    marginBottom: 8,
  },
  heroSub: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  lbl: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    height: 52,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: `${colors.primary}30`,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '800',
    color: colors.textStrong,
    letterSpacing: 1,
  },
  searchBtn: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dim: { opacity: 0.55 },
  hint: { fontSize: 13, color: colors.muted, marginTop: 10 },
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  previewAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.primary}12`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewName: { fontSize: 18, fontWeight: '900', color: colors.textStrong },
  previewOrg: { fontSize: 13, color: colors.muted, marginTop: 2 },
  badge: {
    backgroundColor: '#d1fae5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeTxt: { fontSize: 12, fontWeight: '800', color: '#059669' },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.primary}06`,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: `${colors.primary}15`,
  },
  statLbl: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statVal: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textStrong,
    marginTop: 2,
  },
  infoBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoTxt: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 19 },
  joinBtn: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    minHeight: 54,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  joinTxt: { color: '#fff', fontSize: 17, fontWeight: '900' },
  success: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: '#d1fae5',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#d1fae5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  sucTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#065f46',
    marginBottom: 8,
  },
  sucTxt: {
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  doneBtn: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    minHeight: 52,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  doneTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  anotherBtn: { paddingVertical: 12 },
  anotherTxt: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  authNudge: { alignItems: 'center', gap: 12, paddingTop: 16 },
  authTxt: { fontSize: 15, color: colors.muted, textAlign: 'center' },
});