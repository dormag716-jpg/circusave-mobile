import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  approveContribution,
  getCircleDetail,
  getCircleSchedule,
  getLedgerEntries,
  releasePayoutFromPot,
  rejectContribution,
  sendContributionReminder,
  submitContribution,
  type BackendCircleDetail,
  type BackendCircleMember,
  type BackendLedgerEntry,
  type BackendRoundContribution,
  type BackendRoundSnapshot,
  type BackendScheduleRound,
  type BackendWalletSnapshot,
  requestPositionSwap,
  getMemberAccessToken,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { circleInviteHref, circlePaymentSetupHref, contributionHref, myCirclesHref } from '@/lib/navigation';
import { colors, radii, spacing } from '@/lib/theme';
import ChatFeed from '@/components/ChatFeed';
import ChatInput from '@/components/ChatInput';
import { useChat } from '@/lib/useChat';

type ActiveTab = 'round' | 'chat' | 'people' | 'records';

type ContributionStatusView = {
  label: string;
  raw: string;
};

const tabs: {
  id: ActiveTab;
  icon: ComponentProps<typeof FontAwesome>['name'];
  label: string;
}[] = [
  { id: 'round', icon: 'compass', label: 'Round' },
  { id: 'chat', icon: 'comments', label: 'Chat' },
  { id: 'people', icon: 'users', label: 'People' },
  { id: 'records', icon: 'list-alt', label: 'Records' },
];

export default function CircleWorkspaceScreen() {
  const { session } = useAuthSession();
  const params = useLocalSearchParams<{ circleId?: string | string[]; tab?: string | string[] }>();
  const circleId = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialTab = (tabParam as ActiveTab) || 'round';
  const token = session?.session.token;

  const [circle, setCircle] = useState<BackendCircleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadWorkspace() {
    if (!token || !circleId) {
      setError('Missing token or circle ID.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setCircle(await getCircleDetail(token, circleId));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load circle.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, [circleId, token]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.replace(myCirclesHref)}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel="Back to My Circles"
          >
            <FontAwesome name="chevron-left" size={28} color={colors.textStrong} />
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.title}>{circle?.name || 'Circle'}</Text>
            <Text style={styles.subtitle}>
              {circle
                ? `Round ${circle.currentRound} · ${capitalizeFrequency(circle.frequency)}`
                : 'Loading...'}
            </Text>
          </View>

          <Pressable
            onPress={() => router.replace('/(tabs)/dashboard')}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel="Return to dashboard"
          >
            <FontAwesome name="home" size={28} color={colors.textStrong} />
          </Pressable>
        </View>

        {loading ? (
          <StatusCard
            icon="spinner"
            loading
            title="Setting up workspace"
            text="We're loading the latest circle data from the backend."
          />
        ) : error ? (
          <View style={styles.statusCard}>
            <FontAwesome name="warning" size={34} color={colors.warning} />
            <Text style={styles.statusTitle}>Unable to open circle</Text>
            <Text style={styles.statusText}>{error}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => void loadWorkspace()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading workspace"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : circle && token ? (
          <WorkspaceContent
            circle={circle}
            token={token}
            userId={session.user.id}
            initialTab={initialTab}
            onReload={() => loadWorkspace()}
          />
        ) : (
          <StatusCard
            icon="clock-o"
            title="Workspace pending"
            text="This circle was created successfully. The full workspace is being prepared in the backend."
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function WorkspaceContent({
  circle,
  token,
  userId,
  initialTab,
  onReload,
}: {
  circle: BackendCircleDetail;
  token: string;
  userId: string;
  initialTab: ActiveTab;
  onReload: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [scheduleData, setScheduleData] = useState<BackendRoundSnapshot | null>(
    null,
  );
  const [ledgerEntries, setLedgerEntries] = useState<BackendLedgerEntry[]>([]);
  const [secondaryLoading, setSecondaryLoading] = useState(true);
  const [actionMemberId, setActionMemberId] = useState<string | null>(null);
  const [paymentInstructions, setPaymentInstructions] = useState<string | null>(
    circle.paymentInstructions ?? null,
  );

  const loadBackendSections = async () => {
    setSecondaryLoading(true);
    try {
      const [scheduleResponse, ledgerResponse] = await Promise.all([
        getCircleSchedule(token, circle.id),
        getLedgerEntries(token, circle.id),
      ]);
      setScheduleData(scheduleResponse);
      setLedgerEntries(ledgerResponse.entries || []);
    } catch (loadError) {
      Alert.alert(
        'Unable to refresh workspace',
        loadError instanceof Error
          ? loadError.message
          : 'The backend did not return the workspace data.',
      );
    } finally {
      setSecondaryLoading(false);
    }
  };

  useEffect(() => {
    void loadBackendSections();
  }, [circle.id, token]);

  // scheduleData is the single source of truth for the round summary.
  // Do not fall back to circle.currentRoundSummary — it can be stale relative
  // to what getCircleSchedule returns, causing contradictory display values.
  const summary = scheduleData?.currentRoundSummary;
  const roundWorkspace = scheduleData?.roundWorkspace;
  const viewerPermissions = roundWorkspace?.viewerPermissions;
  const viewerRole = roundWorkspace?.viewerRole;
  const isCircleActive =
    circle.status !== 'setup' && circle.status !== 'completed' && circle.status !== 'cancelled';

  const { messages, sendMessage, sending } = useChat(circle.id);

  const handleRequestSwap = async (targetMemberId: string) => {
    try {
      await requestPositionSwap(circle.id, token, targetMemberId);
      Alert.alert('Swap Requested', 'A request has been sent to the member.');
    } catch (err) {
      Alert.alert('Swap Failed', 'Could not send swap request.');
    }
  };
  const activeParticipant =
    circle.userRole === 'organizer' ||
    circle.userRole === 'participant' ||
    viewerRole === 'organizer' ||
    viewerRole === 'participant';
  const viewerState = viewerRole || circle.userRole || 'none';
  const currentRoundNumber =
    summary?.roundNumber ?? roundWorkspace?.currentRoundNumber ?? circle.currentRound;
  const currentRoundSchedule = scheduleData?.schedule.find(
    (round) => round.round === currentRoundNumber,
  );
  const roundWallet = scheduleData?.wallet;
  const orderedMembers = useMemo(
    () => getOrderedMembers(circle),
    [circle.members, circle.turnOrder],
  );
  const currentRoundMembers = useMemo(
    () =>
      orderedMembers.map((member) => {
        const contribution = findContribution(
          scheduleData?.contributions,
          member.id,
          currentRoundNumber,
        );

        return {
          contribution,
          member,
          status: contributionStatus(
            contribution,
            roundWallet,
            ledgerEntries,
            member.id,
            currentRoundNumber,
          ),
        };
      }),
    [currentRoundNumber, orderedMembers, roundWallet, scheduleData?.contributions],
  );
  const viewerMember = orderedMembers.find((member) => member.userId === userId);
  const viewerContribution = viewerMember
    ? findContribution(
        scheduleData?.contributions,
        viewerMember.id,
        currentRoundNumber,
      )
    : undefined;
  const viewerContributionStatus = contributionStatus(
    viewerContribution,
    roundWallet,
    ledgerEntries,
    viewerMember?.id,
    currentRoundNumber,
  );
  const viewerPayoutPosition = viewerMember
    ? orderedMembers.findIndex((m) => m.id === viewerMember.id) + 1
    : null;
  const totalMembers =
    summary?.expectedContributionCount ?? roundWorkspace?.totalMemberCount;
  const recipientId =
    summary?.recipientMemberId ?? roundWorkspace?.currentRecipientMemberId;
  const recipient = orderedMembers.find((member) => member.id === recipientId);
  const payoutAmount =
    summary?.payoutAmount ?? fromCents(roundWorkspace?.payoutAmountCents);
  const dueDate =
    summary?.dueDate ||
    currentRoundSchedule?.payoutDate ||
    currentRoundSchedule?.payout_date;

  // ── Normalized display state ─────────────────────────────────────────────
  // Single source of truth for all Round tab display. Backend still controls
  // whether a payout can actually be released (canReleasePayout below).
  const visibleTotalCount =
    typeof totalMembers === 'number' && Number.isFinite(totalMembers)
      ? totalMembers
      : currentRoundMembers.length;

  const visibleConfirmedCount = currentRoundMembers.filter(
    (entry) => entry.status.raw === 'confirmed',
  ).length;

  const visibleProgress =
    visibleTotalCount > 0
      ? Math.round((visibleConfirmedCount / visibleTotalCount) * 100)
      : null;

  const displayAllConfirmed =
    visibleTotalCount > 0 && visibleConfirmedCount >= visibleTotalCount;

  const backendPayoutReady = roundWorkspace?.readyForPayout === true;
  const payoutReleased = roundWorkspace?.payoutReleased === true;

  const displayPayoutReady =
    payoutReleased || backendPayoutReady || displayAllConfirmed;

  const displayRoundStatus =
    payoutReleased
      ? `Payout sent to ${recipient ? (recipient.full_name || recipient.name) : 'recipient'}`
      : displayPayoutReady
        ? 'All contributions confirmed'
        : formatRoundStatus(roundWorkspace?.currentRoundStatus || circle.status);
  // ────────────────────────────────────────────────────────────────────────

  const canReviewContributions =
    viewerPermissions?.canApproveContributions === true;
  // Release Payout is strictly backend-gated — display state alone must never
  // enable this button.
  const canReleasePayout =
    viewerPermissions?.canReleasePayout === true &&
    backendPayoutReady &&
    !payoutReleased;
  const canRemindMembers = viewerPermissions?.canRemindMembers === true;
  const canSubmitOwnContribution =
    viewerPermissions?.canSubmitOwnContribution === true;
  const memberCanSubmitContribution =
    canSubmitOwnContribution &&
    ['due', 'missed', 'rejected'].includes(viewerContributionStatus.raw);
  const hasSchedule = Boolean(scheduleData?.schedule?.length);

  if (!activeParticipant && secondaryLoading) {
    return (
      <StatusCard
        icon="spinner"
        loading
        title="Checking membership"
        text="We're verifying backend access for this circle."
      />
    );
  }

  if (!activeParticipant) {
    return (
      <BlockedAccessCard
        circleName={circle.name}
        viewerRole={viewerState}
      />
    );
  }

  async function handleConfirmContribution(member: BackendCircleMember) {
    setActionMemberId(member.id);
    try {
      await approveContribution(token, circle.id, member.id);
      await Promise.all([onReload(), loadBackendSections()]);
    } catch (confirmError) {
      const message =
        confirmError instanceof Error ? confirmError.message : '';
      if (message.includes('already has confirmed pot funding recorded')) {
        await Promise.all([onReload(), loadBackendSections()]);
        return;
      }
      Alert.alert(
        'Unable to confirm contribution',
        message || 'The backend rejected the confirmation request.',
      );
    } finally {
      setActionMemberId(null);
    }
  }

  async function handleMarkPaid(member: BackendCircleMember) {
    setActionMemberId(member.id);
    try {
      await submitContribution(token, circle.id, member.id, {
        note: 'Marked paid by organizer.',
        paymentMethod: 'cash',
      });
      await Promise.all([onReload(), loadBackendSections()]);
    } catch (markPaidError) {
      Alert.alert(
        'Unable to mark paid',
        markPaidError instanceof Error
          ? markPaidError.message
          : 'The backend rejected the mark-paid request.',
      );
    } finally {
      setActionMemberId(null);
    }
  }

  async function handleReleasePayout() {
    if (!recipientId || typeof payoutAmount !== 'number') {
      Alert.alert(
        'Payout unavailable',
        'The backend did not provide a payout recipient and amount.',
      );
      return;
    }

    try {
      await releasePayoutFromPot(token, circle.id, {
        amount: payoutAmount,
        memberId: recipientId,
      });
      await Promise.all([onReload(), loadBackendSections()]);
    } catch (releaseError) {
      Alert.alert(
        'Unable to release payout',
        releaseError instanceof Error
          ? releaseError.message
          : 'The backend rejected the payout release.',
      );
    }
  }

  async function runMemberAction(
    member: BackendCircleMember,
    action: 'reject' | 'remind-sms' | 'remind-whatsapp' | 'remind-app',
  ) {
    if (action === 'remind-sms' && member.phone) {
      const message = `Hey ${memberName(member)}, just a friendly reminder about your contribution for ${circle.name}! Let me know if you need any help.`;
      void Linking.openURL(`sms:${member.phone}?body=${encodeURIComponent(message)}`);
      return;
    }
    
    if (action === 'remind-whatsapp' && member.phone) {
      const message = `Hey ${memberName(member)}, just a friendly reminder about your contribution for ${circle.name}! Let me know if you need any help.`;
      const numericPhone = member.phone.replace(/[^0-9]/g, '');
      void Linking.openURL(`https://wa.me/${numericPhone}?text=${encodeURIComponent(message)}`);
      return;
    }

    setActionMemberId(member.id);
    try {
      if (action === 'reject') {
        await rejectContribution(token, circle.id, member.id);
      } else {
        await sendContributionReminder(token, circle.id, member.id);
        Alert.alert('Reminder Sent', `An app notification has been sent to ${memberName(member)}.`);
      }
      await Promise.all([onReload(), loadBackendSections()]);
    } catch (actionError) {
      const isReject = action === 'reject';
      Alert.alert(
        isReject ? 'Unable to reject contribution' : 'Unable to send reminder',
        actionError instanceof Error
          ? actionError.message
          : `The backend rejected the ${isReject ? 'contribution' : 'reminder'} action.`,
      );
    } finally {
      setActionMemberId(null);
    }
  }

  function handleRemindPress(member: BackendCircleMember) {
    if (member.phone) {
      Alert.alert(
        'Send Reminder',
        `How would you like to remind ${memberName(member)}?`,
        [
          {
            text: 'SMS',
            onPress: () => void runMemberAction(member, 'remind-sms'),
          },
          {
            text: 'WhatsApp',
            onPress: () => void runMemberAction(member, 'remind-whatsapp'),
          },
          {
            text: 'App Notification',
            onPress: () => void runMemberAction(member, 'remind-app'),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    } else {
      void runMemberAction(member, 'remind-app');
    }
  }

  return (
    <View>
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[styles.tab, selected && styles.activeTab]}
              onPress={() => setActiveTab(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <FontAwesome
                name={tab.icon}
                size={18}
                color={selected ? '#fff' : colors.muted}
              />
              <Text style={[styles.tabText, selected && styles.activeTabText]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeTab === 'round' ? (
        // Initial load gate: scheduleData has not yet arrived from the backend.
        // Show a loading card rather than rendering the Round tab with stale
        // data from the primary circle detail response.
        !scheduleData && secondaryLoading ? (
          <StatusCard
            icon="spinner"
            loading
            title="Loading round data"
            text="Fetching the latest round details from the backend…"
          />
        ) : (
          <>
            {/* Re-sync spinner: scheduleData exists but is being refreshed
                (e.g. after approving a contribution). Keep showing live data
                above so the organizer doesn't see a flash of skeleton. */}
            {secondaryLoading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.inlineLoadingText}>Syncing backend data…</Text>
              </View>
            ) : null}
            <RoundTab
              canReleasePayout={canReleasePayout}
              canRemindMembers={canRemindMembers}
              canReviewContributions={canReviewContributions}
              circle={circle}
              currentRoundMembers={currentRoundMembers}
              currentRoundNumber={currentRoundNumber}
              displayPayoutReady={displayPayoutReady}
              displayRoundStatus={displayRoundStatus}
              dueDate={dueDate}
              memberCanSubmitContribution={memberCanSubmitContribution}
              onApprove={(member) => void handleConfirmContribution(member)}
              onMarkPaid={(member) => void handleMarkPaid(member)}
              onReject={(member) => void runMemberAction(member, 'reject')}
              onRemind={handleRemindPress}
              onReleasePayout={handleReleasePayout}
              payoutAmount={payoutAmount}
              payoutReleased={payoutReleased}
              recipient={recipient}
              totalMembers={visibleTotalCount}
              visibleConfirmedCount={visibleConfirmedCount}
              visibleProgress={visibleProgress}
              viewerContributionStatus={viewerContributionStatus}
              viewerMember={viewerMember}
              viewerPayoutPosition={viewerPayoutPosition}
              processingMemberId={actionMemberId}
              paymentInstructions={paymentInstructions}
              token={token}
            />
          </>
        )
      ) : null}

      {activeTab === 'chat' ? (
        <View style={{ marginTop: 16 }}>
          <ChatFeed messages={messages} currentUserId={userId} />
          <ChatInput onSend={sendMessage} isLoading={sending} />
        </View>
      ) : null}

      {activeTab === 'people' ? (
        <PeopleTab
          circle={circle}
          hasSchedule={hasSchedule}
          isOrganizer={circle.userRole === 'organizer'}
          members={orderedMembers}
          recipientId={recipientId}
          userId={userId}
          onRequestSwap={handleRequestSwap}
          token={token}
        />
      ) : null}

      {activeTab === 'records' ? <RecordsTab entries={ledgerEntries} circleId={circle.id} members={circle.members || []} /> : null}
    </View>
  );
}

function RoundTab({
  canReleasePayout,
  canRemindMembers,
  canReviewContributions,
  circle,
  currentRoundMembers,
  currentRoundNumber,
  displayPayoutReady,
  displayRoundStatus,
  dueDate,
  processingMemberId,
  memberCanSubmitContribution,
  onApprove,
  onMarkPaid,
  onReject,
  onRemind,
  onReleasePayout,
  payoutAmount,
  payoutReleased,
  recipient,
  totalMembers,
  visibleConfirmedCount,
  visibleProgress,
  viewerContributionStatus,
  viewerMember,
  viewerPayoutPosition,
  paymentInstructions,
  token,
}: {
  canReleasePayout: boolean;
  canRemindMembers: boolean;
  canReviewContributions: boolean;
  circle: BackendCircleDetail;
  currentRoundMembers: {
    contribution?: BackendRoundContribution;
    member: BackendCircleMember;
    status: ContributionStatusView;
  }[];
  currentRoundNumber: number;
  displayPayoutReady: boolean;
  displayRoundStatus: string;
  dueDate?: string | null;
  processingMemberId: string | null;
  memberCanSubmitContribution: boolean;
  onApprove: (member: BackendCircleMember) => void;
  onMarkPaid: (member: BackendCircleMember) => void;
  onReject: (member: BackendCircleMember) => void;
  onRemind: (member: BackendCircleMember) => void;
  onReleasePayout: () => void;
  payoutAmount?: number;
  payoutReleased: boolean;
  recipient?: BackendCircleMember;
  totalMembers: number;
  visibleConfirmedCount: number;
  visibleProgress: number | null;
  viewerContributionStatus: ContributionStatusView;
  viewerMember?: BackendCircleMember;
  viewerPayoutPosition?: number | null;
  paymentInstructions?: string | null;
  token: string;
}) {
  // All display values arrive pre-normalized from WorkspaceContent.
  // totalMembers here is already the visibleTotalCount.
  const visibleTotalCount = totalMembers;

  const isViewerRecipient = viewerMember && recipient && viewerMember.id === recipient.id;

  return (
    <View style={styles.section}>
      {isViewerRecipient ? (
        <View style={[styles.sectionCard, { marginTop: 0, marginBottom: 16, borderColor: colors.success, backgroundColor: `${colors.success}10` }]}>
          <Text style={[styles.sectionTitle, { color: colors.success }]}>
            🎉 You receive the payout this round
          </Text>
          <Text style={styles.sectionSubtitle}>
            When all contributions are confirmed, the organizer can release the payout to you.
          </Text>
        </View>
      ) : null}

      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroRoundBadge}>
            <Text style={styles.heroRoundText}>{currentRoundNumber}</Text>
          </View>
          <View style={styles.heroHeaderCopy}>
            <Text style={styles.heroEyebrow}>Round {currentRoundNumber} of {visibleTotalCount}</Text>
            <Text style={styles.heroTitle}>
              {capitalizeFrequency(circle.frequency)} cycle
            </Text>
          </View>
        </View>

        <View style={styles.heroGrid}>
          <InfoRow 
            label="Payout this round" 
            value={recipient ? `${memberName(recipient)} receives ${formatOptionalMoney(payoutAmount)}` : 'Unassigned'} 
          />
          <InfoRow
            label="Confirmed"
            value={formatConfirmedStatusFromCounts(
              visibleConfirmedCount,
              visibleTotalCount,
            )}
          />
          <InfoRow label="Progress" value={formatProgress(visibleProgress)} last />
        </View>

        <View style={styles.heroFooter}>
          <StatusBadge
            label={payoutReleased ? 'Payout released' : displayPayoutReady ? 'Ready for payout' : 'In progress'}
            tone={payoutReleased ? 'success' : displayPayoutReady ? 'ready' : 'muted'}
          />
          <StatusBadge
            label={displayRoundStatus}
            tone="soft"
          />
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Round details</Text>
        <Text style={styles.sectionSubtitle}>
          Live backend status for the current round
        </Text>
        <DetailRow label="Contribution" value={formatMoney(circle.contributionAmount)} />
        <DetailRow label="Due date" value={formatDate(dueDate)} />
        <DetailRow
          label="Expected contributions"
          value={typeof totalMembers === 'number' ? `${totalMembers} expected` : 'Unavailable'}
        />
        <DetailRow
          label="Payout readiness"
          value={payoutReleased ? 'Released' : displayPayoutReady ? 'Ready' : 'Not ready'}
          last
        />
      </View>

      {!canReviewContributions ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>My Next Action</Text>
          <Text style={styles.sectionSubtitle}>
            {viewerMember 
              ? `Your ${formatMoney(circle.contributionAmount)} contribution is due.` 
              : 'Membership unavailable.'}
          </Text>
          
          {viewerMember && memberCanSubmitContribution ? (
            <View style={styles.paymentInstructions}>
              <FontAwesome name="send" size={14} color={colors.primary} style={{ marginBottom: 6 }} />
              <Text style={styles.paymentInstructionsTitle}>Where to send your payment</Text>
              <Text style={styles.paymentInstructionsText}>
                {paymentInstructions ?? 'Contact the organizer for payment details.'}
              </Text>
            </View>
          ) : null}

          {/* Post-submit pending state */}
          {viewerMember && viewerContributionStatus.raw === 'submitted' ? (
            <View style={styles.pendingConfirmationCard}>
              <FontAwesome name="clock-o" size={20} color={colors.warning} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.pendingConfirmationTitle}>Payment reported!</Text>
                <Text style={styles.pendingConfirmationText}>
                  Waiting for the organizer to confirm receipt. You're all set for now.
                </Text>
              </View>
            </View>
          ) : viewerMember ? (
            memberCanSubmitContribution ? (
              <Pressable
                style={styles.primaryButton}
                onPress={() => router.push(contributionHref(circle.id))}
                accessibilityRole="button"
                accessibilityLabel="I Sent It"
              >
                <Text style={styles.primaryButtonText}>I Sent It ✓</Text>
              </Pressable>
            ) : (
              <StatusBadge
                label={viewerContributionStatus.label}
                tone={statusTone(viewerContributionStatus.raw)}
              />
            )
          ) : (
            <StatusBadge label="Membership unavailable" tone="muted" />
          )}
        </View>
      ) : null}

      {viewerPayoutPosition && !canReviewContributions ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Your turn</Text>
          <Text style={styles.sectionSubtitle}>
            Your payout position: #{viewerPayoutPosition} • You receive on Round {viewerPayoutPosition}
          </Text>
        </View>
      ) : null}

      {canReviewContributions ? (
        <View style={styles.sectionCard}>
          <View style={styles.organizerNextActionsHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Organizer next actions</Text>
              <Text style={styles.sectionSubtitle}>
                Payments that need your attention this round.
              </Text>
            </View>
            {/* Quick link to set payment instructions */}
            {!paymentInstructions ? (
              <Pressable
                style={styles.setupInstructionsButton}
                onPress={() => router.push(circlePaymentSetupHref(circle.id))}
              >
                <FontAwesome name="credit-card" size={12} color={colors.primary} />
                <Text style={styles.setupInstructionsText}>Set Payment Info</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.setupInstructionsButton, { borderColor: colors.success }]}
                onPress={() => router.push(circlePaymentSetupHref(circle.id))}
              >
                <FontAwesome name="check-circle" size={12} color={colors.success} />
                <Text style={[styles.setupInstructionsText, { color: colors.success }]}>Payment Info Set</Text>
              </Pressable>
            )}
          </View>

          {(() => {
            const actionableMembers = currentRoundMembers
              .filter(({ status }) => {
                const canMarkPaid = ['due', 'missed', 'rejected'].includes(status.raw);
                const canApprove = ['submitted', 'late'].includes(status.raw);
                return canMarkPaid || canApprove;
              })
              .sort((a, b) => {
                const aCanApprove = ['submitted', 'late'].includes(a.status.raw);
                const bCanApprove = ['submitted', 'late'].includes(b.status.raw);
                if (aCanApprove && !bCanApprove) return -1;
                if (!aCanApprove && bCanApprove) return 1;
                return 0;
              });

            if (actionableMembers.length === 0) {
              return (
                <Text style={[styles.helperText, { marginTop: 12 }]}>
                  All payments are confirmed for this round.
                </Text>
              );
            }

            const visibleMembers = actionableMembers.slice(0, 5);
            const remainingCount = actionableMembers.length - 5;

            return (
              <View style={styles.actionList}>
                {visibleMembers.map(({ member, status }) => {
                  const isProcessing = processingMemberId === member.id;
                  const canMarkPaid = ['due', 'missed', 'rejected'].includes(status.raw);
                  const canApprove = ['submitted', 'late'].includes(status.raw);
                  const canReject = canApprove;

                  return (
                    <View key={member.id} style={styles.actionRow}>
                      {/* Name + single status badge - no duplicate in the button area */}
                      <View style={styles.actionRowCopy}>
                        <Text style={styles.actionName} numberOfLines={2}>
                          {canApprove 
                            ? `${memberName(member)} says they sent ${formatMoney(circle.contributionAmount)}` 
                            : memberName(member)}
                        </Text>
                        <StatusBadge label={status.label} tone={statusTone(status.raw)} />
                      </View>

                      {(canMarkPaid || canApprove) ? (
                        <View style={styles.actionButtons}>
                          {canMarkPaid ? (
                            <Pressable
                              style={styles.confirmButton}
                              disabled={isProcessing}
                              onPress={() => onMarkPaid(member)}
                              accessibilityRole="button"
                              accessibilityLabel={`Mark ${memberName(member)} paid`}
                            >
                              <Text style={styles.confirmText}>Mark Paid</Text>
                            </Pressable>
                          ) : null}
                          {canRemindMembers && canMarkPaid ? (
                            <Pressable
                              style={styles.secondaryButton}
                              disabled={isProcessing}
                              onPress={() => onRemind(member)}
                              accessibilityRole="button"
                              accessibilityLabel={`Remind ${memberName(member)}`}
                            >
                              <Text style={styles.secondaryButtonText}>Remind</Text>
                            </Pressable>
                          ) : null}
                          {canApprove ? (
                            <Pressable
                              style={styles.confirmButton}
                              disabled={isProcessing}
                              onPress={() => onApprove(member)}
                              accessibilityRole="button"
                              accessibilityLabel={`Confirm receipt from ${memberName(member)}`}
                            >
                              <Text style={styles.confirmText}>Confirm Receipt</Text>
                            </Pressable>
                          ) : null}
                          {canReject ? (
                            <Pressable
                              style={styles.rejectButton}
                              disabled={isProcessing}
                              onPress={() => onReject(member)}
                              accessibilityRole="button"
                              accessibilityLabel={`Reject ${memberName(member)} contribution`}
                            >
                              <Text style={styles.rejectText}>Reject</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                {remainingCount > 0 ? (
                  <Text style={[styles.helperText, { marginTop: 8, textAlign: 'center' }]}>
                    And {remainingCount} more action{remainingCount === 1 ? '' : 's'}...
                  </Text>
                ) : null}
              </View>
            );
          })()}
        </View>
      ) : null}

      {/* Release Payout is gated on backend permission only — display state
          (displayPayoutReady / displayAllConfirmed) must never unlock this. */}
      {canReleasePayout ? (
        <Pressable
          style={styles.payoutButton}
          onPress={onReleasePayout}
          accessibilityRole="button"
          accessibilityLabel="Release payout"
        >
          <FontAwesome name="money" size={18} color="#fff" />
          <Text style={styles.payoutButtonText}>Release Payout</Text>
        </Pressable>
      ) : displayPayoutReady && !payoutReleased ? (
        <Text style={[styles.helperText, { marginTop: 8, textAlign: 'center' }]}>
          The round appears fully confirmed. Waiting for backend payout permission.
        </Text>
      ) : null}
    </View>
  );
}

function PeopleTab({
  circle,
  hasSchedule,
  isOrganizer,
  members,
  recipientId,
  userId,
  onRequestSwap,
  token,
}: {
  circle: BackendCircleDetail;
  hasSchedule: boolean;
  isOrganizer: boolean;
  members: BackendCircleMember[];
  recipientId?: string | null;
  userId: string;
  onRequestSwap: (targetMemberId: string) => void;
  token: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const visibleMembers = showAll ? members : members.slice(0, 10);
  const remainingCount = members.length - 10;

  return (
    <View style={styles.section}>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>People</Text>
        <Text style={styles.sectionSubtitle}>
          {members.length} members • Payout order shown below
        </Text>
        {!hasSchedule ? (
          <Text style={styles.helperText}>Payout order is not available yet.</Text>
        ) : null}
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={swapModalVisible}
        onRequestClose={() => setSwapModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Position Swap</Text>
              <Pressable onPress={() => setSwapModalVisible(false)} hitSlop={20}>
                <FontAwesome name="times" size={24} color={colors.textStrong} />
              </Pressable>
            </View>
            <Text style={styles.modalDescription}>
              Select a member to request a position swap. If they accept, your payout rounds will be exchanged.
            </Text>
            
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
              {members.filter(m => m.id !== userId).map(m => (
                <Pressable
                  key={m.id}
                  style={styles.swapMemberOption}
                  onPress={() => {
                    setSwapModalVisible(false);
                    onRequestSwap(m.id);
                  }}
                >
                  <View style={styles.swapMemberAvatar}>
                    <Text style={styles.swapMemberAvatarText}>{memberName(m)[0]}</Text>
                  </View>
                  <Text style={styles.swapMemberName}>{memberName(m)}</Text>
                  <FontAwesome name="chevron-right" size={12} color={colors.muted} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={styles.peopleList}>
        {members.map((member, index) => {
          const isRecipient = member.id === recipientId;
          const roleLabel =
            member.id === circle.organizerId ? 'Organizer' : 'Member';

          return (
            <View key={member.id} style={styles.personCard}>
              <View style={styles.personCardMain}>
                <View style={styles.positionBadge}>
                  <Text style={styles.positionText}>{index + 1}</Text>
                </View>
                <View style={styles.personInfo}>
                  <Text style={styles.personName} numberOfLines={1} ellipsizeMode="tail">
                    {memberName(member)}
                  </Text>
                  <View style={styles.personMetaRow}>
                    <StatusBadge label={roleLabel} tone="muted" />
                    {isRecipient ? <StatusBadge label="Recipient" tone="success" /> : null}
                    {member.reliabilityScore !== undefined ? (
                      <View style={styles.reliabilityBadge}>
                        <FontAwesome 
                          name="shield" 
                          size={12} 
                          color={
                            member.reliabilityScore >= 90 ? colors.success : 
                            member.reliabilityScore >= 70 ? colors.warning : 
                            colors.danger
                          } 
                        />
                        <Text style={styles.reliabilityText}>{member.reliabilityScore}%</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {member.id === userId && hasSchedule && (
                <Pressable
                  style={styles.swapButton}
                  onPress={() => setSwapModalVisible(true)}
                  accessibilityRole="button"
                >
                  <FontAwesome name="exchange" size={14} color={colors.primary} />
                  <Text style={styles.swapButtonText}>Request Swap</Text>
                </Pressable>
              )}

              {!member.userId && isOrganizer && (
                <Pressable
                  style={styles.swapButton}
                  onPress={async () => {
                    try {
                      if (!token) throw new Error('Not authenticated');
                      const { claimToken } = await getMemberAccessToken(circle.id, member.id, token);
                      await Share.share({
                        message: `Claim your spot in '${circle.name}': https://app.circusave.com/invite/${circle.id}?claimToken=${claimToken}`,
                      });
                    } catch (error) {
                      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to generate link');
                    }
                  }}
                  accessibilityRole="button"
                >
                  <FontAwesome name="link" size={14} color={colors.primary} />
                  <Text style={styles.swapButtonText}>Share Spot Link</Text>
                </Pressable>
              )}
            </View>
          );
        })}

        {!showAll && remainingCount > 0 ? (
          <Pressable
            style={[styles.confirmButton, { marginTop: 12, alignSelf: 'center' }]}
            onPress={() => setShowAll(true)}
            accessibilityRole="button"
            accessibilityLabel={`Show all ${members.length} members`}
          >
            <Text style={styles.confirmText}>
              Show {remainingCount} more member{remainingCount === 1 ? '' : 's'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {isOrganizer ? (
        circle.status === 'setup' ? (
          <Pressable
            style={styles.memberActionButton}
            onPress={() => router.push(circleInviteHref(circle.id))}
            accessibilityRole="button"
            accessibilityLabel="Invite members"
          >
            <FontAwesome name="user-plus" size={18} color={colors.primary} />
            <Text style={styles.memberActionText}>Invite Members</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.memberActionButton}
            onPress={async () => {
              try {
                await Share.share({
                  message: `Access our savings circle '${circle.name}' on CircuSave: https://app.circusave.com/workspace/${circle.id}`,
                });
              } catch (error) {
                // Ignore share cancellation
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Share Access Link"
          >
            <FontAwesome name="link" size={18} color={colors.primary} />
            <Text style={styles.memberActionText}>Share Access Link</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

function RecordsTab({ entries, circleId, members }: { entries: BackendLedgerEntry[], circleId: string, members: BackendCircleMember[] }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Records</Text>
        <Text style={styles.sectionSubtitle}>
          Confirmed backend activity for this circle
        </Text>
      </View>

      {entries.length === 0 ? (
        <View style={styles.emptyLedger}>
          <FontAwesome name="book" size={28} color={colors.muted} />
          <Text style={styles.emptyLedgerText}>No ledger entries yet.</Text>
        </View>
      ) : (
        <View style={styles.ledgerList}>
          {entries.slice(0, 10).map((entry) => (
            <View key={entry.id} style={styles.ledgerRow}>
              <View style={[styles.ledgerIcon, { backgroundColor: `${ledgerIconColor(entry)}15` }]}>
                <FontAwesome
                  name={ledgerIcon(entry)}
                  size={16}
                  color={ledgerIconColor(entry)}
                />
              </View>
              <View style={styles.ledgerInfo}>
                <Text style={styles.ledgerTitle}>{ledgerTitle(entry)}</Text>
                <Text style={styles.ledgerMeta}>
                  {entryMemberName(entry, members)}
                  {entryMemberName(entry, members) ? ' · ' : ''}
                  Round {entry.round || '—'} · {formatDateTime(entry.created_at || entry.at)}
                </Text>
              </View>
              {typeof entry.amount === 'number' ? (
                <Text style={[styles.ledgerAmount, { color: ledgerIconColor(entry) }]}>
                  {ledgerAmountLabel(entry)}
                </Text>
              ) : null}
            </View>
          ))}
          <Pressable
            style={[styles.memberActionButton, { marginTop: 16 }]}
            onPress={() => router.push('/circle/history')}
            accessibilityRole="button"
          >
            <FontAwesome name="download" size={16} color={colors.primary} />
            <Text style={styles.memberActionText}>Export Full History</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function BlockedAccessCard({
  circleName,
  viewerRole,
}: {
  circleName: string;
  viewerRole: string;
}) {
  const label =
    viewerRole === 'waitlist'
      ? 'Waitlist'
      : viewerRole === 'none'
        ? 'No active membership'
        : 'Access unavailable';

  return (
    <View style={styles.blockedCard}>
      <FontAwesome name="lock" size={34} color={colors.warning} />
      <Text style={styles.blockedTitle}>{label}</Text>
      <Text style={styles.blockedText}>
        {circleName} is not available as an active member workspace for this account.
        Round, payment, and ledger details stay hidden until the backend grants active membership.
      </Text>
      <Pressable
        style={styles.retryButton}
        onPress={() => router.replace(myCirclesHref)}
        accessibilityRole="button"
        accessibilityLabel="Back to My Circles"
      >
        <Text style={styles.retryButtonText}>Back to My Circles</Text>
      </Pressable>
    </View>
  );
}

function StatusCard({
  icon,
  loading,
  text,
  title,
}: {
  icon: ComponentProps<typeof FontAwesome>['name'];
  loading?: boolean;
  text: string;
  title: string;
}) {
  return (
    <View style={styles.statusCard}>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        <FontAwesome name={icon} size={34} color={colors.primary} />
      )}
      <Text style={styles.statusTitle}>{title}</Text>
      <Text style={styles.statusText}>{text}</Text>
    </View>
  );
}

function InfoRow({
  label,
  last,
  value,
}: {
  label: string;
  last?: boolean;
  value: string;
}) {
  return (
    <View style={[styles.infoRow, last && styles.lastInfoRow]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function DetailRow({
  label,
  last,
  value,
}: {
  label: string;
  last?: boolean;
  value: string;
}) {
  return (
    <View style={[styles.detailRow, last && styles.lastDetailRow]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'muted' | 'soft' | 'ready' | 'success' | 'warning';
}) {
  const containerStyle =
    tone === 'muted'
      ? styles.statusBadge_muted
      : tone === 'soft'
        ? styles.statusBadge_soft
        : tone === 'ready'
          ? styles.statusBadge_ready
          : tone === 'success'
            ? styles.statusBadge_success
            : styles.statusBadge_warning;
  const textStyle =
    tone === 'muted'
      ? styles.statusBadgeText_muted
      : tone === 'soft'
        ? styles.statusBadgeText_soft
        : tone === 'ready'
          ? styles.statusBadgeText_ready
          : tone === 'success'
            ? styles.statusBadgeText_success
            : styles.statusBadgeText_warning;

  return (
    <View style={[styles.statusBadge, containerStyle]}>
      <Text style={[styles.statusBadgeText, textStyle]}>{label}</Text>
    </View>
  );
}

function getOrderedMembers(circle: BackendCircleDetail) {
  return [...circle.members].sort((a, b) => {
    const posA = circle.turnOrder.indexOf(a.id);
    const posB = circle.turnOrder.indexOf(b.id);
    return normalizeSortPosition(posA) - normalizeSortPosition(posB);
  });
}

function normalizeSortPosition(position: number) {
  return position === -1 ? Number.MAX_SAFE_INTEGER : position;
}

function findContribution(
  contributions?: BackendRoundContribution[],
  memberId?: string,
  roundNumber?: number,
) {
  if (!contributions || !memberId || !roundNumber) {
    return undefined;
  }

  return contributions.find(
    (entry) => entry.memberId === memberId && entry.round === roundNumber,
  );
}

function contributionStatus(
  contribution?: BackendRoundContribution,
  wallet?: BackendWalletSnapshot,
  ledgerEntries: BackendLedgerEntry[] = [],
  memberId?: string,
  roundNumber?: number,
): ContributionStatusView {
  const raw = String(contribution?.status || 'due').toLowerCase();
  if (
    raw !== 'confirmed' &&
    hasConfirmedFundingRecord(wallet, ledgerEntries, memberId, roundNumber)
  ) {
    return { label: 'Confirmed', raw: 'confirmed' };
  }
  if (raw === 'confirmed') return { label: 'Confirmed', raw };
  if (raw === 'submitted') return { label: 'Submitted', raw };
  if (raw === 'late') return { label: 'Late', raw };
  if (raw === 'missed') return { label: 'Missed', raw };
  if (raw === 'rejected') return { label: 'Rejected', raw };
  if (raw === 'pending') return { label: 'Waiting', raw };
  return { label: 'Due', raw: 'due' };
}

function hasConfirmedFundingRecord(
  wallet: BackendWalletSnapshot | undefined,
  ledgerEntries: BackendLedgerEntry[],
  memberId?: string,
  roundNumber?: number,
) {
  return (
    hasConfirmedPotCredit(wallet, memberId, roundNumber) ||
    hasConfirmedContributionLedgerEntry(ledgerEntries, memberId, roundNumber)
  );
}

function hasConfirmedPotCredit(
  wallet?: BackendWalletSnapshot,
  memberId?: string,
  roundNumber?: number,
) {
  if (!wallet || !memberId || !roundNumber) {
    return false;
  }

  const memberAccountId = `member:${memberId}`;
  return (wallet.txns || []).some((txn) => {
    const type = String(txn.type || '').toLowerCase();
    const action = String(txn.action || '').toLowerCase();
    const status = String(txn.status || 'posted').trim().toLowerCase();
    const fromMemberId = String(txn.fromMemberId || '').trim();
    const toMemberId = String(txn.toMemberId || '').trim();
    return (
      (type === 'approve_credit_pot' || action === 'approve_credit_pot') &&
      Number(txn.round) === roundNumber &&
      (String(txn.from || '') === memberAccountId ||
        fromMemberId === memberId ||
        toMemberId === memberId) &&
      String(txn.to || '') === 'pot' &&
      status === 'posted'
    );
  });
}

function hasConfirmedContributionLedgerEntry(
  entries: BackendLedgerEntry[],
  memberId?: string,
  roundNumber?: number,
) {
  if (!memberId || !roundNumber) {
    return false;
  }

  return entries.some((entry) => {
    const type = String(entry.event_type || entry.type || '').toLowerCase();
    const metadata = entry.metadata || {};
    const metadataMemberId = String(
      metadata.member_id ||
        metadata.memberId ||
        metadata.recipient_member_id ||
        metadata.recipientMemberId ||
        '',
    ).trim();
    const entryMemberId = String(entry.memberId || '').trim();
    const metadataRound = Number(
      metadata.round_number || metadata.roundNumber || entry.round,
    );

    return (
      type === 'contribution_confirmed' &&
      Number(entry.round || metadataRound) === roundNumber &&
      (entryMemberId === memberId || metadataMemberId === memberId)
    );
  });
}

function memberName(member: BackendCircleMember | undefined) {
  return member?.full_name || member?.name || 'Unknown member';
}

function entryMemberName(entry: BackendLedgerEntry, members: BackendCircleMember[]) {
  const metadata = entry.metadata || {};
  const memberId = String(
    entry.memberId ||
    metadata.member_id ||
    metadata.memberId ||
    metadata.recipient_member_id ||
    metadata.recipientMemberId ||
    ''
  ).trim();

  if (!memberId) return '';
  const member = members.find((m) => m.id === memberId || m.userId === memberId);
  return member ? memberName(member) : '';
}

function ledgerTitle(entry: BackendLedgerEntry) {
  if (entry.note) return entry.note;
  const type = String(entry.event_type || entry.type || 'activity')
    .replace(/_/g, ' ')
    .trim();
  return capitalizeFrequency(type || 'Activity updated');
}

function ledgerIcon(entry: BackendLedgerEntry): ComponentProps<typeof FontAwesome>['name'] {
  const type = String(entry.event_type || entry.type || '').toLowerCase();
  if (type.includes('payout')) return 'arrow-down';
  if (type.includes('contribution')) return 'arrow-up';
  return 'book';
}

function ledgerIconColor(entry: BackendLedgerEntry) {
  const type = String(entry.event_type || entry.type || '').toLowerCase();
  if (type.includes('payout')) return colors.success;
  if (type.includes('contribution')) return colors.muted;
  return colors.primary;
}

function ledgerAmountLabel(entry: BackendLedgerEntry) {
  if (typeof entry.amount !== 'number') return null;
  const type = String(entry.event_type || entry.type || '').toLowerCase();
  const amountStr = formatMoney(entry.amount);
  if (type.includes('payout')) return `+${amountStr}`;
  if (type.includes('contribution')) return `-${amountStr}`;
  return amountStr;
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatOptionalMoney(amount?: number) {
  return typeof amount === 'number' && Number.isFinite(amount)
    ? formatMoney(amount)
    : 'Unavailable';
}

function fromCents(amountCents?: number) {
  return typeof amountCents === 'number' && Number.isFinite(amountCents)
    ? amountCents / 100
    : undefined;
}

function formatProgress(progress: number | null) {
  return typeof progress === 'number' && Number.isFinite(progress)
    ? `${Math.max(0, Math.min(100, progress))}%`
    : '—';
}

function formatConfirmedStatusFromCounts(
  confirmedCount?: number,
  totalMembers?: number,
) {
  return typeof confirmedCount === 'number' &&
    typeof totalMembers === 'number' &&
    Number.isFinite(confirmedCount) &&
    Number.isFinite(totalMembers) &&
    totalMembers > 0
    ? `${confirmedCount} of ${totalMembers} confirmed`
    : 'Unavailable';
}

function formatDate(value?: string | null) {
  if (!value) return 'Unavailable';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Date(time).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Date(time).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatRoundStatus(value?: string | null) {
  if (!value) return 'Round status unavailable';
  const status = String(value).toLowerCase();
  if (status === 'collecting') return 'Collecting contributions';
  return capitalizeFrequency(String(value).replace(/_/g, ' ').trim());
}

function capitalizeFrequency(value: string) {
  if (!value) return '';
  if (value === 'biweekly') return 'Bi-weekly';
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function statusTone(raw: string): 'muted' | 'soft' | 'ready' | 'success' | 'warning' {
  if (raw === 'confirmed') return 'success';
  if (raw === 'submitted' || raw === 'late') return 'ready';
  if (raw === 'missed' || raw === 'rejected') return 'warning';
  if (raw === 'pending') return 'muted';
  return 'muted';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: {
    paddingBottom: 100,
    paddingHorizontal: spacing.screenX,
    paddingTop: 18,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 4,
  },
  headerCenter: { alignItems: 'center', flex: 1 },
  title: {
    color: colors.textStrong,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  statusCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginTop: 18,
    padding: spacing.card,
  },
  statusTitle: {
    color: colors.textStrong,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  statusText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    justifyContent: 'center',
    marginTop: 6,
    minHeight: 48,
    paddingHorizontal: 18,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  inlineLoading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 4,
    paddingTop: 16,
  },
  inlineLoadingText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  tabBar: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 18,
    padding: 6,
  },
  tab: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  activeTabText: {
    color: '#fff',
  },
  section: {
    gap: 14,
    marginTop: 18,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 14,
  },
  sectionTitle: {
    color: colors.textStrong,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  helperText: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
  },
  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    marginBottom: 14,
    padding: 18,
  },
  heroHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  heroRoundBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 18,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  heroRoundText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },
  heroHeaderCopy: {
    flex: 1,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  heroGrid: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    marginTop: 16,
    padding: 14,
  },
  heroFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
  },
  lastInfoRow: {
    paddingBottom: 0,
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.78)',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  infoValue: {
    color: '#fff',
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  detailRow: {
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
  },
  lastDetailRow: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  detailLabel: {
    color: colors.muted,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  detailValue: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadge_muted: {
    backgroundColor: colors.primarySoft,
  },
  statusBadge_soft: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  statusBadge_ready: {
    backgroundColor: '#FDE68A',
  },
  statusBadge_success: {
    backgroundColor: '#DCFCE7',
  },
  statusBadge_warning: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '900',
  },
  statusBadgeText_muted: {
    color: colors.primaryDark,
  },
  statusBadgeText_soft: {
    color: '#fff',
  },
  statusBadgeText_ready: {
    color: '#92400E',
  },
  statusBadgeText_success: {
    color: '#166534',
  },
  statusBadgeText_warning: {
    color: '#991B1B',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: colors.success,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  confirmText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  rejectButton: {
    alignItems: 'center',
    backgroundColor: colors.warning,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  rejectText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
  payoutButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 52,
  },
  payoutButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  actionList: {
    gap: 10,
    marginTop: 12,
  },
  actionRow: {
    backgroundColor: '#F8FAFC',
    borderColor: colors.cardBorder,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  actionRowCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionName: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    minWidth: 120,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  peopleList: {
    gap: 12,
  },
  personCard: {
    alignItems: 'stretch',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'column',
    minHeight: 80,
    padding: 16,
  },
  positionBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginRight: 12,
    width: 48,
  },
  positionText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  personInfo: {
    flex: 1,
    paddingRight: 8,
  },
  personName: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: '900',
  },
  personMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  emptyActionSpacer: {
    width: 1,
  },
  memberActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  memberActionButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 68,
  },
  memberActionText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  ledgerList: {
    gap: 10,
  },
  emptyLedger: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    marginTop: 12,
    padding: 20,
  },
  emptyLedgerText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  ledgerRow: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 76,
    padding: 14,
  },
  ledgerIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 15,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  ledgerInfo: {
    flex: 1,
  },
  ledgerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  ledgerMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  ledgerAmount: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '900',
  },
  blockedCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    marginTop: 18,
    padding: 24,
  },
  blockedTitle: {
    color: colors.textStrong,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 12,
  },
  paymentInstructions: {
    backgroundColor: 'rgba(64, 21, 163, 0.05)',
    borderRadius: radii.card,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(64, 21, 163, 0.1)',
  },
  paymentInstructionsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 4,
  },
  paymentInstructionsText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  pendingConfirmationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    padding: 16,
    marginTop: 12,
  },
  pendingConfirmationTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.textStrong,
  },
  pendingConfirmationText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
  },
  organizerNextActionsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  setupInstructionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  setupInstructionsText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  blockedText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  reliabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.success}15`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  reliabilityText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '800',
  },
  personCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  swapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  swapButtonText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textStrong,
  },
  modalDescription: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 20,
  },
  swapMemberOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  swapMemberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  swapMemberAvatarText: {
    color: colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
  },
  swapMemberName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.textStrong,
  },
});

