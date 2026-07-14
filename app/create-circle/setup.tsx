import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import {
  Alert,
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
      await createCircleFromWizard();
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

  return (
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
                <Text style={styles.label}>Add trusted members</Text>
                <Text style={{ color: colors.muted, marginBottom: 16, fontSize: 14 }}>
                  We'll send them an invite via phone or email.
                </Text>
                <View style={styles.memberForm}>
                  <View style={styles.memberNameRow}>
                    <TextInput
                      style={[styles.input, styles.memberNameInput]}
                      value={newMember.firstName}
                      onChangeText={(firstName) =>
                        setNewMember((current) => ({ ...current, firstName }))
                      }
                      placeholder="First name"
                      placeholderTextColor={colors.subtle}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                    <TextInput
                      style={[styles.input, styles.memberNameInput]}
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
                  <TextInput
                    style={styles.input}
                    value={newMember.phone}
                    onChangeText={(phone) =>
                      setNewMember((current) => ({ ...current, phone }))
                    }
                    placeholder="Phone number"
                    placeholderTextColor={colors.subtle}
                    keyboardType="phone-pad"
                    returnKeyType="next"
                  />
                  <TextInput
                    style={styles.input}
                    value={newMember.email}
                    onChangeText={(email) =>
                      setNewMember((current) => ({ ...current, email }))
                    }
                    placeholder="Email (optional)"
                    placeholderTextColor={colors.subtle}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onSubmitEditing={addMember}
                    returnKeyType="done"
                  />
                  <Pressable
                    style={styles.addBtn}
                    onPress={addMember}
                    accessibilityRole="button"
                    accessibilityLabel="Add member"
                  >
                    <Text style={styles.addBtnText}>Add Member</Text>
                  </Pressable>
                </View>
                {members.length ? (
                  <View style={styles.membersList}>
                    {members.map((member) => (
                      <Pressable
                        key={member.phone}
                        style={styles.memberTag}
                        onPress={() => removeMember(member.phone)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${memberDisplayName(member)}`}
                      >
                        <Text style={styles.memberTagText}>
                          {memberDisplayName(member)}
                        </Text>
                        <FontAwesome
                          name="times"
                          size={12}
                          color={colors.primaryDark}
                        />
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyMembers}>No members added yet.</Text>
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
