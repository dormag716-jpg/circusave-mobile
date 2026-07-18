import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

import { createCircle, getCircleDetail, getCircles } from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import {
  buildOpenCircleCapacity,
  openCircleLimitMessage,
} from '@/lib/circleCapacity';
import {
  applyDraftDefaults,
  buildCreateCirclePayload,
  buildPlannedMemberRows,
  calculateCircleMetrics,
  createMemberDraftId,
  ensureMemberDraftId,
  handDisplayLabel,
  isOrganizerSelf,
  memberDisplayName,
  PAYOUT_ORDER_DEFERRED_COPY,
  validateMinimumHands,
  validatePlanCapacity,
  type MemberDraft,
} from '@/lib/createCircleWizard';
import {
  circleWorkspaceHref,
  createCircleHref,
} from '@/lib/navigation';
import { colors, radii, spacing } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';
import { DecisionSheet } from '@/components/DecisionSheet';
import { CREATE_CIRCLE_STEPS } from '@/lib/createCircleFlow';

/** Initial wizard: organizer-alone setup only. Payout order is finalized later. */
const steps = CREATE_CIRCLE_STEPS.map((step) => step.title);

const amountPresets = ['$50', '$100', '$200', '$500'] as const;
const scheduleOptions = ['Weekly', 'Bi-weekly', 'Monthly'] as const;

const DRAFT_KEY = 'circle_wizard_draft';

const emptyNewMember = (): MemberDraft => ({
  draftId: '',
  email: '',
  firstName: '',
  lastName: '',
  phone: '',
  handNumber: 1,
});

export default function CircleSetupWizardScreen() {
  const { session } = useAuthSession();
  const { sourceCircleId } = useLocalSearchParams<{ sourceCircleId: string }>();
  const [activeStep, setActiveStep] = useState(0);
  const [circleName, setCircleName] = useState('');
  const [amount, setAmount] = useState('$100');
  const [customAmount, setCustomAmount] = useState('');
  const [schedule, setSchedule] = useState('Weekly');
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [organizerParticipates, setOrganizerParticipates] = useState(true);
  const [newMember, setNewMember] = useState<MemberDraft>(emptyNewMember());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [createdCircleId, setCreatedCircleId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const organizerName = session?.user.name?.trim() || 'Organizer';
  const organizerIdentity = {
    id: session?.user.id,
    name: session?.user.name,
    email: session?.user.email,
    phone: null as string | null,
  };

  const contributionAmount = customAmount.trim()
    ? `$${customAmount.trim().replace(/^\$/, '')}`
    : amount;
  const contributionValue = parseAmount(contributionAmount) ?? 0;
  const metrics = useMemo(
    () => calculateCircleMetrics(members, organizerParticipates, contributionValue),
    [members, organizerParticipates, contributionValue],
  );
  const plannedRows = useMemo(
    () => buildPlannedMemberRows(members, organizerParticipates, organizerName),
    [members, organizerParticipates, organizerName],
  );

  const saveDraft = useCallback(
    (
      overrides?: Partial<{
        activeStep: number;
        circleName: string;
        amount: string;
        customAmount: string;
        schedule: string;
        members: MemberDraft[];
        organizerParticipates: boolean;
      }>,
    ) => {
      if (sourceCircleId) return;
      const draft = {
        activeStep: overrides?.activeStep ?? activeStep,
        circleName: overrides?.circleName ?? circleName,
        amount: overrides?.amount ?? amount,
        customAmount: overrides?.customAmount ?? customAmount,
        schedule: overrides?.schedule ?? schedule,
        members: overrides?.members ?? members,
        organizerParticipates:
          overrides?.organizerParticipates ?? organizerParticipates,
      };
      SecureStore.setItemAsync(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
    },
    [
      activeStep,
      circleName,
      amount,
      customAmount,
      schedule,
      members,
      organizerParticipates,
      sourceCircleId,
    ],
  );

  function clearDraft() {
    SecureStore.deleteItemAsync(DRAFT_KEY).catch(() => {});
  }

  useEffect(() => {
    if (!draftLoaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveDraft(), 600);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    activeStep,
    circleName,
    amount,
    customAmount,
    schedule,
    members,
    organizerParticipates,
    draftLoaded,
    saveDraft,
  ]);

  useEffect(() => {
    if (sourceCircleId) {
      setDraftLoaded(true);
      return;
    }
    SecureStore.getItemAsync(DRAFT_KEY).then((raw) => {
      if (!raw) {
        setDraftLoaded(true);
        return;
      }
      try {
        const draft = JSON.parse(raw);
        const hasContent =
          draft.circleName || (draft.members && draft.members.length > 0);
        if (!hasContent) {
          setDraftLoaded(true);
          return;
        }
        Alert.alert(
          '📋 Resume your circle?',
          `You were in the middle of setting up "${draft.circleName || 'a new circle'}". Would you like to continue where you left off?`,
          [
            {
              text: 'Start fresh',
              style: 'destructive',
              onPress: () => {
                clearDraft();
                setDraftLoaded(true);
              },
            },
            {
              text: 'Resume',
              onPress: () => {
                const restored = applyDraftDefaults(draft, steps.length - 1);
                setActiveStep(restored.activeStep);
                setCircleName(restored.circleName);
                setAmount(restored.amount);
                setCustomAmount(restored.customAmount);
                setSchedule(restored.schedule);
                setMembers(restored.members);
                setOrganizerParticipates(restored.organizerParticipates);
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

        const prefilledMembers: MemberDraft[] = detail.members
          .map((m) => {
            const parts = (m.full_name || m.name || '').trim().split(' ');
            return ensureMemberDraftId({
              draftId: createMemberDraftId(),
              firstName: parts[0] || '',
              lastName: parts.slice(1).join(' ') || '',
              email: m.email || '',
              phone: m.phone || '',
              handNumber: 1,
            });
          })
          .filter(
            (m) =>
              !isOrganizerSelf(m, {
                email: session?.user.email,
                phone: null,
              }),
          );
        setMembers(prefilledMembers);
        setOrganizerParticipates(true);
      } catch {
        // Start fresh on load failure.
      }
    }
    void loadSourceCircle();
  }, [sourceCircleId, session?.session.token, session?.user.email]);

  const isLastStep = activeStep === steps.length - 1;

  function addMember() {
    const normalized = normalizeMemberDraft(newMember);

    if (!normalized.firstName || !normalized.lastName) {
      Alert.alert('Name required', 'Enter the member first and last name.');
      return;
    }
    if (!normalized.phone) {
      Alert.alert('Phone required', 'Enter a phone number for this member.');
      return;
    }
    if (isOrganizerSelf(normalized, organizerIdentity)) {
      Alert.alert(
        'Already the organizer',
        'You are already the organizer. Choose your participation on the previous step instead of adding yourself as a member.',
      );
      return;
    }
    if (
      members.some(
        (existingMember) =>
          existingMember.phone === normalized.phone ||
          memberDisplayName(existingMember).toLowerCase() ===
            memberDisplayName(normalized).toLowerCase(),
      )
    ) {
      Alert.alert('Duplicate', 'Member already added.');
      return;
    }

    const nextMembers = [
      ...members,
      {
        ...normalized,
        draftId: normalized.draftId || createMemberDraftId(),
        handNumber: 1,
      },
    ];
    const capError = validatePlanCapacity(
      nextMembers,
      organizerParticipates,
      session?.user?.role,
    );
    if (capError) {
      Alert.alert('Plan limit', capError);
      return;
    }

    setMembers(nextMembers);
    setNewMember(emptyNewMember());
  }

  function removeMember(draftId: string) {
    setMembers((current) => current.filter((member) => member.draftId !== draftId));
  }

  async function goNext() {
    if (isSubmitting) return;

    if (activeStep === 0 && !circleName.trim()) {
      Alert.alert('Name needed', 'Please give your circle a name.');
      return;
    }
    if (activeStep === 1) {
      if (!parseAmount(contributionAmount)) {
        Alert.alert('Amount needed', 'Enter a valid contribution amount.');
        return;
      }
    }
    if (activeStep === 4) {
      if (!schedule) {
        Alert.alert('Schedule needed', 'Choose how often contributions happen.');
        return;
      }
    }
    if (activeStep === 3) {
      const minError = validateMinimumHands(members, organizerParticipates);
      if (minError) {
        Alert.alert('Add members', minError);
        return;
      }
    }
    if (isLastStep) {
      const minError = validateMinimumHands(members, organizerParticipates);
      if (minError) {
        Alert.alert('Cannot create circle', minError);
        return;
      }
      const capError = validatePlanCapacity(
        members,
        organizerParticipates,
        session?.user?.role,
      );
      if (capError) {
        Alert.alert('Plan limit', capError);
        return;
      }
      setShowConsentModal(true);
      return;
    }
    setActiveStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function goBack() {
    if (activeStep > 0) {
      setActiveStep((current) => Math.max(current - 1, 0));
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
      // Free plan: block a second open circle before calling the API.
      try {
        const existing = await getCircles(token);
        const openCap = buildOpenCircleCapacity({
          circles: existing,
          organizerRoleOrTier: session?.user?.role,
          organizerOwnedOnly: true,
        });
        if (openCap.atCapacity) {
          Alert.alert(
            'Free plan limit',
            openCircleLimitMessage(openCap),
            openCap.primaryOpenCircleId
              ? [
                  {
                    text: 'Open existing',
                    onPress: () =>
                      router.replace(
                        circleWorkspaceHref(openCap.primaryOpenCircleId!),
                      ),
                  },
                  { text: 'OK', style: 'cancel' },
                ]
              : [{ text: 'OK' }],
          );
          return;
        }
      } catch {
        // Server still enforces; continue if list fails.
      }

      const payload = buildCreateCirclePayload({
        circleName: circleName.trim() || 'Untitled Circle',
        contributionAmount: requireAmount(contributionAmount),
        frequency: scheduleToFrequency(schedule),
        startDate: todayIsoDate(),
        members,
        organizerParticipates,
      });

      const createdCircle = await createCircle(token, payload);
      clearDraft();
      setCreatedCircleId(createdCircle.id);
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

  function ConsentModal() {
    return (
      <Modal
        visible={showConsentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConsentModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 28,
              paddingBottom: 44,
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: '#f3e8ff',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <FontAwesome name="lock" size={32} color="#7c3aed" />
              </View>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '900',
                  color: '#111827',
                  textAlign: 'center',
                }}
              >
                Create this circle?
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  color: '#6b7280',
                  textAlign: 'center',
                  marginTop: 8,
                  lineHeight: 22,
                }}
              >
                Your circle will be created as a draft so you can invite members,
                handle claims, and approve additional hands. Payout order and
                Start Circle come later — not in this step.
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                backgroundColor: '#fff7ed',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#fed7aa',
                padding: 12,
                marginBottom: 24,
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <FontAwesome
                name="exclamation-triangle"
                size={16}
                color="#f97316"
                style={{ marginTop: 1 }}
              />
              <Text style={{ flex: 1, fontSize: 13, color: '#92400e', lineHeight: 19 }}>
                <Text style={{ fontWeight: '800' }}>Starting is separate.</Text>{' '}
                Creating the circle does not start it or finalize payout order.
                Continue setup on the People tab after creation.
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                {
                  backgroundColor: '#7c3aed',
                  borderRadius: 20,
                  minHeight: 56,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 12,
                },
                pressed && { opacity: 0.85 },
                isSubmitting && { opacity: 0.65 },
              ]}
              onPress={async () => {
                setShowConsentModal(false);
                await createCircleFromWizard();
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900' }}>
                  Create Circle
                </Text>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                {
                  borderRadius: 20,
                  minHeight: 52,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#e5e7eb',
                },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setShowConsentModal(false)}
            >
              <Text style={{ color: '#374151', fontSize: 16, fontWeight: '700' }}>
                Go back and review
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <>
      <ConsentModal />
      <DecisionSheet
        visible={Boolean(createdCircleId)}
        onClose={() => undefined}
        icon="check"
        iconTone="success"
        title="Draft circle created"
        body="Your circle is ready for setup. Invite members, review claims and additional hands, then finalize payout order before starting."
        primaryLabel="Continue setup"
        secondaryLabel={null}
        onPrimary={() => {
          if (createdCircleId) {
            router.replace(circleWorkspaceHref(createdCircleId, 'people'));
          }
        }}
      />
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
                <FontAwesome name="chevron-left" size={22} color={colors.text} />
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
              {/* STEP 1 — Circle details */}
              {activeStep === 0 ? (
                <>
                  <Text style={styles.label}>What should we call this circle?</Text>
                  <Text
                    style={{
                      color: colors.muted,
                      marginBottom: 16,
                      fontSize: 14,
                      lineHeight: 20,
                    }}
                  >
                    A savings circle is a trusted group where each active hand
                    contributes and takes turns receiving the full pot.
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

              {/* STEP 2 — Contribution setup */}
              {activeStep === 1 ? (
                <>
                  <Text style={styles.label}>How much will each hand contribute?</Text>
                  <Text
                    style={{
                      color: colors.muted,
                      marginBottom: 16,
                      fontSize: 14,
                      lineHeight: 20,
                    }}
                  >
                    Each active hand contributes this amount every round.
                  </Text>
                  <View style={styles.presetRow}>
                    {amountPresets.map((preset) => (
                      <Pressable
                        key={preset}
                        style={[
                          styles.preset,
                          !customAmount && amount === preset && styles.presetActive,
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

              {/* STEP 3 — Organizer participation */}
              {activeStep === 2 ? (
                <>
                  <Text style={styles.label}>
                    Will you contribute and receive a payout in this circle?
                  </Text>
                  <Pressable
                    style={[
                      styles.option,
                      organizerParticipates && styles.optionActive,
                    ]}
                    onPress={() => setOrganizerParticipates(true)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: organizerParticipates }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        organizerParticipates && styles.optionActiveText,
                      ]}
                    >
                      Yes, I will participate
                    </Text>
                    <Text
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        lineHeight: 18,
                        color: organizerParticipates ? '#f5f3ff' : colors.muted,
                      }}
                    >
                      You will contribute every round and receive a payout.
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.option,
                      !organizerParticipates && styles.optionActive,
                    ]}
                    onPress={() => setOrganizerParticipates(false)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: !organizerParticipates }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        !organizerParticipates && styles.optionActiveText,
                      ]}
                    >
                      No, I will organize only
                    </Text>
                    <Text
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        lineHeight: 18,
                        color: !organizerParticipates ? '#f5f3ff' : colors.muted,
                      }}
                    >
                      You will manage the circle without contributing or receiving
                      a payout.
                    </Text>
                  </Pressable>
                  {organizerParticipates ? (
                    <Text
                      style={{
                        marginTop: 8,
                        fontSize: 13,
                        color: colors.muted,
                        lineHeight: 18,
                      }}
                    >
                      You start with Hand 1. Payout position is set later after
                      members claim spots and any additional hands are approved.
                      You can request more hands from the circle People tab during
                      setup.
                    </Text>
                  ) : null}
                </>
              ) : null}

              {/* STEP 4 — Add members (other people only) */}
              {activeStep === 3 ? (
                <>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <Text style={styles.label}>Add other people</Text>
                    {members.length > 0 ? (
                      <View
                        style={{
                          backgroundColor: colors.primary,
                          borderRadius: 12,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text
                          style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}
                        >
                          {members.length} added
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={{
                      color: colors.muted,
                      marginBottom: 20,
                      fontSize: 14,
                      lineHeight: 20,
                    }}
                  >
                    Do not add yourself here. Your participation is set on the
                    previous step. Each person starts with Hand 1.
                  </Text>

                  <View
                    style={{
                      backgroundColor: `${colors.primary}06`,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: `${colors.primary}20`,
                      padding: 16,
                      marginBottom: 20,
                      gap: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>First Name</Text>
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
                        <Text style={styles.fieldLabel}>Last Name</Text>
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
                      <Text style={styles.fieldLabel}>Phone Number</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: '#fff' }]}
                        value={newMember.phone}
                        onChangeText={(phone) =>
                          setNewMember((current) => ({ ...current, phone }))
                        }
                        placeholder="(555) 000-0000"
                        placeholderTextColor={colors.subtle}
                        keyboardType="phone-pad"
                        returnKeyType="next"
                      />
                    </View>

                    <View>
                      <Text style={styles.fieldLabel}>
                        Email{' '}
                        <Text
                          style={{
                            color: colors.subtle,
                            fontWeight: '600',
                            textTransform: 'none',
                          }}
                        >
                          (optional)
                        </Text>
                      </Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: '#fff' }]}
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

                  {members.length > 0 ? (
                    <View
                      style={{
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: `${colors.primary}15`,
                        overflow: 'hidden',
                        backgroundColor: '#fff',
                      }}
                    >
                      {members.map((member, index) => (
                        <View key={member.draftId}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingHorizontal: 14,
                              paddingVertical: 10,
                            }}
                          >
                            <View style={{ marginRight: 12 }}>
                              <Avatar name={memberDisplayName(member)} size={40} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  fontSize: 15,
                                  fontWeight: '800',
                                  color: '#111827',
                                }}
                              >
                                {handDisplayLabel(
                                  memberDisplayName(member),
                                  member.handNumber ?? 1,
                                )}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 13,
                                  color: colors.muted,
                                  marginTop: 1,
                                }}
                              >
                                {member.phone}
                                {member.email ? ` · ${member.email}` : ''}
                              </Text>
                            </View>
                            <Pressable
                              onPress={() => removeMember(member.draftId)}
                              style={({ pressed }) => [
                                {
                                  width: 30,
                                  height: 30,
                                  borderRadius: 15,
                                  backgroundColor: '#fee2e2',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                },
                                pressed && { opacity: 0.7 },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${memberDisplayName(member)}`}
                            >
                              <FontAwesome name="times" size={12} color="#ef4444" />
                            </Pressable>
                          </View>
                          {index < members.length - 1 ? (
                            <View
                              style={{
                                height: 1,
                                backgroundColor: '#f3f4f6',
                                marginLeft: 66,
                              }}
                            />
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: '800',
                          color: colors.text,
                          marginBottom: 4,
                        }}
                      >
                        No members yet
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          color: colors.muted,
                          textAlign: 'center',
                        }}
                      >
                        {organizerParticipates
                          ? 'Add at least 1 other person so the circle has 2 hands.'
                          : 'Add at least 2 people (you are organizing only).'}
                      </Text>
                    </View>
                  )}
                </>
              ) : null}

              {/* STEP 5 — Schedule and deterministic estimate preview */}
              {activeStep === 4 ? (
                <>
                  <Text style={styles.label}>How often should contributions happen?</Text>
                  <Text style={styles.helperText}>
                    This schedule is saved with the circle. Payout order is completed after creation.
                  </Text>
                  {scheduleOptions.map((option) => (
                    <Pressable
                      key={option}
                      style={[styles.option, schedule === option && styles.optionActive]}
                      onPress={() => setSchedule(option)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: schedule === option }}
                    >
                      <Text style={[styles.optionText, schedule === option && styles.optionActiveText]}>
                        {option}
                      </Text>
                    </Pressable>
                  ))}

                  <View style={[styles.infoBox, { marginTop: 16 }]}>
                    <Text style={styles.infoText}>{PAYOUT_ORDER_DEFERRED_COPY}</Text>
                  </View>
                </>
              ) : null}

              {/* STEP 6 — Review draft structure (no payout order finalization) */}
              {isLastStep ? (
                <View>
                  <Text style={styles.label}>Review draft circle</Text>
                  <Text
                    style={{
                      color: colors.muted,
                      marginBottom: 16,
                      fontSize: 14,
                      lineHeight: 20,
                    }}
                  >
                    This creates a draft only. You will not start the circle yet.
                  </Text>

                  <View style={styles.reviewSummaryCard}>
                    <View style={styles.reviewSummaryHeader}>
                      <Text style={styles.reviewSummaryName}>
                        {circleName || 'Untitled Circle'}
                      </Text>
                      <View style={styles.reviewSummaryBadge}>
                        <Text style={styles.reviewSummaryBadgeText}>{schedule}</Text>
                      </View>
                    </View>

                    <View style={styles.metricsGrid}>
                      <MetricCell
                        label="Contribution"
                        value={formatMoney(metrics.contributionPerHand)}
                      />
                      <MetricCell label="Frequency" value={schedule} />
                      <MetricCell
                        label="Organizer"
                        value={organizerParticipates ? 'Participates' : 'Organize only'}
                      />
                      <MetricCell
                        label="Planned people"
                        value={String(metrics.people)}
                      />
                      <MetricCell
                        label="Planned hands"
                        value={String(metrics.totalHands)}
                      />
                      <MetricCell
                        label="Estimated rounds"
                        value={String(metrics.rounds)}
                      />
                      <MetricCell
                        label="Estimated pot / round"
                        value={formatMoney(metrics.potSize)}
                      />
                    </View>
                    {!organizerParticipates ? (
                      <Text
                        style={{
                          marginTop: 12,
                          fontSize: 12,
                          color: colors.muted,
                          lineHeight: 17,
                        }}
                      >
                        You are organizing only and are not counted in people, hands,
                        pot size, or rounds.
                      </Text>
                    ) : null}
                  </View>

                  <View
                    style={{
                      marginTop: 16,
                      marginBottom: 8,
                      backgroundColor: '#eff6ff',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      padding: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: '#1e40af',
                        lineHeight: 19,
                        fontWeight: '600',
                      }}
                    >
                      {PAYOUT_ORDER_DEFERRED_COPY}
                    </Text>
                  </View>

                  <Text style={[styles.label, { marginTop: 16 }]}>
                    Planned members
                  </Text>
                  <ScrollView
                    style={{ maxHeight: 360, marginHorizontal: -4, paddingHorizontal: 4 }}
                    contentContainerStyle={styles.reviewMembersList}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                  >
                    {plannedRows.map((row) => (
                      <View key={row.key} style={styles.reviewMemberCard}>
                        <View style={styles.reviewMemberAvatar}>
                          {row.isOrganizer ? (
                            <FontAwesome name="star" size={14} color="#7c3aed" />
                          ) : (
                            <Text style={styles.reviewMemberAvatarText}>
                              {row.handNumber}
                            </Text>
                          )}
                        </View>
                        <View style={styles.reviewMemberInfo}>
                          <Text style={styles.reviewMemberName}>{row.label}</Text>
                          <Text style={styles.reviewMemberSub}>{row.roleLabel}</Text>
                        </View>
                        {row.isOrganizer ? (
                          <View style={styles.organizerBadge}>
                            <Text style={styles.organizerBadgeText}>Organizer</Text>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>

            <View style={styles.navRow}>
              <Pressable
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
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

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
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

function formatMoney(amount: number) {
  return `$${Math.round(amount).toLocaleString()}`;
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
    draftId: member.draftId || createMemberDraftId(),
    email: member.email.trim().toLowerCase(),
    firstName: member.firstName.trim(),
    lastName: member.lastName.trim(),
    phone: member.phone.trim(),
    handNumber: 1,
  };
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
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  helperText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  infoText: {
    color: '#1e40af',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
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
  reviewMembers: {
    gap: 0,
  },
  reviewSummaryCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 18,
  },
  reviewSummaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  reviewSummaryName: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    marginRight: 12,
  },
  reviewSummaryBadge: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  reviewSummaryBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCell: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: '30%',
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  reviewMembersList: {
    gap: 10,
    paddingBottom: 8,
  },
  reviewMemberCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 12,
  },
  reviewMemberAvatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginRight: 12,
    width: 36,
  },
  reviewMemberAvatarText: {
    color: colors.primaryDark,
    fontWeight: '900',
  },
  reviewMemberInfo: {
    flex: 1,
  },
  reviewMemberName: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: '800',
  },
  reviewMemberSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  organizerBadge: {
    backgroundColor: '#f3e8ff',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  organizerBadgeText: {
    color: '#7c3aed',
    fontSize: 11,
    fontWeight: '800',
  },
  navRow: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
  },
  backText: {
    color: colors.text,
    fontWeight: '800',
  },
  nextButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 16,
    flex: 1.4,
    justifyContent: 'center',
    minHeight: 56,
  },
  nextText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.65,
  },
  pressed: {
    opacity: 0.88,
  },
});
