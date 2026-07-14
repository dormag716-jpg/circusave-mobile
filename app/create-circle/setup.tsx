import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addCircleMember, createCircle, startCircle, getCircleDetail } from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import {
  circleInviteHref,
  circleWorkspaceHref,
  createCircleHref,
} from '@/lib/navigation';
import { colors, radii, spacing } from '@/lib/theme';

const steps = [
  'Name your circle',
  'Contribution amount',
  'Schedule',
  'Add members',
  'Payout order',
  'Review & Create',
] as const;

const amountPresets = ['$50', '$100', '$200', '$500'] as const;
const scheduleOptions = ['Weekly', 'Bi-weekly', 'Monthly'] as const;

type MemberDraft = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
};

const DRAFT_KEY = 'circle_wizard_draft';

export default function CircleSetupWizardScreen() {
  const { session } = useAuthSession();
  const { sourceCircleId } = useLocalSearchParams<{ sourceCircleId: string }>();
  const [activeStep, setActiveStep] = useState(0);
  const [circleName, setCircleName] = useState('');
  const [amount, setAmount] = useState('$100');
  const [customAmount, setCustomAmount] = useState('');
  const [schedule, setSchedule] = useState('Weekly');
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [newMember, setNewMember] = useState<MemberDraft>({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Draft helpers ──────────────────────────────────────────────────────────
  const saveDraft = useCallback(
    (overrides?: Partial<{ activeStep: number; circleName: string; amount: string; customAmount: string; schedule: string; members: MemberDraft[] }>) => {
      if (sourceCircleId) return; // don't persist template-clone flows
      const draft = {
        activeStep: overrides?.activeStep ?? activeStep,
        circleName: overrides?.circleName ?? circleName,
        amount: overrides?.amount ?? amount,
        customAmount: overrides?.customAmount ?? customAmount,
        schedule: overrides?.schedule ?? schedule,
        members: overrides?.members ?? members,
      };
      SecureStore.setItemAsync(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
    },
    [activeStep, circleName, amount, customAmount, schedule, members, sourceCircleId],
  );

  function clearDraft() {
    SecureStore.deleteItemAsync(DRAFT_KEY).catch(() => {});
  }

  // Auto-save draft 600ms after any state change
  useEffect(() => {
    if (!draftLoaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveDraft(), 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [activeStep, circleName, amount, customAmount, schedule, members, draftLoaded, saveDraft]);

  // Load saved draft on first mount (unless cloning a circle)
  useEffect(() => {
    if (sourceCircleId) {
      setDraftLoaded(true);
      return;
    }
    SecureStore.getItemAsync(DRAFT_KEY).then((raw) => {
      if (!raw) { setDraftLoaded(true); return; }
      try {
        const draft = JSON.parse(raw);
        const hasContent = draft.circleName || (draft.members && draft.members.length > 0);
        if (!hasContent) { setDraftLoaded(true); return; }
        Alert.alert(
          '📋 Resume your circle?',
          `You were in the middle of setting up "${draft.circleName || 'a new circle'}". Would you like to continue where you left off?`,
          [
            {
              text: 'Start fresh',
              style: 'destructive',
              onPress: () => { clearDraft(); setDraftLoaded(true); },
            },
            {
              text: 'Resume',
              onPress: () => {
                setActiveStep(draft.activeStep ?? 0);
                setCircleName(draft.circleName ?? '');
                setAmount(draft.amount ?? '$100');
                setCustomAmount(draft.customAmount ?? '');
                setSchedule(draft.schedule ?? 'Weekly');
                setMembers(draft.members ?? []);
                setDraftLoaded(true);
              },
            },
          ],
          { cancelable: false },
        );
      } catch {
        clearDraft();
        setDraftLoaded(true);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function loadSourceCircle() {
      if (!sourceCircleId || !session?.session.token) return;
      try {
        const detail = await getCircleDetail(session.session.token, sourceCircleId);
        setCircleName(detail.name);
        
        const amtStr = `$${detail.contributionAmount}`;
        if ((amountPresets as readonly string[]).includes(amtStr)) {
          setAmount(amtStr);
        } else {
          setAmount('Custom');
          setCustomAmount(detail.contributionAmount.toString());
        }

        const prefilledMembers: MemberDraft[] = detail.members.map(m => {
          const parts = (m.full_name || m.name || '').trim().split(' ');
          return {
            firstName: parts[0] || '',
            lastName: parts.slice(1).join(' ') || '',
            email: m.email || '',
            phone: m.phone || ''
          };
        });
        // Remove the organizer themselves from the draft members if they are in the list
        // Since the backend handles the organizer automatically during createCircle
        const filteredMembers = prefilledMembers.filter(m => m.email !== session?.user.email);
        setMembers(filteredMembers);
      } catch (e) {
        // Silently ignore, just start fresh
      }
    }
    loadSourceCircle();
  }, [sourceCircleId, session?.session.token]);

  const isLastStep = activeStep === steps.length - 1;
  const contributionAmount = customAmount.trim()
    ? `$${customAmount.trim().replace(/^\$/, '')}`
    : amount;

  function addMember() {
    const member = normalizeMemberDraft(newMember);

    if (!member.firstName || !member.lastName) {
      Alert.alert('Name required', 'Enter the member first and last name.');
      return;
    }
    if (!member.phone) {
      Alert.alert('Phone required', 'Enter a phone number for this member.');
      return;
    }
    if (
      members.some(
        (existingMember) =>
          existingMember.phone === member.phone ||
          memberDisplayName(existingMember).toLowerCase() ===
            memberDisplayName(member).toLowerCase(),
      )
    ) {
      Alert.alert('Duplicate', 'Member already added.');
      return;
    }
    setMembers((currentMembers) => [...currentMembers, member]);
    setNewMember({
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
    });
  }

  function removeMember(phone: string) {
    setMembers((currentMembers) =>
      currentMembers.filter((member) => member.phone !== phone),
    );
  }

  async function goNext() {
    if (isSubmitting) return;

    if (activeStep === 0 && !circleName.trim()) {
      Alert.alert('Name needed', 'Please give your circle a name.');
      return;
    }
    if (activeStep === 1 && !parseAmount(contributionAmount)) {
      Alert.alert('Amount needed', 'Enter a valid contribution amount.');
      return;
    }
    if (activeStep === 3 && members.length < 2) {
      Alert.alert('Add members', 'Add at least 2 members to continue.');
      return;
    }
    if (isLastStep) {
      // Show organizer consent modal instead of immediately creating
      setShowConsentModal(true);
      return;
    }
    setActiveStep((currentStep) =>
      Math.min(currentStep + 1, steps.length - 1),
    );
  }

  function goBack() {
    if (activeStep > 0) {
      setActiveStep((currentStep) => Math.max(currentStep - 1, 0));
      return;
    }
    router.replace(createCircleHref);
  }

  async function createCircleFromWizard() {
    const token = session?.session.token;

    if (!token) {
      Alert.alert('Sign in required', 'Your session is missing an access token.');
      return;
    }

    setIsSubmitting(true);
    try {
      const createdCircle = await createCircle(token, {
        name: circleName.trim() || 'Untitled Circle',
        contributionAmount: requireAmount(contributionAmount),
        frequency: scheduleToFrequency(schedule),
        startDate: todayIsoDate(),
      });

      for (const member of members) {
        await addCircleMember(token, createdCircle.id, {
          firstName: member.firstName,
          lastName: member.lastName,
          phone: member.phone,
          email: member.email || undefined,
        });
      }

      await startCircle(token, createdCircle.id);

      // Circle created — clear the saved draft
      clearDraft();

      Alert.alert(
        'Circle created',
        'Share invites so members can join and claim their spots.',
        [
          {
            text: 'Invite members',
            onPress: () =>
              router.replace(circleInviteHref(createdCircle.id)),
          },
          {
            text: 'Open workspace',
            style: 'cancel',
            onPress: () =>
              router.replace(circleWorkspaceHref(createdCircle.id)),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        'Unable to create circle',
        error instanceof Error
          ? error.message
          : 'The circle could not be created.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Consent modal ──────────────────────────────────────────────────────────
  function ConsentModal() {
    return (
      <Modal
        visible={showConsentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConsentModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 44 }}>

            {/* Icon */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#f3e8ff', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                <FontAwesome name="lock" size={32} color="#7c3aed" />
              </View>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827', textAlign: 'center' }}>Ready to launch?</Text>
              <Text style={{ fontSize: 15, color: '#6b7280', textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
                Once your circle is started, <Text style={{ fontWeight: '800', color: '#111827' }}>you will not be able to add or remove members.</Text> Make sure everyone below is correct before continuing.
              </Text>
            </View>

            {/* Member summary */}
            <View style={{ backgroundColor: '#f9fafb', borderRadius: 16, padding: 16, marginBottom: 20 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Circle Roster ({members.length + 1} members)</Text>
              {/* Organizer row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3e8ff', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                  <FontAwesome name="star" size={14} color="#7c3aed" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>You (Organizer)</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>Receives payout #1</Text>
                </View>
              </View>
              {members.slice(0, 4).map((m, i) => (
                <View key={m.phone} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#ede9fe', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: '#7c3aed' }}>{(m.firstName[0] || '').toUpperCase()}{(m.lastName[0] || '').toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>{memberDisplayName(m)}</Text>
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>{m.phone}</Text>
                  </View>
                </View>
              ))}
              {members.length > 4 ? (
                <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '600', textAlign: 'center', marginTop: 4 }}>+ {members.length - 4} more members</Text>
              ) : null}
            </View>

            {/* Warning banner */}
            <View style={{ flexDirection: 'row', backgroundColor: '#fff7ed', borderRadius: 12, borderWidth: 1, borderColor: '#fed7aa', padding: 12, marginBottom: 24, alignItems: 'flex-start', gap: 10 }}>
              <FontAwesome name="exclamation-triangle" size={16} color="#f97316" style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 13, color: '#92400e', lineHeight: 19 }}>
                <Text style={{ fontWeight: '800' }}>This action is final.</Text> After starting, the member list is locked. Contribution amount and schedule are also locked.
              </Text>
            </View>

            {/* Buttons */}
            <Pressable
              style={({ pressed }) => [{ backgroundColor: '#7c3aed', borderRadius: 20, minHeight: 56, justifyContent: 'center', alignItems: 'center', marginBottom: 12 }, pressed && { opacity: 0.85 }, isSubmitting && { opacity: 0.65 }]}
              onPress={async () => {
                setShowConsentModal(false);
                await createCircleFromWizard();
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900' }}>Yes, start the circle</Text>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [{ borderRadius: 20, minHeight: 52, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' }, pressed && { opacity: 0.7 }]}
              onPress={() => setShowConsentModal(false)}
            >
              <Text style={{ color: '#374151', fontSize: 16, fontWeight: '700' }}>Go back and review</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <>
      <ConsentModal />
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.progressHeader}>
            <Pressable
              onPress={goBack}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <FontAwesome
                name="chevron-left"
                size={22}
                color={colors.text}
              />
            </Pressable>
            <Text style={styles.stepCounter}>
              Step {activeStep + 1} of {steps.length}
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${((activeStep + 1) / steps.length) * 100}%` },
              ]}
            />
          </View>

          <Text style={styles.mainTitle}>{steps[activeStep]}</Text>

          <View style={styles.card}>
            {activeStep === 0 ? (
              <>
                <Text style={styles.label}>
                  What should we call this circle?
                </Text>
                <Text style={{ color: colors.muted, marginBottom: 16, fontSize: 14, lineHeight: 20 }}>
                  A savings circle is a trusted group where everyone contributes and takes turns receiving the full pot.
                </Text>
                <TextInput
                  style={styles.input}
                  value={circleName}
                  onChangeText={setCircleName}
                  placeholder="e.g. Family Savings, Church Group"
                  placeholderTextColor={colors.subtle}
                  autoCapitalize="words"
                  returnKeyType="done"
                />
              </>
            ) : null}

            {activeStep === 1 ? (
              <>
                <Text style={styles.label}>
                  How much will each member contribute?
                </Text>
                <View style={styles.presetRow}>
                  {amountPresets.map((preset) => (
                    <Pressable
                      key={preset}
                      style={[
                        styles.preset,
                        !customAmount &&
                          amount === preset &&
                          styles.presetActive,
                      ]}
                      onPress={() => {
                        setAmount(preset);
                        setCustomAmount('');
                      }}
                    >
                      <Text
                        style={[
                          styles.presetText,
                          !customAmount &&
                            amount === preset &&
                            styles.presetActiveText,
                        ]}
                      >
                        {preset}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  value={customAmount}
                  onChangeText={(value) =>
                    setCustomAmount(value.replace(/[^\d.]/g, ''))
                  }
                  placeholder="Or enter custom amount"
                  placeholderTextColor={colors.subtle}
                  keyboardType="decimal-pad"
                />
              </>
            ) : null}

            {activeStep === 2 ? (
              <>
                <Text style={styles.label}>
                  How often should contributions happen?
                </Text>
                {scheduleOptions.map((option) => (
                  <Pressable
                    key={option}
                    style={[
                      styles.option,
                      schedule === option && styles.optionActive,
                    ]}
                    onPress={() => setSchedule(option)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        schedule === option && styles.optionActiveText,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}

            {activeStep === 3 ? (
              <>
                {/* Header with member count */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={styles.label}>Add trusted members</Text>
                  {members.length > 0 && (
                    <View style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{members.length} added</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: colors.muted, marginBottom: 20, fontSize: 14, lineHeight: 20 }}>
                  We'll send each person an invite via phone or email.
                </Text>

                {/* Input form card */}
                <View style={{ backgroundColor: `${colors.primary}06`, borderRadius: 16, borderWidth: 1, borderColor: `${colors.primary}20`, padding: 16, marginBottom: 20, gap: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>First Name</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: '#fff' }]}
                        value={newMember.firstName}
                        onChangeText={(firstName) =>
                          setNewMember((current) => ({ ...current, firstName }))
                        }
                        placeholder="First name"
                        placeholderTextColor={colors.subtle}
                        autoCapitalize="words"
                        returnKeyType="next"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Last Name</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: '#fff' }]}
                        value={newMember.lastName}
                        onChangeText={(lastName) =>
                          setNewMember((current) => ({ ...current, lastName }))
                        }
                        placeholder="Last name"
                        placeholderTextColor={colors.subtle}
                        autoCapitalize="words"
                        returnKeyType="next"
                      />
                    </View>
                  </View>

                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone Number</Text>
                    <View style={{ position: 'relative' }}>
                      <TextInput
                        style={[styles.input, { backgroundColor: '#fff', paddingLeft: 44 }]}
                        value={newMember.phone}
                        onChangeText={(phone) =>
                          setNewMember((current) => ({ ...current, phone }))
                        }
                        placeholder="(555) 000-0000"
                        placeholderTextColor={colors.subtle}
                        keyboardType="phone-pad"
                        returnKeyType="next"
                      />
                      <View style={{ position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center' }}>
                        <FontAwesome name="phone" size={16} color={colors.primary} />
                      </View>
                    </View>
                  </View>

                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email <Text style={{ color: colors.subtle, fontWeight: '600', textTransform: 'none' }}>(optional)</Text></Text>
                    <View style={{ position: 'relative' }}>
                      <TextInput
                        style={[styles.input, { backgroundColor: '#fff', paddingLeft: 44 }]}
                        value={newMember.email}
                        onChangeText={(email) =>
                          setNewMember((current) => ({ ...current, email }))
                        }
                        placeholder="member@email.com"
                        placeholderTextColor={colors.subtle}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        onSubmitEditing={addMember}
                        returnKeyType="done"
                      />
                      <View style={{ position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center' }}>
                        <FontAwesome name="envelope-o" size={15} color={colors.primary} />
                      </View>
                    </View>
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.addBtn,
                      { flexDirection: 'row', gap: 8 },
                      pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                    ]}
                    onPress={addMember}
                    accessibilityRole="button"
                    accessibilityLabel="Add member"
                  >
                    <FontAwesome name="user-plus" size={16} color="#fff" />
                    <Text style={styles.addBtnText}>Add Member</Text>
                  </Pressable>
                </View>

                {/* Members list — capped height so form stays in view */}
                {members.length > 0 ? (
                  <View style={{ borderRadius: 16, borderWidth: 1, borderColor: `${colors.primary}15`, overflow: 'hidden', backgroundColor: '#fff' }}>
                    {/* Sticky header inside the list box */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Circle Members
                      </Text>
                      <View style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{members.length}</Text>
                      </View>
                    </View>

                    {/* Scrollable list — max 3 cards visible (~228px), scrolls for more */}
                    <ScrollView
                      style={{ maxHeight: 228 }}
                      contentContainerStyle={{ gap: 0 }}
                      nestedScrollEnabled={true}
                      showsVerticalScrollIndicator={true}
                    >
                      {members.map((member, index) => {
                        const initials = `${member.firstName[0] || ''}${member.lastName[0] || ''}`.toUpperCase();
                        const avatarColors = ['#7c3aed', '#059669', '#d97706', '#dc2626', '#2563eb', '#0891b2'];
                        const avatarBg = avatarColors[index % avatarColors.length];
                        return (
                          <View key={member.phone}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 }}>
                              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${avatarBg}15`, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 2, borderColor: `${avatarBg}25` }}>
                                <Text style={{ color: avatarBg, fontSize: 14, fontWeight: '900' }}>{initials}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>{memberDisplayName(member)}</Text>
                                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 1 }}>{member.phone}{member.email ? ` · ${member.email}` : ''}</Text>
                              </View>
                              <Pressable
                                onPress={() => removeMember(member.phone)}
                                style={({ pressed }) => [{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center' }, pressed && { opacity: 0.7 }]}
                                accessibilityRole="button"
                                accessibilityLabel={`Remove ${memberDisplayName(member)}`}
                              >
                                <FontAwesome name="times" size={12} color="#ef4444" />
                              </Pressable>
                            </View>
                            {index < members.length - 1 ? (
                              <View style={{ height: 1, backgroundColor: '#f3f4f6', marginLeft: 66 }} />
                            ) : null}
                          </View>
                        );
                      })}
                    </ScrollView>

                    {/* Scroll hint when there are many members */}
                    {members.length > 3 ? (
                      <View style={{ paddingVertical: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#fafafa' }}>
                        <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600' }}>
                          <FontAwesome name="arrows-v" size={11} color={colors.muted} /> Scroll to see all {members.length} members
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: `${colors.primary}10`, justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                      <FontAwesome name="users" size={28} color={colors.primary} />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 4 }}>No members yet</Text>
                    <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>Add at least 2 trusted people to start your circle.</Text>
                  </View>
                )}
              </>
            ) : null}

            {activeStep === 4 ? (
              <View>
                <Text style={styles.label}>Set the payout order</Text>
                <Text style={{ color: colors.muted, marginBottom: 16, fontSize: 14, lineHeight: 20 }}>
                  You (the organizer) will receive the first payout by default. Set the order for your invited members below.
                </Text>
                <View style={styles.reviewMembers}>
                  {members.map((member, index) => (
                    <View key={member.phone} style={[styles.memberTag, { justifyContent: 'space-between', paddingVertical: 14, marginBottom: 8 }]}>
                      <Text style={[styles.memberTagText, { fontSize: 15 }]}>
                        {index + 2}. {memberDisplayName(member)}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 16 }}>
                        {index > 0 ? (
                          <Pressable onPress={() => {
                            const newMembers = [...members];
                            const temp = newMembers[index - 1];
                            newMembers[index - 1] = newMembers[index];
                            newMembers[index] = temp;
                            setMembers(newMembers);
                          }}>
                            <FontAwesome name="arrow-up" size={18} color={colors.primary} />
                          </Pressable>
                        ) : (
                          <View style={{ width: 18 }} />
                        )}
                        {index < members.length - 1 ? (
                          <Pressable onPress={() => {
                            const newMembers = [...members];
                            const temp = newMembers[index + 1];
                            newMembers[index + 1] = newMembers[index];
                            newMembers[index] = temp;
                            setMembers(newMembers);
                          }}>
                            <FontAwesome name="arrow-down" size={18} color={colors.primary} />
                          </Pressable>
                        ) : (
                          <View style={{ width: 18 }} />
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {isLastStep ? (
              <View>
                <Text style={styles.label}>Review your circle</Text>
                
                <View style={styles.reviewSummaryCard}>
                  <View style={styles.reviewSummaryHeader}>
                    <Text style={styles.reviewSummaryName}>{circleName || 'Untitled Circle'}</Text>
                    <View style={styles.reviewSummaryBadge}>
                      <Text style={styles.reviewSummaryBadgeText}>{schedule}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.reviewSummaryRow}>
                    <View style={styles.reviewSummaryStat}>
                      <Text style={styles.reviewSummaryStatLabel}>Contribution</Text>
                      <Text style={styles.reviewSummaryStatValue}>{contributionAmount || '$100'}</Text>
                    </View>
                    <View style={styles.reviewSummaryStat}>
                      <Text style={styles.reviewSummaryStatLabel}>Pot Size</Text>
                      <Text style={styles.reviewSummaryStatValue}>
                        ${(requireAmount(contributionAmount) * (members.length + 1)).toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.reviewSummaryStat}>
                      <Text style={styles.reviewSummaryStatLabel}>Members</Text>
                      <Text style={styles.reviewSummaryStatValue}>{members.length + 1}</Text>
                    </View>
                  </View>
                </View>

                <Text style={[styles.label, { marginTop: 24 }]}>Payout Order</Text>
                <ScrollView 
                  style={{ maxHeight: 360, marginHorizontal: -4, paddingHorizontal: 4 }} 
                  contentContainerStyle={styles.reviewMembersList}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={true}
                >
                  <View style={styles.reviewMemberCard}>
                    <View style={styles.reviewMemberAvatar}>
                      <Text style={styles.reviewMemberAvatarText}>1</Text>
                    </View>
                    <View style={styles.reviewMemberInfo}>
                      <Text style={styles.reviewMemberName}>You (Organizer)</Text>
                      <Text style={styles.reviewMemberSub}>Receives the first payout</Text>
                    </View>
                  </View>
                  
                  {members.map((member, index) => (
                    <View key={member.phone} style={styles.reviewMemberCard}>
                      <View style={styles.reviewMemberAvatar}>
                        <Text style={styles.reviewMemberAvatarText}>{index + 2}</Text>
                      </View>
                      <View style={styles.reviewMemberInfo}>
                        <Text style={styles.reviewMemberName}>{memberDisplayName(member)}</Text>
                        <Text style={styles.reviewMemberSub}>{member.phone}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>

          <View style={styles.navRow}>
            <Pressable
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.pressed,
              ]}
              onPress={goBack}
              accessibilityRole="button"
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.nextButton,
                isSubmitting && styles.disabledButton,
                pressed && styles.pressed,
              ]}
              onPress={goNext}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.nextText}>
                  {isLastStep ? 'Create Circle' : 'Continue'}
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewItem}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

function parseAmount(value: string) {
  const amount = Number(value.replace(/[$,\s]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function requireAmount(value: string) {
  const amount = parseAmount(value);
  if (!amount) {
    throw new Error('Enter a valid contribution amount.');
  }
  return amount;
}

function scheduleToFrequency(value: string): 'weekly' | 'biweekly' | 'monthly' {
  if (value === 'Bi-weekly') return 'biweekly';
  if (value === 'Monthly') return 'monthly';
  return 'weekly';
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeMemberDraft(member: MemberDraft): MemberDraft {
  return {
    email: member.email.trim().toLowerCase(),
    firstName: member.firstName.trim(),
    lastName: member.lastName.trim(),
    phone: member.phone.trim(),
  };
}

function memberDisplayName(member: MemberDraft) {
  return `${member.firstName} ${member.lastName}`.trim();
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 100,
    paddingHorizontal: spacing.screenX,
    paddingTop: 20,
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 14,
  },
  backBtn: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  stepCounter: {
    color: colors.muted,
    fontWeight: '700',
    marginLeft: 'auto',
  },
  progressTrack: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    height: 8,
    marginBottom: 24,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    height: '100%',
  },
  mainTitle: {
    color: colors.textStrong,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: 30,
    padding: 24,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  preset: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  presetActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetText: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  presetActiveText: {
    color: '#ffffff',
  },
  option: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    padding: 16,
  },
  optionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  optionActiveText: {
    color: '#ffffff',
  },
  memberForm: {
    gap: 10,
    marginBottom: 16,
  },
  memberNameRow: {
    flexDirection: 'row',
    gap: 10,
  },
  memberNameInput: {
    flex: 1,
  },
  addBtn: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 24,
  },
  addBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  membersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  memberTag: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  memberTagText: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  emptyMembers: {
    color: colors.muted,
    fontSize: 13,
  },
  reviewItem: {
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  reviewLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  reviewValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  reviewMembers: {
    gap: 6,
    marginTop: 16,
  },
  reviewSummaryCard: {
    backgroundColor: `${colors.primary}08`,
    borderColor: `${colors.primary}20`,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 20,
    marginBottom: 8,
  },
  reviewSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  reviewSummaryName: {
    color: colors.textStrong,
    fontSize: 22,
    fontWeight: '900',
    flex: 1,
  },
  reviewSummaryBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  reviewSummaryBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  reviewSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reviewSummaryStat: {
    flex: 1,
  },
  reviewSummaryStatLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  reviewSummaryStatValue: {
    color: colors.textStrong,
    fontSize: 20,
    fontWeight: '900',
  },
  reviewMembersList: {
    gap: 12,
  },
  reviewMemberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  reviewMemberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  reviewMemberAvatarText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 16,
  },
  reviewMemberInfo: {
    flex: 1,
  },
  reviewMemberName: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: '800',
  },
  reviewMemberSub: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  navRow: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    alignItems: 'center',
    borderColor: colors.primary,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 58,
  },
  backText: {
    color: colors.primary,
    fontWeight: '700',
  },
  nextButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 58,
  },
  nextText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.65,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
});
