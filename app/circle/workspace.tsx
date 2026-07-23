import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ComponentProps,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  approveContribution,
  approveJoinRequest,
  declineJoinRequest,
  getCircleDetail,
  getCircleSchedule,
  getLedgerEntries,
  releasePayoutFromPot,
  rejectContribution,
  sendContributionReminder,
  submitContribution,
  type BackendCircleDetail,
  type BackendCircleMember,
  type BackendJoinRequest,
  type BackendLedgerEntry,
  type BackendRoundContribution,
  type BackendRoundSnapshot,
  type BackendWalletSnapshot,
  requestPositionSwap,
  getMemberAccessToken,
  reorderPayoutTurn,
  requestAdditionalHand,
  startCircle,
} from '@/lib/api';
import { RecordsStatementCenter } from '@/components/records/RecordsStatementCenter';

import { useAuthSession } from '@/lib/authContext';
import {
  circleInviteHref,
  circlePaymentSetupHref,
  contributionHref,
  myCirclesHref,
} from '@/lib/navigation';
import {
  buildClaimInviteShareMessage,
  buildClaimInviteUrl,
} from '@/lib/claimInvite';
import { copyText } from '@/lib/clipboard';
import {
  formatHandsPeopleMetrics,
  handClaimStatusLabel,
  isCircleNotStarted,
  isUnclaimedHand,
  peopleHandsSectionTitle,
  peoplePendingSectionTitle,
  roundCompletedSubtitle,
  roundCompletedTitle,
  roundUnstartedSubtitle,
  roundUnstartedTitle,
} from '@/lib/circleLifecycleCopy';
import {
  buildCircleSetupProgress,
  orderedParticipatingHands,
  setupStepStatusLabel,
  splitWaitlistRequests,
  type SetupStepStatus,
} from '@/lib/circleSetupProgress';
import {
  buildPayoutOrderReviewLines,
  buildStartCircleConfirmations,
  canShowStartCircleAction,
  getCircleLifecyclePhase,
  getStartCircleBlockReason,
  getStartCircleReviewHints,
  isCircleCompleted,
  isCircleSetupState,
  isCircleStarted,
  requiresUnclaimedStartConfirmation,
  type StartCircleConfirmations,
} from '@/lib/startCircleReadiness';
import { colors, radii, shadows, spacing } from '@/lib/theme';
import ChatFeed from '@/components/ChatFeed';
import { Avatar } from '@/components/Avatar';
import ChatInput from '@/components/ChatInput';
import { useChat } from '@/lib/useChat';
import { DecisionSheet } from '@/components/DecisionSheet';
import {
  groupCurrentApiHandsForDisplay,
  initialsForDisplay,
  validateCurrentPayoutOrder,
} from '@/lib/peopleWorkspace';

type ActiveTab = 'round' | 'chat' | 'people' | 'records';

type ContributionStatusView = {
  label: string;
  raw: string;
};

type PeopleNotice = {
  title: string;
  body: string;
  tone: 'success' | 'warning';
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
  const isPremium = session?.user?.role?.toLowerCase() === 'premium';

  const [circle, setCircle] = useState<BackendCircleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [resolvedRound, setResolvedRound] = useState<number | null>(null);

  async function loadWorkspace(options?: { silent?: boolean }) {
    if (!token || !circleId) {
      setError('Missing token or circle ID.');
      setLoading(false);
      return;
    }

    if (!options?.silent) {
      setLoading(true);
    }
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
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, [circleId, token]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadWorkspace({ silent: true });
      setRefreshNonce((n) => n + 1);
    } finally {
      setRefreshing(false);
    }
  };

  const displayRound = resolvedRound ?? circle?.currentRound;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          circle && token ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
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
                ? `Round ${displayRound ?? circle.currentRound} · ${capitalizeFrequency(circle.frequency)}`
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
            onReload={() => loadWorkspace({ silent: true })}
            isPremium={isPremium}
            refreshNonce={refreshNonce}
            onRoundResolved={setResolvedRound}
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
  isPremium,
  refreshNonce,
  onRoundResolved,
}: {
  circle: BackendCircleDetail;
  token: string;
  userId: string;
  initialTab: ActiveTab;
  onReload: () => Promise<void>;
  isPremium: boolean;
  refreshNonce: number;
  onRoundResolved: (round: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [scheduleData, setScheduleData] = useState<BackendRoundSnapshot | null>(
    null,
  );
  const [ledgerEntries, setLedgerEntries] = useState<BackendLedgerEntry[]>([]);
  const [secondaryLoading, setSecondaryLoading] = useState(true);
  const [secondaryError, setSecondaryError] = useState<string | null>(null);
  const cacheHealRetries = useRef(0);
  const [actionMemberId, setActionMemberId] = useState<string | null>(null);
  const paymentInstructions = circle.paymentInstructions ?? null;

  const loadBackendSections = useCallback(async () => {
    setSecondaryLoading(true);
    setSecondaryError(null);
    try {
      const [scheduleResponse, ledgerResponse] = await Promise.all([
        getCircleSchedule(token, circle.id),
        getLedgerEntries(token, circle.id),
      ]);
      setScheduleData(scheduleResponse);
      setLedgerEntries(ledgerResponse.entries || []);
    } catch (loadError) {
      setSecondaryError(
        loadError instanceof Error
          ? loadError.message
          : 'The backend did not return the workspace data.',
      );
    } finally {
      setSecondaryLoading(false);
    }
  }, [token, circle.id]);

  useEffect(() => {
    void loadBackendSections();
  }, [circle.id, token, refreshNonce, loadBackendSections]);

  // scheduleData is the single source of truth for the round summary.
  // Do not fall back to circle.currentRoundSummary — it can be stale relative
  // to what getCircleSchedule returns, causing contradictory display values.
  const summary = scheduleData?.currentRoundSummary;
  const roundWorkspace = scheduleData?.roundWorkspace;
  const viewerPermissions = roundWorkspace?.viewerPermissions;
  const viewerRole = roundWorkspace?.viewerRole;

  const { messages, sendMessage, sending } = useChat(circle.id);

  const handleRequestSwap = async (targetMemberId: string) => {
    try {
      await requestPositionSwap(circle.id, token, targetMemberId);
      Alert.alert('Swap Requested', 'A request has been sent to the member.');
    } catch (err) {
      Alert.alert('Swap Failed', 'Could not send swap request.');
    }
  };
  const circleUserRole = String(circle.userRole ?? 'none');
  const workspaceViewerRole = String(viewerRole ?? 'none');
  
  const isValidViewerRole = ['organizer', 'steward', 'participant', 'member'].includes(workspaceViewerRole);
  const hasBackendWorkspaceAccess = Boolean(roundWorkspace && isValidViewerRole);

  const activeParticipant =
    hasBackendWorkspaceAccess ||
    circleUserRole === 'organizer' ||
    circleUserRole === 'participant' ||
    circleUserRole === 'member' ||
    workspaceViewerRole === 'organizer' ||
    workspaceViewerRole === 'participant' ||
    workspaceViewerRole === 'member';
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

  // Roster-based: every circle member appears, left-joined to their contribution.
  const currentRoundMembers = useMemo(() => {
    return orderedMembers.map((member) => {
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
    });
  }, [
    orderedMembers,
    scheduleData?.contributions,
    roundWallet,
    ledgerEntries,
    currentRoundNumber,
  ]);

  const expectedContributionsCount =
    summary?.expectedContributionCount ??
    roundWorkspace?.totalMemberCount ??
    orderedMembers.length;
  const viewerMemberId = roundWorkspace?.viewerMemberId ?? null;

  useEffect(() => {
    if (typeof currentRoundNumber === 'number' && Number.isFinite(currentRoundNumber)) {
      onRoundResolved(currentRoundNumber);
    }
  }, [currentRoundNumber, onRoundResolved]);

  const viewerMember =
    orderedMembers.find((member) => member.id === viewerMemberId) ??
    orderedMembers.find((member) => member.userId === userId);

  useEffect(() => {
    // If the backend confirms we have access, but we couldn't find our member object,
    // our circle.members cache is likely stale. Heal it automatically once.
    if (hasBackendWorkspaceAccess && !viewerMember && cacheHealRetries.current < 1) {
      cacheHealRetries.current += 1;
      onReload();
    }
  }, [hasBackendWorkspaceAccess, viewerMember, onReload]);
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

  const totalRoundsCount =
    circle.totalRounds ?? scheduleData?.schedule?.length ?? expectedContributionsCount;

  const visibleConfirmedCount = currentRoundMembers.filter(
    (entry) => entry.status.raw === 'confirmed',
  ).length;

  const visibleProgress =
    expectedContributionsCount > 0
      ? Math.round(
          (Math.min(visibleConfirmedCount, expectedContributionsCount) /
            expectedContributionsCount) *
            100,
        )
      : null;

  const displayAllConfirmed =
    expectedContributionsCount > 0 &&
    visibleConfirmedCount >= expectedContributionsCount;

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
      try {
        await approveContribution(token, circle.id, member.id);
      } catch (approveError) {
        const message =
          approveError instanceof Error ? approveError.message : '';
        if (!message.includes('already has confirmed pot funding recorded')) {
          await Promise.all([onReload(), loadBackendSections()]);
          Alert.alert(
            'Payment recorded',
            'Payment was recorded as submitted, but could not be auto-confirmed. Use Confirm Receipt when ready.',
          );
          return;
        }
      }
      await Promise.all([onReload(), loadBackendSections()]);
    } catch (markPaidError) {
      Alert.alert(
        'Unable to record payment',
        markPaidError instanceof Error
          ? markPaidError.message
          : 'The backend rejected the record-payment request.',
      );
    } finally {
      setActionMemberId(null);
    }
  }

  async function handleReleasePayout(isManual = false) {
    if (!recipientId || typeof payoutAmount !== 'number') {
      Alert.alert(
        'Payout unavailable',
        'The backend did not provide a payout recipient and amount.',
      );
      return;
    }

    const recipient = orderedMembers.find(m => m.id === recipientId);
    if (!recipient) {
      Alert.alert('Error', 'Recipient not found in members list.');
      return;
    }

    const executeBackendRelease = async () => {
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
    };

    const promptConfirmRelease = () => {
      Alert.alert(
        'Confirm Payout',
        'Did you successfully send the payment?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, Mark Paid', onPress: executeBackendRelease }
        ]
      );
    };

    if (isManual) {
      promptConfirmRelease();
      return;
    }

    const buttons: any[] = [];
    
    if (recipient.cashtag) {
      const cleanCashtag = recipient.cashtag.startsWith('$') ? recipient.cashtag : `$${recipient.cashtag}`;
      buttons.push({
        text: `CashApp (${cleanCashtag})`,
        onPress: () => {
          Linking.openURL(`https://cash.app/${cleanCashtag}/${payoutAmount}`);
          setTimeout(promptConfirmRelease, 1000);
        }
      });
    }
    
    if (recipient.venmoHandle) {
      const cleanVenmo = recipient.venmoHandle.startsWith('@') ? recipient.venmoHandle.substring(1) : recipient.venmoHandle;
      buttons.push({
        text: `Venmo (@${cleanVenmo})`,
        onPress: () => {
          Linking.openURL(`venmo://paycharge?txn=pay&recipients=${cleanVenmo}&amount=${payoutAmount}&note=CircuSave%20Payout`);
          setTimeout(promptConfirmRelease, 1000);
        }
      });
    }
    
    const paypalEmail = recipient.paypalEmail;
    if (paypalEmail) {
      buttons.push({
        text: `PayPal (${paypalEmail})`,
        onPress: () => {
          // If it's a paypal.me link or an email
          const link = paypalEmail.includes('paypal.me') 
            ? `https://${paypalEmail}/${payoutAmount}` 
            : `https://paypal.com/myaccount/transfer/homepage?amount=${payoutAmount}&to=${paypalEmail}`;
          Linking.openURL(link);
          setTimeout(promptConfirmRelease, 1000);
        }
      });
    }

    buttons.push({
      text: 'Mark as Paid Manually',
      onPress: promptConfirmRelease
    });

    buttons.push({
      text: 'Cancel',
      style: 'cancel'
    });

    const recipientName = recipient.full_name || recipient.name || 'the recipient';

    Alert.alert(
      'Release Payout',
      `How would you like to send the $${payoutAmount} payout to ${recipientName}?`,
      buttons
    );
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
        // Lifecycle phase comes only from circle.status / startedAt / isStarted.
        // Do not wait on schedule to decide setup vs live — schedule is for active rounds only.
        isCircleNotStarted(circle) || isCircleCompleted(circle) || scheduleData ? (
          <>
            {secondaryLoading && isCircleStarted(circle) && !isCircleCompleted(circle) ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.inlineLoadingText}>Syncing backend data…</Text>
              </View>
            ) : null}
            {secondaryError && isCircleStarted(circle) && !isCircleCompleted(circle) ? (
              <View style={styles.inlineErrorBanner}>
                <FontAwesome name="warning" size={14} color={colors.warning} />
                <Text style={styles.inlineErrorText}>
                  Could not refresh: {secondaryError}
                </Text>
                <Pressable
                  onPress={() => void loadBackendSections()}
                  accessibilityRole="button"
                  accessibilityLabel="Retry refresh"
                >
                  <Text style={styles.inlineErrorRetry}>Retry</Text>
                </Pressable>
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
              totalMembers={expectedContributionsCount}
              totalRoundsCount={totalRoundsCount}
              visibleConfirmedCount={visibleConfirmedCount}
              visibleProgress={visibleProgress}
              viewerContributionStatus={viewerContributionStatus}
              viewerMember={viewerMember}
              viewerPayoutPosition={viewerPayoutPosition}
              processingMemberId={actionMemberId}
              paymentInstructions={paymentInstructions}
              isPremium={isPremium}
            />
          </>
        ) : !scheduleData && secondaryLoading ? (
          <StatusCard
            icon="spinner"
            loading
            title="Loading round data"
            text="Fetching the latest round details from the backend…"
          />
        ) : !scheduleData && secondaryError ? (
          <View style={styles.statusCard}>
            <FontAwesome name="warning" size={34} color={colors.warning} />
            <Text style={styles.statusTitle}>Unable to load round data</Text>
            <Text style={styles.statusText}>{secondaryError}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => void loadBackendSections()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading round data"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <StatusCard
            icon="clock-o"
            title="Round data unavailable"
            text="The backend has not returned schedule data for this circle yet."
          />
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
          currentRoundNumber={currentRoundNumber}
          token={token ?? ''}
          onRefresh={onReload}
        />
      ) : null}

      {activeTab === 'records' ? (
        <RecordsStatementCenter
          circleId={circle.id}
          token={token ?? ''}
          members={circle.members || []}
          ledgerEntries={ledgerEntries}
          isPremium={isPremium}
          circleName={circle.name}
        />
      ) : null}
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
  totalRoundsCount,
  visibleConfirmedCount,
  visibleProgress,
  viewerContributionStatus,
  viewerMember,
  viewerPayoutPosition,
  paymentInstructions,
  isPremium,
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
  onReleasePayout: (isManual?: boolean) => void;
  payoutAmount?: number;
  payoutReleased: boolean;
  recipient?: BackendCircleMember;
  totalMembers: number;
  totalRoundsCount: number;
  visibleConfirmedCount: number;
  visibleProgress: number | null;
  viewerContributionStatus: ContributionStatusView;
  viewerMember?: BackendCircleMember;
  viewerPayoutPosition?: number | null;
  paymentInstructions?: string | null;
  isPremium: boolean;
}) {
  const [visibleActionCount, setVisibleActionCount] = useState(5);
  const [showAllPaid, setShowAllPaid] = useState(false);
  const [actionSearch, setActionSearch] = useState('');
  // Always start collapsed; only open when the user taps (reference terms, not live status).
  const [roundDetailsExpanded, setRoundDetailsExpanded] = useState(false);

  useEffect(() => {
    // New round or circle → keep details closed until needed.
    setRoundDetailsExpanded(false);
  }, [circle.id, currentRoundNumber]);

  // All display values arrive pre-normalized from WorkspaceContent.
  const expectedContributionsCount = totalMembers;
  const visibleTotalRounds = totalRoundsCount;
  // Authoritative only: status / startedAt / isStarted — never schedule presence.
  const lifecyclePhase = getCircleLifecyclePhase(circle);
  const notStarted = lifecyclePhase === 'setup';
  const completed = lifecyclePhase === 'completed';

  const isViewerRecipient = viewerMember && recipient && viewerMember.id === recipient.id;
  const potTarget =
    Number.isFinite(circle.contributionAmount) && expectedContributionsCount > 0
      ? circle.contributionAmount * expectedContributionsCount
      : payoutAmount ?? null;

  // Setup / draft: planned hands only — never Collecting, dues, or payout readiness.
  if (notStarted) {
    const plannedHands =
      currentRoundMembers.length > 0
        ? currentRoundMembers.map(({ member }) => member)
        : (circle.members || []).filter((m) => m.isParticipating !== false);
    const handMetrics = formatHandsPeopleMetrics({
      handCount: circle.handCount ?? plannedHands.length,
      uniqueMemberCount: circle.uniqueMemberCount,
      fallbackHandCount: plannedHands.length,
    });
    const plannedRounds =
      visibleTotalRounds > 0 ? visibleTotalRounds : plannedHands.length;

    return (
      <View style={styles.section}>
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: '#6231d6',
              padding: 24,
              borderRadius: 20,
            },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.15)',
                width: 50,
                height: 50,
                borderRadius: 12,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <FontAwesome name="calendar-o" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
                {roundUnstartedTitle()}
              </Text>
              <Text
                style={{
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: 14,
                  marginTop: 4,
                  lineHeight: 20,
                }}
              >
                {roundUnstartedSubtitle()}
              </Text>
            </View>
          </View>
          <View
            style={{
              marginTop: 20,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderRadius: 14,
              padding: 14,
            }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' }}>
              ROSTER
            </Text>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 4 }}>
              {handMetrics}
            </Text>
            <Text
              style={{
                color: 'rgba(255,255,255,0.75)',
                fontSize: 13,
                marginTop: 6,
                lineHeight: 18,
              }}
            >
              {plannedRounds} planned payout round
              {plannedRounds === 1 ? '' : 's'} once the organizer starts.
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.sectionCard,
            { padding: 0, overflow: 'hidden', backgroundColor: '#fff', borderRadius: 20 },
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#f3f4f6',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>
              Planned hands
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, fontWeight: '600' }}>
              Not active yet
            </Text>
          </View>
          {plannedHands.length === 0 ? (
            <Text style={[styles.helperText, { padding: 16 }]}>
              No planned hands on this circle yet.
            </Text>
          ) : (
            plannedHands.map((member, index) => (
              <View
                key={member.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: index === plannedHands.length - 1 ? 0 : 1,
                  borderBottomColor: '#f9fafb',
                }}
              >
                <View style={styles.positionBadge}>
                  <Text style={styles.positionText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}
                    numberOfLines={1}
                  >
                    {member.displayLabel || memberName(member)}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    Payout position #{index + 1}
                  </Text>
                </View>
                <StatusBadge
                  label={handClaimStatusLabel(member)}
                  tone={isUnclaimedHand(member) ? 'warning' : 'success'}
                />
              </View>
            ))
          )}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
          <Text style={[styles.sectionTitle, { color: '#1e40af' }]}>Before contributions start</Text>
          <Text style={[styles.sectionSubtitle, { color: '#1e3a8a' }]}>
            Hands are planned payout positions. After the organizer starts the circle, each
            participating hand becomes a live contribution obligation for round 1.
          </Text>
        </View>
      </View>
    );
  }

  // Completed: historical only — no Start, no structural setup, no live Collecting chrome.
  if (completed) {
    return (
      <View style={styles.section}>
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: '#374151',
              padding: 24,
              borderRadius: 20,
            },
          ]}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
            {roundCompletedTitle()}
          </Text>
          <Text
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 14,
              marginTop: 8,
              lineHeight: 20,
            }}
          >
            {roundCompletedSubtitle()}
          </Text>
          {visibleTotalRounds > 0 ? (
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 12 }}>
              {visibleTotalRounds} round{visibleTotalRounds === 1 ? '' : 's'} in this cycle
            </Text>
          ) : null}
        </View>
        {recipient ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Last recorded recipient</Text>
            <Text style={styles.sectionSubtitle}>{memberName(recipient)}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {/* Single hero: round status, recipient, pot, progress (no duplicate banners) */}
      <View style={[styles.heroCard, { backgroundColor: '#6231d6', padding: 24, borderRadius: 20 }]}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.15)',
                width: 50,
                height: 50,
                borderRadius: 12,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>
                {currentRoundNumber}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
                Round {currentRoundNumber}
                {visibleTotalRounds > 0 ? ` of ${visibleTotalRounds}` : ''}
              </Text>
              <Text
                style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}
                numberOfLines={2}
              >
                {displayRoundStatus}
              </Text>
              {dueDate ? (
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.75)',
                    fontSize: 12,
                    fontWeight: '600',
                    marginTop: 4,
                  }}
                >
                  Payout {formatDate(dueDate)}
                  {formatRelativeDays(dueDate)
                    ? ` · ${formatRelativeDays(dueDate)}`
                    : ''}
                </Text>
              ) : null}
            </View>
          </View>
          <View
            style={{
              backgroundColor: payoutReleased
                ? 'rgba(34,197,94,0.25)'
                : displayPayoutReady
                  ? 'rgba(245,158,11,0.3)'
                  : 'rgba(138,98,52,0.9)',
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <FontAwesome
              name={
                payoutReleased
                  ? 'check'
                  : displayPayoutReady
                    ? 'check-circle'
                    : 'clock-o'
              }
              size={14}
              color={payoutReleased || displayPayoutReady ? '#fff' : '#fef08a'}
            />
            <Text
              style={{
                color: payoutReleased || displayPayoutReady ? '#fff' : '#fef08a',
                fontSize: 13,
                fontWeight: '600',
              }}
            >
              {payoutReleased
                ? 'Released'
                : displayPayoutReady
                  ? 'Ready'
                  : 'Collecting'}
            </Text>
          </View>
        </View>

        {recipient ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 28 }}>
            <View style={{ marginRight: 16 }}>
              <Avatar name={memberName(recipient)} size={68} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: 13,
                  fontWeight: '600',
                }}
              >
                {isViewerRecipient
                  ? 'You receive this round'
                  : 'Payout recipient'}
              </Text>
              <Text
                style={{
                  color: '#fff',
                  fontSize: 22,
                  fontWeight: '900',
                  marginTop: 2,
                }}
              >
                {memberName(recipient)}
              </Text>
              <Text
                style={{
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: 13,
                  fontWeight: '600',
                  marginTop: 4,
                }}
              >
                Pot amount
              </Text>
              <Text
                style={{
                  color: '#fff',
                  fontSize: 32,
                  fontWeight: '900',
                  marginTop: -2,
                }}
              >
                {formatOptionalMoney(payoutAmount)}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: 24 }}>
          <View
            style={{
              height: 1,
              backgroundColor: 'rgba(255,255,255,0.15)',
              marginBottom: 16,
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
              Progress
            </Text>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
              {visibleConfirmedCount} of {expectedContributionsCount} confirmed
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                flex: 1,
                height: 10,
                backgroundColor: 'rgba(255,255,255,0.2)',
                borderRadius: 5,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${Math.max(0, Math.min(100, visibleProgress || 0))}%`,
                  height: '100%',
                  backgroundColor: '#22c55e',
                  borderRadius: 5,
                }}
              />
            </View>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>
              {Math.round(visibleProgress || 0)}%
            </Text>
          </View>
        </View>
      </View>

      {/* Members only: report own payment. Organizers manage everyone below. */}
      {!canReviewContributions && viewerMember ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>My contribution</Text>
          <Text style={styles.sectionSubtitle}>
            {memberCanSubmitContribution
              ? `Your ${formatMoney(circle.contributionAmount)} contribution is due this round.`
              : viewerContributionStatus.raw === 'confirmed'
                ? 'Your contribution for this round is confirmed.'
                : viewerContributionStatus.raw === 'submitted' ||
                    viewerContributionStatus.raw === 'late'
                  ? 'Your payment is waiting for the organizer to confirm.'
                  : `Status: ${viewerContributionStatus.label}`}
            {viewerPayoutPosition
              ? ` · Your payout turn is #${viewerPayoutPosition}.`
              : ''}
          </Text>

          {memberCanSubmitContribution ? (
            <View style={styles.paymentInstructions}>
              <FontAwesome
                name="send"
                size={14}
                color={colors.primary}
                style={{ marginBottom: 6 }}
              />
              <Text style={styles.paymentInstructionsTitle}>
                Where to send your payment
              </Text>
              <Text style={styles.paymentInstructionsText}>
                {paymentInstructions ??
                  'Contact the organizer for payment details.'}
              </Text>
            </View>
          ) : null}

          {viewerContributionStatus.raw === 'submitted' ||
          viewerContributionStatus.raw === 'late' ? (
            <View style={styles.pendingConfirmationCard}>
              <FontAwesome name="clock-o" size={20} color={colors.warning} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.pendingConfirmationTitle}>
                  Payment reported
                </Text>
                <Text style={styles.pendingConfirmationText}>
                  Waiting for the organizer to confirm receipt.
                </Text>
              </View>
            </View>
          ) : memberCanSubmitContribution ? (
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
          )}
        </View>
      ) : null}

      {/* Release Payout is gated on backend permission only — display state
          (displayPayoutReady / displayAllConfirmed) must never unlock this. */}
      {canReleasePayout && isPremium ? (
        <Pressable
          style={styles.payoutButton}
          onPress={() => onReleasePayout(false)}
          accessibilityRole="button"
          accessibilityLabel="Release payout"
        >
          <FontAwesome name="money" size={18} color="#fff" />
          <Text style={styles.payoutButtonText}>Release Payout</Text>
        </Pressable>
      ) : canReleasePayout && !isPremium ? (
        <View style={{ width: '100%' }}>
          <Pressable
            style={[styles.payoutButton, { backgroundColor: '#6366f1' }]}
            onPress={() => router.push('/subscription')}
            accessibilityRole="button"
            accessibilityLabel="Upgrade to Premium"
          >
            <FontAwesome name="star" size={18} color="#fff" />
            <Text style={styles.payoutButtonText}>Premium: 1-Tap Payout</Text>
          </Pressable>
          <Pressable
            style={{ marginTop: 16, paddingVertical: 12, alignItems: 'center' }}
            onPress={() => onReleasePayout(true)}
            accessibilityRole="button"
            accessibilityLabel="Mark Paid Manually"
          >
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Mark as Paid Manually</Text>
          </Pressable>
        </View>
      ) : displayPayoutReady && !payoutReleased ? (
        <Text style={[styles.helperText, { marginTop: 8, textAlign: 'center' }]}>
          The round appears fully confirmed. Waiting for backend payout permission.
        </Text>
      ) : null}

      <View style={[styles.sectionCard, { padding: 0, overflow: 'hidden', backgroundColor: '#fff', borderRadius: 20, marginBottom: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>Who has paid</Text>
          <Pressable onPress={() => setShowAllPaid(!showAllPaid)}>
            <Text style={{ color: '#6b37cf', fontSize: 14, fontWeight: '800' }}>
              {showAllPaid ? 'Show less' : 'View all'}
            </Text>
          </Pressable>
        </View>

        {[...currentRoundMembers]
          .sort((a, b) => {
            const aConfirmed = a.status.raw === 'confirmed';
            const bConfirmed = b.status.raw === 'confirmed';
            if (aConfirmed && !bConfirmed) return 1;
            if (!aConfirmed && bConfirmed) return -1;
            return 0;
          })
          .slice(0, showAllPaid ? undefined : 4)
          .map(({ member, status }, index, arr) => {
          let badgeColor = '#f3f4f6';
          let textColor = '#4b5563';
          let badgeText = status.label;
          let icon = null;

          if (status.raw === 'confirmed') {
            badgeColor = '#dcfce7';
            textColor = '#166534';
            badgeText = 'Confirmed';
          } else if (status.raw === 'submitted' || status.raw === 'late') {
            badgeColor = '#fef3c7';
            textColor = '#92400e';
            badgeText = 'Submitted';
          } else {
            badgeColor = '#f3f4f6';
            textColor = '#4b5563';
            badgeText = 'Pending';
            icon = <FontAwesome name="clock-o" size={12} color="#4b5563" style={{ marginRight: 4 }} />;
          }

          const isProcessing = processingMemberId === member.id;
          const canMarkPaid = ['due', 'missed', 'rejected'].includes(status.raw);
          const canApprove = ['submitted', 'late'].includes(status.raw);
          const showActions = canReviewContributions && (canMarkPaid || canApprove);

          return (
            <View key={member.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
                <View style={{ marginRight: 12 }}>
                  <Avatar name={memberName(member)} size={40} />
                </View>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: '#111827' }}>{memberName(member)}</Text>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827', marginRight: 16 }}>{formatMoney(circle.contributionAmount)}</Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: badgeColor, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                  {icon}
                  <Text style={{ color: textColor, fontSize: 12, fontWeight: '800' }}>{badgeText}</Text>
                </View>
              </View>

              {showActions && (
                <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 16, gap: 8, paddingLeft: 68 }}>
                  {canApprove ? (
                    <>
                      <Pressable
                        style={{ flex: 1, backgroundColor: '#10b981', paddingVertical: 8, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                        disabled={isProcessing}
                        onPress={() => onApprove(member)}
                      >
                        <FontAwesome name="check-circle-o" size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Confirm</Text>
                      </Pressable>
                      <Pressable
                        style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ef4444', paddingVertical: 8, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                        disabled={isProcessing}
                        onPress={() => onReject(member)}
                      >
                        <FontAwesome name="times-circle-o" size={14} color="#ef4444" />
                        <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '800' }}>Reject</Text>
                      </Pressable>
                    </>
                  ) : canMarkPaid ? (
                    <>
                      <Pressable
                        style={{ flex: 1, backgroundColor: '#3b82f6', paddingVertical: 8, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                        disabled={isProcessing}
                        onPress={() => onMarkPaid(member)}
                      >
                        <FontAwesome name="check-circle-o" size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Record Paid</Text>
                      </Pressable>
                      {canRemindMembers ? (
                        <Pressable
                          style={{ flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 8, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                          disabled={isProcessing}
                          onPress={() => onRemind(member)}
                        >
                          <FontAwesome name="bell-o" size={14} color="#4b5563" />
                          <Text style={{ color: '#4b5563', fontSize: 13, fontWeight: '800' }}>Remind</Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : null}
                </View>
              )}

              {index < arr.length - 1 ? (
                <View style={{ height: 1, backgroundColor: '#f3f4f6', marginLeft: 68 }} />
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Reference-only details: no fields already shown in the hero */}
      <View
        style={[
          styles.sectionCard,
          {
            padding: 0,
            overflow: 'hidden',
            backgroundColor: '#fff',
            borderRadius: 20,
          },
        ]}
      >
        <Pressable
          style={styles.roundDetailsHeader}
          onPress={() => setRoundDetailsExpanded((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: roundDetailsExpanded }}
          accessibilityLabel={
            roundDetailsExpanded
              ? 'Collapse round details'
              : 'Expand round details'
          }
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.roundDetailsTitle}>Round details</Text>
            <Text style={styles.roundDetailsSummary} numberOfLines={2}>
              {roundDetailsExpanded
                ? 'Tap to hide'
                : 'Tap for frequency, pot size, and turn order'}
            </Text>
          </View>
          <FontAwesome
            name={roundDetailsExpanded ? 'chevron-up' : 'chevron-down'}
            size={13}
            color={colors.subtle}
            style={{ marginLeft: 10 }}
          />
        </Pressable>

        {roundDetailsExpanded ? (
          <View style={{ paddingBottom: 8 }}>
            <RoundDetailRow
              icon="refresh"
              label="Frequency"
              value={capitalizeFrequency(circle.frequency) || '—'}
            />
            <RoundDetailRow
              icon="dollar"
              label="Contribution per hand"
              value={`${formatMoney(circle.contributionAmount)} every ${
                capitalizeFrequency(circle.frequency)?.toLowerCase() || 'round'
              }`}
            />
            <RoundDetailRow
              icon="users"
              label="Participating hands"
              value={
                expectedContributionsCount > 0
                  ? `${expectedContributionsCount} hand${
                      expectedContributionsCount === 1 ? '' : 's'
                    } this cycle`
                  : 'Unknown'
              }
            />
            <RoundDetailRow
              icon="money"
              label="Full pot (all hands)"
              value={
                potTarget != null ? formatMoney(potTarget) : '—'
              }
            />
            {viewerPayoutPosition ? (
              <RoundDetailRow
                icon="list-ol"
                label="Your payout turn"
                value={`Position #${viewerPayoutPosition} of ${
                  visibleTotalRounds || expectedContributionsCount || '—'
                }`}
                last
              />
            ) : (
              <RoundDetailRow
                icon="info-circle"
                label="Cycle length"
                value={
                  visibleTotalRounds > 0
                    ? `${visibleTotalRounds} round${
                        visibleTotalRounds === 1 ? '' : 's'
                      }`
                    : 'Set by participating hands'
                }
                last
              />
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function RoundDetailRow({
  icon,
  label,
  value,
  last,
}: {
  icon: ComponentProps<typeof FontAwesome>['name'];
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <>
      <View style={styles.roundDetailRow}>
        <View style={styles.roundDetailIcon}>
          <FontAwesome name={icon} size={14} color={colors.primary} />
        </View>
        <Text style={styles.roundDetailLabel}>{label}</Text>
        <Text style={styles.roundDetailValue} numberOfLines={3}>
          {value}
        </Text>
      </View>
      {!last ? <View style={styles.roundDetailDivider} /> : null}
    </>
  );
}

function PeopleTab({
  circle,
  hasSchedule,
  isOrganizer,
  members,
  recipientId,
  userId,
  currentRoundNumber,
  token,
  onRefresh,
}: {
  circle: BackendCircleDetail;
  hasSchedule: boolean;
  isOrganizer: boolean;
  members: BackendCircleMember[];
  recipientId?: string | null;
  userId: string;
  currentRoundNumber: number;
  token: string;
  onRefresh: () => Promise<void>;
}) {
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [addingHand, setAddingHand] = useState(false);
  const [showHandModal, setShowHandModal] = useState(false);
  const [startingCircle, setStartingCircle] = useState(false);
  const [sharingClaimId, setSharingClaimId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  /** Mirrors start contract confirmPayoutOrder — not a DB field. */
  const [payoutOrderReviewed, setPayoutOrderReviewed] = useState(false);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [expandedMemberKey, setExpandedMemberKey] = useState<string | null>(null);
  const [inviteSectionExpanded, setInviteSectionExpanded] = useState(true);
  const [showPayoutReview, setShowPayoutReview] = useState(false);
  const [declineTarget, setDeclineTarget] = useState<BackendJoinRequest | null>(null);
  const [showRequestSent, setShowRequestSent] = useState(false);
  const [showUnclaimedReview, setShowUnclaimedReview] = useState(false);
  const [pendingStartConfirmations, setPendingStartConfirmations] = useState<StartCircleConfirmations | null>(null);
  const [peopleNotice, setPeopleNotice] = useState<PeopleNotice | null>(null);
  const structureMutationBusy =
    Boolean(approvingId) ||
    Boolean(decliningId) ||
    addingHand ||
    startingCircle ||
    Boolean(reorderingId);
  const shortCode = circle.circleCode;
  const waitlist: BackendJoinRequest[] = circle.waitlist ?? [];
  // People tab structural controls: lifecycle from status/startedAt/isStarted only.
  const lifecyclePhase = getCircleLifecyclePhase(circle);
  const circleNotStarted = lifecyclePhase === 'setup';
  const showSetupOrganizerActions = canShowStartCircleAction({
    isOrganizer,
    circle,
  });
  const startBlockReason = getStartCircleBlockReason({
    circle,
    members,
    waitlist,
  });
  const startReviewHints = getStartCircleReviewHints({ members, waitlist });
  const needsUnclaimedConfirm = requiresUnclaimedStartConfirmation(members);
  const setupProgress = useMemo(
    () =>
      buildCircleSetupProgress({
        circle,
        members,
        waitlist,
        payoutOrderReviewed,
      }),
    [circle, members, waitlist, payoutOrderReviewed],
  );
  const { joinRequests, additionalHandRequests } = useMemo(
    () => splitWaitlistRequests(waitlist),
    [waitlist],
  );
  const payoutOrderRows = useMemo(
    () =>
      orderedParticipatingHands({
        members,
        turnOrder: circle.turnOrder,
      }),
    [members, circle.turnOrder],
  );
  const memberGroups = useMemo(
    () => groupCurrentApiHandsForDisplay(members),
    [members],
  );

  const toggleMemberExpanded = useCallback((groupKey: string) => {
    setExpandedMemberKey((prev) => (prev === groupKey ? null : groupKey));
  }, []);
  const payoutOrderValidation = useMemo(
    () => validateCurrentPayoutOrder(members, circle.turnOrder ?? []),
    [members, circle.turnOrder],
  );
  async function handleApprove(requestId: string) {
    if (!circleNotStarted || structureMutationBusy) {
      Alert.alert(
        'Structure locked',
        'Join and additional-hand requests cannot be approved after the circle has started.',
      );
      return;
    }
    setApprovingId(requestId);
    try {
      await approveJoinRequest(token, circle.id, requestId);
      await onRefresh();
      Alert.alert('Approved!', 'The member has been approved and added to the circle.');
    } catch (e) {
      setPeopleNotice({
        title: 'Request not approved',
        body: e instanceof Error ? e.message : 'The backend could not approve this request.',
        tone: 'warning',
      });
    } finally {
      setApprovingId(null);
    }
  }

  function handleDecline(member: BackendJoinRequest) {
    if (!circleNotStarted || structureMutationBusy) return;
    setDeclineTarget(member);
  }

  async function confirmDecline() {
    if (!declineTarget || structureMutationBusy) return;
    setDecliningId(declineTarget.requestId);
    try {
      await declineJoinRequest(token, circle.id, declineTarget.requestId);
      setDeclineTarget(null);
      await onRefresh();
    } catch (error) {
      Alert.alert(
        'Unable to decline request',
        error instanceof Error ? error.message : 'The backend rejected the decline action.',
      );
    } finally {
      setDecliningId(null);
    }
  }

  async function handleShareClaimInvite(member: BackendCircleMember) {
    if (!token || sharingClaimId) {
      return;
    }
    setSharingClaimId(member.id);
    try {
      const { claimToken } = await getMemberAccessToken(circle.id, member.id, token);
      const claimUrl = buildClaimInviteUrl(circle.id, claimToken);
      await Share.share({
        message: buildClaimInviteShareMessage({
          circleName: circle.name,
          handName: member.displayLabel || memberName(member),
          claimUrl,
        }),
      });
    } catch (error) {
      Alert.alert(
        'Unable to share claim invite',
        error instanceof Error
          ? error.message
          : 'Could not generate a claim link for this hand.',
      );
    } finally {
      setSharingClaimId(null);
    }
  }

  async function handleCopyCircleCode() {
    if (!shortCode) {
      Alert.alert('Code unavailable', 'The backend has not provided a circle code.');
      return;
    }
    try {
      // Uses expo-clipboard when the native binary includes it; otherwise Share
      // (or an on-screen code) so older dev builds do not hard-crash.
      const result = await copyText(shortCode);
      if (result === 'clipboard') {
        Alert.alert('Code copied', `${shortCode} is ready to paste.`);
        return;
      }
      if (result === 'share') {
        return;
      }
      Alert.alert('Circle code', shortCode);
    } catch (error) {
      Alert.alert(
        'Unable to copy code',
        error instanceof Error
          ? error.message
          : 'Share the code manually from the invite section.',
      );
    }
  }

  function promptStartCircle() {
    if (structureMutationBusy) {
      return;
    }
    if (startBlockReason) {
      setPeopleNotice({ title: 'Circle not ready', body: startBlockReason, tone: 'warning' });
      return;
    }
    promptPayoutOrderReview();
  }

  function promptPayoutOrderReview() {
    setShowPayoutReview(true);
  }

  function promptUnclaimedHandsReview() {
    if (!needsUnclaimedConfirm) {
      promptFinalStartConfirm({ unclaimedManagedConfirmed: true });
      return;
    }

    setShowUnclaimedReview(true);
  }

  function promptFinalStartConfirm(input: { unclaimedManagedConfirmed: boolean }) {
    const confirmations = buildStartCircleConfirmations({
      members,
      payoutOrderReviewed: true,
      unclaimedManagedConfirmed: input.unclaimedManagedConfirmed,
    });

    setPendingStartConfirmations(confirmations);
  }

  async function executeStartCircle(confirmations: StartCircleConfirmations) {
    if (structureMutationBusy) {
      return;
    }
    // Re-check readiness immediately before the API call.
    const blockReason = getStartCircleBlockReason({
      circle,
      members,
      waitlist,
    });
    if (blockReason) {
      setPendingStartConfirmations(null);
      setPeopleNotice({ title: 'Circle not ready', body: blockReason, tone: 'warning' });
      return;
    }
    if (!confirmations.confirmPayoutOrder) {
      setPendingStartConfirmations(null);
      setPeopleNotice({ title: 'Circle not ready', body: 'Confirm the payout order before starting.', tone: 'warning' });
      return;
    }
    if (needsUnclaimedConfirm && !confirmations.confirmUnclaimedHands) {
      setPendingStartConfirmations(null);
      setPeopleNotice({ title: 'Circle not ready', body: 'Confirm you will manage unclaimed hands, or share claim invites first.', tone: 'warning' });
      return;
    }

    setStartingCircle(true);
    try {
      await startCircle(token, circle.id, {
        confirmPayoutOrder: true,
        confirmUnclaimedHands: confirmations.confirmUnclaimedHands,
      });
      await onRefresh();
      setPendingStartConfirmations(null);
      setPeopleNotice({ title: 'Circle started', body: 'Contributions are now active and the payout order is locked.', tone: 'success' });
    } catch (error) {
      setPendingStartConfirmations(null);
      setPeopleNotice({
        title: 'Unable to start circle',
        body: error instanceof Error ? error.message : 'The backend rejected the start request.',
        tone: 'warning',
      });
    } finally {
      setStartingCircle(false);
    }
  }

  async function handleAddHand() {
    if (structureMutationBusy) {
      return;
    }
    setAddingHand(true);
    setShowHandModal(false);
    try {
      await requestAdditionalHand(token, circle.id);
      await onRefresh();
      setShowRequestSent(true);
    } catch (e) {
      Alert.alert('Not available', e instanceof Error ? e.message : 'Could not request additional hand.');
    } finally {
      setAddingHand(false);
    }
  }

  async function handleReorderHand(memberId: string, move: 'up' | 'down') {
    if (!token || structureMutationBusy) {
      return;
    }
    setReorderingId(memberId);
    try {
      await reorderPayoutTurn(token, circle.id, memberId, move);
      // Structure changed — organizer must re-confirm at Start.
      setPayoutOrderReviewed(false);
      await onRefresh();
    } catch (error) {
      Alert.alert(
        'Unable to reorder',
        error instanceof Error
          ? error.message
          : 'Could not update the payout order.',
      );
    } finally {
      setReorderingId(null);
    }
  }

  // Existing members (including organizers) may request more hands before lock.
  // Count active hands plus the user's pending additional-hand waitlist items so
  // "+ Add Another Hand" is hidden while Hand 2/3 is awaiting approval.
  const viewerHands = members.filter((m) => m.userId === userId);
  const viewerHandCount = viewerHands.length;
  const viewerPendingAdditionalHands = waitlist.filter((entry) => {
    if (entry.userId !== userId) {
      return false;
    }
    const handNumber = Number(entry.handNumber ?? entry.hand_number ?? 1);
    return entry.isAdditionalHand === true || handNumber > 1;
  });
  const pendingAdditionalHand = viewerPendingAdditionalHands[0] ?? null;
  const pendingAdditionalHandNumber = pendingAdditionalHand
    ? Number(
        pendingAdditionalHand.handNumber ??
          pendingAdditionalHand.hand_number ??
          1,
      )
    : null;
  const totalHandsTowardCap =
    viewerHandCount + viewerPendingAdditionalHands.length;
  // Additional hands only while structure is unlocked (setup/draft, not started).
  const structureAllowsAdditionalHand = isCircleSetupState(circle);
  const canAddHand =
    viewerHandCount > 0 &&
    !pendingAdditionalHand &&
    totalHandsTowardCap < 3 &&
    structureAllowsAdditionalHand;

  const showPendingAdditionalHand =
    viewerHandCount > 0 &&
    pendingAdditionalHand !== null &&
    structureAllowsAdditionalHand;

  const payoutReviewLines = buildPayoutOrderReviewLines({
    members,
    turnOrder: circle.turnOrder,
  });
  const payoutReviewSheet = (
    <DecisionSheet
      visible={showPayoutReview}
      onClose={() => setShowPayoutReview(false)}
      icon="list-ol"
      title="Review payout order"
      body="Confirm every participating hand is in the correct position. The order locks when the circle starts."
      primaryLabel="Confirm order"
      onPrimary={() => {
        setShowPayoutReview(false);
        setPayoutOrderReviewed(true);
        promptUnclaimedHandsReview();
      }}
    >
      <View style={styles.payoutReviewList}>
        {payoutReviewLines.length > 0 ? payoutReviewLines.map((line, index) => (
          <View key={`${line}-${index}`} style={styles.payoutReviewRow}>
            <View style={styles.payoutReviewPosition}><Text style={styles.payoutReviewPositionText}>{index + 1}</Text></View>
            <Text style={styles.payoutReviewName}>{line.replace(/^\d+\.\s*/, '').replace(/^•\s*/, '')}</Text>
          </View>
        )) : <Text style={styles.helperText}>No payout order is available yet.</Text>}
      </View>
    </DecisionSheet>
  );
  const unclaimedHandsForReview = members.filter(
    (member) => member.isParticipating !== false && isUnclaimedHand(member),
  );
  const peopleOverlays = (
    <>
      {payoutReviewSheet}
      <DecisionSheet
        visible={Boolean(declineTarget)}
        onClose={() => {
          if (!decliningId) setDeclineTarget(null);
        }}
        icon="times"
        iconTone="warning"
        title="Decline request?"
        body={declineTarget ? `Decline the pending request for ${memberName(declineTarget)}? No workspace access or financial hand will be granted.` : ''}
        primaryLabel="Decline request"
        onPrimary={() => void confirmDecline()}
        busy={Boolean(decliningId)}
      />
      <DecisionSheet
        visible={showRequestSent}
        onClose={() => setShowRequestSent(false)}
        icon="paper-plane"
        iconTone="success"
        title="Request sent"
        body="Your additional-hand request is waiting for organizer approval. It will not become active until approved."
        primaryLabel="Done"
        secondaryLabel={null}
        onPrimary={() => setShowRequestSent(false)}
      />
      <DecisionSheet
        visible={showUnclaimedReview}
        onClose={() => setShowUnclaimedReview(false)}
        icon="user-o"
        iconTone="warning"
        title="Unclaimed hands"
        body={`${unclaimedHandsForReview.length} planned hand${unclaimedHandsForReview.length === 1 ? '' : 's'} do not have connected workspace members. You can share claim invites first or explicitly manage these positions.`}
        primaryLabel="I will manage them"
        onPrimary={() => {
          setShowUnclaimedReview(false);
          promptFinalStartConfirm({ unclaimedManagedConfirmed: true });
        }}
      >
        <View style={styles.unclaimedReviewList}>
          {unclaimedHandsForReview.map((member) => (
            <View key={member.id} style={styles.unclaimedReviewRow}>
              <View style={styles.initialsAvatar}><Text style={styles.initialsText}>{initialsForDisplay(memberName(member))}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.handDetailTitle}>{memberName(member)}</Text>
                <Text style={styles.handDetailMeta}>No workspace access · Organizer-managed</Text>
              </View>
            </View>
          ))}
        </View>
      </DecisionSheet>
      <DecisionSheet
        visible={Boolean(pendingStartConfirmations)}
        onClose={() => {
          if (!startingCircle) setPendingStartConfirmations(null);
        }}
        icon="lock"
        iconTone="warning"
        title="Start this circle?"
        body="Starting locks membership, participating hands, and payout order. Contribution obligations begin according to the saved schedule."
        primaryLabel="Start circle"
        onPrimary={() => {
          if (pendingStartConfirmations) void executeStartCircle(pendingStartConfirmations);
        }}
        busy={startingCircle}
      />
      <DecisionSheet
        visible={Boolean(peopleNotice)}
        onClose={() => setPeopleNotice(null)}
        icon={peopleNotice?.tone === 'success' ? 'check' : 'exclamation-triangle'}
        iconTone={peopleNotice?.tone ?? 'warning'}
        title={peopleNotice?.title ?? ''}
        body={peopleNotice?.body ?? ''}
        primaryLabel="Got it"
        secondaryLabel={null}
        onPrimary={() => setPeopleNotice(null)}
      />
    </>
  );

  // ── Phase 1 setup (organizer + setup only) — single surface, accordion steps ─
  if (circleNotStarted && isOrganizer && setupProgress) {
    const progress = setupProgress;

    const unclaimedMembers = members.filter(
      (m) => isUnclaimedHand(m) && m.isParticipating !== false,
    );
    const participatingMembers = members.filter(
      (m) => m.isParticipating !== false,
    );

    async function shareCircleCode() {
      if (!shortCode) {
        Alert.alert(
          'Code unavailable',
          'The circle code is not available for sharing right now.',
        );
        return;
      }
      try {
        await Share.share({
          message: `Join my savings circle on CircuSave!\n\nCode: ${shortCode}\n\nOr use this link: https://app.circusave.com/invite/${shortCode}`,
        });
      } catch {
        /* cancelled */
      }
    }

    function renderSetupStepBody(stepId: string) {
      switch (stepId) {
        case 'invite_members':
          return (
            <View style={styles.setupBody}>
              <View style={styles.setupCodeBlock}>
                <Text style={styles.setupMicroLabel}>Invite code</Text>
                <View style={styles.setupCodeRow}>
                  <Text
                    selectable
                    style={styles.setupCodeValue}
                    accessibilityLabel={`Invite code ${shortCode || 'unavailable'}`}
                  >
                    {shortCode || '—'}
                  </Text>
                  <View style={styles.setupCodeActions}>
                    <Pressable
                      style={styles.setupIconBtn}
                      disabled={!shortCode}
                      onPress={() => void handleCopyCircleCode()}
                      accessibilityRole="button"
                      accessibilityLabel="Copy circle code"
                    >
                      <FontAwesome name="copy" size={15} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.setupIconBtn,
                        (pressed || !shortCode) && { opacity: 0.5 },
                      ]}
                      disabled={!shortCode}
                      onPress={() => void shareCircleCode()}
                      accessibilityRole="button"
                      accessibilityLabel="Share circle code"
                    >
                      <FontAwesome name="share-alt" size={15} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.setupPrimaryBtn,
                  pressed && { opacity: 0.88 },
                ]}
                onPress={() => router.push(circleInviteHref(circle.id))}
                accessibilityRole="button"
                accessibilityLabel="Invite members"
              >
                <FontAwesome name="user-plus" size={15} color="#fff" />
                <Text style={styles.setupPrimaryBtnText}>Invite members</Text>
              </Pressable>
            </View>
          );

        case 'review_claims_joins':
          return (
            <View style={styles.setupBody}>
              {joinRequests.length === 0 ? (
                <Text style={styles.setupEmpty}>No join requests to review.</Text>
              ) : (
                <View style={styles.setupList}>
                  {joinRequests.map((entry) => {
                    const m = entry;
                    return (
                      <View key={m.id} style={styles.setupListRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.setupListTitle}>
                            {m.displayLabel || memberName(m)}
                          </Text>
                          <Text style={styles.setupListSub}>
                            Join request · {m.phone || 'Pending approval'}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable
                            style={({ pressed }) => [styles.setupGhostBtn, pressed && { opacity: 0.85 }]}
                            onPress={() => handleDecline(m)}
                            disabled={structureMutationBusy}
                            accessibilityRole="button"
                            accessibilityLabel={`Decline ${memberName(m)}`}
                          >
                            <Text style={styles.setupGhostBtnText}>Decline</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [
                              styles.setupApproveBtn,
                              pressed && { opacity: 0.85 },
                              structureMutationBusy && { opacity: 0.5 },
                            ]}
                            onPress={() => handleApprove(m.requestId)}
                            disabled={structureMutationBusy}
                            accessibilityRole="button"
                            accessibilityLabel={`Approve ${memberName(m)}`}
                          >
                            {approvingId === m.requestId ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : (
                              <Text style={styles.setupApproveBtnText}>Approve</Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );

        case 'confirm_member_access':
          return (
            <View style={styles.setupBody}>
              <Text style={styles.setupListHint}>
                Claimed hands have workspace access. Unclaimed hands may stay as
                cash-managed positions at Start.
              </Text>
              <View style={styles.setupList}>
                {participatingMembers.map((member) => {
                  const unclaimed = isUnclaimedHand(member);
                  return (
                    <View key={member.id} style={styles.setupListRow}>
                      <View
                        style={[
                          styles.setupAvatar,
                          {
                            backgroundColor: unclaimed
                              ? colors.warningSoft
                              : colors.successSoft,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '800',
                            color: unclaimed ? '#b45309' : '#047857',
                          }}
                        >
                          {(memberName(member)[0] || '?').toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.setupListTitle}>
                          {member.displayLabel || memberName(member)}
                        </Text>
                        <Text style={styles.setupListSub}>
                          {unclaimed ? 'Unclaimed · no access' : 'Connected'}
                        </Text>
                      </View>
                      <SetupStatusBadge
                        status={unclaimed ? 'waiting' : 'complete'}
                        compact
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          );

        case 'review_additional_hands':
          return (
            <View style={styles.setupBody}>
              {additionalHandRequests.length === 0 ? (
                <Text style={styles.setupEmpty}>
                  No Hand 2 / Hand 3 requests pending.
                </Text>
              ) : (
                <View style={styles.setupList}>
                  {additionalHandRequests.map((entry) => {
                    const m = entry;
                    const handNum = Number(m.handNumber ?? m.hand_number ?? 2);
                    return (
                      <View key={m.id} style={styles.setupListRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.setupListTitle}>
                            {m.displayLabel || memberName(m)}
                          </Text>
                          <Text style={styles.setupListSub}>
                            Additional hand · Hand {handNum}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable
                            style={({ pressed }) => [styles.setupGhostBtn, pressed && { opacity: 0.85 }]}
                            onPress={() => handleDecline(m)}
                            disabled={structureMutationBusy}
                            accessibilityRole="button"
                            accessibilityLabel={`Decline additional hand for ${memberName(m)}`}
                          >
                            <Text style={styles.setupGhostBtnText}>Decline</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [
                              styles.setupApproveBtn,
                              pressed && { opacity: 0.85 },
                              structureMutationBusy && { opacity: 0.5 },
                            ]}
                            onPress={() => handleApprove(m.requestId)}
                            disabled={structureMutationBusy}
                            accessibilityRole="button"
                            accessibilityLabel={`Approve additional hand for ${memberName(m)}`}
                          >
                            {approvingId === m.requestId ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : (
                              <Text style={styles.setupApproveBtnText}>Approve</Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
              {canAddHand ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.setupGhostBtn,
                    { alignSelf: 'flex-start', marginTop: 4 },
                    pressed && { opacity: 0.8 },
                    structureMutationBusy && { opacity: 0.5 },
                  ]}
                  onPress={() => setShowHandModal(true)}
                  disabled={structureMutationBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Request an additional hand"
                >
                  <FontAwesome name="plus" size={12} color={colors.primary} />
                  <Text style={styles.setupGhostBtnText}>Request another hand</Text>
                </Pressable>
              ) : null}
            </View>
          );

        case 'verify_structure':
          return (
            <View style={styles.setupBody}>
              <View style={styles.setupMetricsRow}>
                {[
                  {
                    label: 'People',
                    value: String(progress.structure.peopleCount),
                  },
                  {
                    label: 'Hands',
                    value: String(progress.structure.handCount),
                  },
                  {
                    label: 'Est. rounds',
                    value: String(progress.structure.totalRounds),
                  },
                  {
                    label: 'Per hand',
                    value: `$${Math.round(progress.structure.contributionPerHand).toLocaleString()}`,
                  },
                  {
                    label: 'Est. pot / round',
                    value: `$${Math.round(progress.structure.potPerRound).toLocaleString()}`,
                  },
                  {
                    label: 'Organizer',
                    value: progress.structure.organizerParticipates
                      ? 'In'
                      : 'Out',
                  },
                ].map((metric) => (
                  <View key={metric.label} style={styles.setupMetricCell}>
                    <Text style={styles.setupMetricValue}>{metric.value}</Text>
                    <Text style={styles.setupMetricLabel}>{metric.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          );

        case 'finalize_payout_order':
          return (
            <View style={styles.setupBody}>
              <Text style={styles.setupListHint}>
                Reorder positions. Confirm the order when you start the circle —
                listing hands does not finalize review.
              </Text>
              {progress.payoutOrderComplete && !progress.payoutOrderReviewed ? (
                <Text style={styles.setupNotice}>
                  Structure complete. Review still required at Start.
                </Text>
              ) : null}
              <View style={styles.setupList}>
                {payoutOrderRows.map((row, index) => (
                  <View key={row.id} style={styles.setupListRow}>
                    <View
                      style={[
                        styles.setupAvatar,
                        {
                          backgroundColor: row.inOrder
                            ? colors.primarySoft
                            : colors.warningSoft,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '900',
                          color: row.inOrder ? colors.primary : '#b45309',
                        }}
                      >
                        {index + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.setupListTitle}>
                        {(row as BackendCircleMember).displayLabel ||
                          memberName(row as BackendCircleMember)}
                      </Text>
                      {!row.inOrder ? (
                        <Text style={[styles.setupListSub, { color: '#b45309' }]}>
                          Missing from order
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      {index > 0 ? (
                        <Pressable
                          onPress={() => void handleReorderHand(row.id, 'up')}
                          disabled={structureMutationBusy}
                          accessibilityRole="button"
                          accessibilityLabel="Move up"
                          hitSlop={8}
                        >
                          {reorderingId === row.id ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <FontAwesome
                              name="chevron-up"
                              size={14}
                              color={colors.primary}
                            />
                          )}
                        </Pressable>
                      ) : (
                        <View style={{ width: 14 }} />
                      )}
                      {index < payoutOrderRows.length - 1 ? (
                        <Pressable
                          onPress={() => void handleReorderHand(row.id, 'down')}
                          disabled={structureMutationBusy}
                          accessibilityRole="button"
                          accessibilityLabel="Move down"
                          hitSlop={8}
                        >
                          <FontAwesome
                            name="chevron-down"
                            size={14}
                            color={colors.primary}
                          />
                        </Pressable>
                      ) : (
                        <View style={{ width: 14 }} />
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );

        case 'review_and_start':
          return (
            <View style={styles.setupBody}>
              {startBlockReason ? (
                <Text style={styles.setupNotice}>{startBlockReason}</Text>
              ) : (
                <Text style={styles.setupListHint}>
                  Starting locks membership, hands, and payout order
                  {needsUnclaimedConfirm
                    ? '. You will confirm unclaimed hands first.'
                    : '.'}
                </Text>
              )}
              <Pressable
                style={({ pressed }) => [
                  styles.setupPrimaryBtn,
                  {
                    backgroundColor: startBlockReason
                      ? colors.subtle
                      : colors.primary,
                  },
                  (pressed || structureMutationBusy) && { opacity: 0.88 },
                  structureMutationBusy && { opacity: 0.65 },
                ]}
                onPress={promptStartCircle}
                disabled={structureMutationBusy || Boolean(startBlockReason)}
                accessibilityRole="button"
                accessibilityLabel="Start circle"
                accessibilityState={{
                  busy: startingCircle,
                  disabled: structureMutationBusy || Boolean(startBlockReason),
                }}
              >
                {startingCircle ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="play" size={14} color="#fff" />
                    <Text style={styles.setupPrimaryBtnText}>Start Circle</Text>
                  </>
                )}
              </Pressable>
            </View>
          );

        default:
          return null;
      }
    }

    return (
      <View style={styles.section}>
        {peopleOverlays}

        {/* Invite people — expandable section at top */}
        <View style={styles.peopleCard}>
          <Pressable
            style={styles.peopleCardHeader}
            onPress={() => setInviteSectionExpanded((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: inviteSectionExpanded }}
            accessibilityLabel={
              inviteSectionExpanded
                ? 'Collapse invite people'
                : 'Expand invite people'
            }
          >
            <View style={[styles.peopleIconBubble, { backgroundColor: colors.primarySoft }]}>
              <FontAwesome name="user-plus" size={14} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.peopleCardTitle}>Invite people</Text>
              {!inviteSectionExpanded ? (
                <Text style={styles.peopleCardSub}>
                  Share the code or claim links for planned hands
                </Text>
              ) : null}
            </View>
            <FontAwesome
              name={inviteSectionExpanded ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={colors.subtle}
            />
          </Pressable>
          {inviteSectionExpanded ? renderSetupStepBody('invite_members') : null}
        </View>

        {/* Priority: pending reviews only when present */}
        {joinRequests.length > 0 || additionalHandRequests.length > 0 ? (
          <View style={styles.peopleSectionStack}>
            {joinRequests.length > 0 ? (
              <View style={styles.peopleCard}>
                <View style={styles.peopleCardHeader}>
                  <View style={[styles.peopleIconBubble, { backgroundColor: colors.warningSoft }]}>
                    <FontAwesome name="inbox" size={14} color="#B45309" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.peopleCardTitle}>Join requests</Text>
                    <Text style={styles.peopleCardSub}>
                      {joinRequests.length} waiting · approve to grant a hand
                    </Text>
                  </View>
                  <View style={styles.peopleCountPill}>
                    <Text style={styles.peopleCountPillText}>{joinRequests.length}</Text>
                  </View>
                </View>
                {renderSetupStepBody('review_claims_joins')}
              </View>
            ) : null}
            {additionalHandRequests.length > 0 ? (
              <View style={styles.peopleCard}>
                <View style={styles.peopleCardHeader}>
                  <View style={[styles.peopleIconBubble, { backgroundColor: colors.primarySoft }]}>
                    <FontAwesome name="hand-o-up" size={14} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.peopleCardTitle}>Extra hands</Text>
                    <Text style={styles.peopleCardSub}>
                      Hand 2 / 3 requests for existing members
                    </Text>
                  </View>
                  <View style={styles.peopleCountPill}>
                    <Text style={styles.peopleCountPillText}>
                      {additionalHandRequests.length}
                    </Text>
                  </View>
                </View>
                {renderSetupStepBody('review_additional_hands')}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Members + payout positions */}
        <View style={styles.peopleCard}>
          <View style={styles.peopleCardHeader}>
            <View style={[styles.peopleIconBubble, { backgroundColor: colors.primarySoft }]}>
              <FontAwesome name="users" size={14} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.peopleCardTitle}>Members</Text>
              <Text style={styles.peopleCardSub}>
                Expand to claim, reorder, or inspect hands
              </Text>
            </View>
          </View>

          {!payoutOrderValidation.valid ? (
            <View style={styles.validationNotice}>
              <Text style={styles.validationTitle}>Payout order needs attention</Text>
              {payoutOrderValidation.missingHandIds.length ? (
                <Text style={styles.validationText}>
                  {payoutOrderValidation.missingHandIds.length} hand(s) missing from order.
                </Text>
              ) : null}
              {payoutOrderValidation.duplicateHandIds.length ? (
                <Text style={styles.validationText}>
                  {payoutOrderValidation.duplicateHandIds.length} duplicate position(s).
                </Text>
              ) : null}
              {payoutOrderValidation.unknownHandIds.length ? (
                <Text style={styles.validationText}>
                  {payoutOrderValidation.unknownHandIds.length} unknown position(s).
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.compactMemberList}>
            {memberGroups.map((group, groupIndex) => (
              <ExpandableMemberTile
                key={group.key}
                groupKey={group.key}
                hands={group.hands as BackendCircleMember[]}
                connectedUserId={group.connectedUserId}
                expanded={expandedMemberKey === group.key}
                isLast={groupIndex === memberGroups.length - 1}
                organizerId={circle.organizerId}
                turnOrder={circle.turnOrder ?? []}
                payoutOrderRows={payoutOrderRows}
                canReorder
                canShareClaim={(hand) => isUnclaimedHand(hand) && Boolean(token)}
                sharingClaimId={sharingClaimId}
                reorderingId={reorderingId}
                metaExtra={null}
                onToggle={() => toggleMemberExpanded(group.key)}
                onShareClaim={(hand) => void handleShareClaimInvite(hand)}
                onReorder={(handId, move) => void handleReorderHand(handId, move)}
              />
            ))}
          </View>
        </View>

        {/* Finish setup + Start Circle */}
        <View style={[styles.peopleCard, styles.peopleStartCard]}>
          <Text style={styles.setupEyebrow}>Finish setup</Text>
          <Text style={styles.peopleCardTitle}>Start circle</Text>
          <Text style={[styles.peopleCardSub, { marginBottom: 12 }]}>
            {progress.nextAction ||
              'Locks membership, hands, and payout order. Contributions begin after start.'}
          </Text>
          {renderSetupStepBody('review_and_start')}
        </View>

        {canAddHand ? (
          <Modal
            visible={showHandModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowHandModal(false)}
          >
            <View style={styles.setupModalOverlay}>
              <View style={styles.setupModalSheet}>
                <Text style={styles.setupModalTitle}>Add another hand</Text>
                <Text style={styles.setupModalBody}>
                  Each hand is a separate contribution and payout slot. The
                  organizer must explicitly approve the request.
                </Text>
                <Pressable
                  style={styles.setupPrimaryBtn}
                  onPress={handleAddHand}
                  disabled={addingHand}
                  accessibilityRole="button"
                >
                  {addingHand ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.setupPrimaryBtnText}>
                      Request another hand
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.setupModalCancel}
                  onPress={() => setShowHandModal(false)}
                >
                  <Text style={styles.setupModalCancelText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {peopleOverlays}

      {/* Invite code */}
      <View style={styles.peopleCard}>
        <View style={styles.setupCodeBlock}>
          <Text style={styles.setupMicroLabel}>Circle invite code</Text>
          <View style={styles.setupCodeRow}>
            <Text
              selectable
              style={styles.setupCodeValue}
              accessibilityLabel={`Invite code ${shortCode || 'unavailable'}`}
            >
              {shortCode || '—'}
            </Text>
            <View style={styles.setupCodeActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.setupIconBtn,
                  (pressed || !shortCode) && { opacity: 0.5 },
                ]}
                disabled={!shortCode}
                onPress={() => void handleCopyCircleCode()}
                accessibilityRole="button"
                accessibilityLabel="Copy circle code"
              >
                <FontAwesome name="copy" size={15} color={colors.text} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.setupIconBtn,
                  (pressed || !shortCode) && { opacity: 0.5 },
                ]}
                disabled={!shortCode}
                onPress={async () => {
                  if (!shortCode) {
                    Alert.alert(
                      'Code unavailable',
                      'The circle code is not available for sharing right now.',
                    );
                    return;
                  }
                  try {
                    await Share.share({
                      message: `Join my savings circle on CircuSave!\n\nCode: ${shortCode}\n\nOr use this link: https://app.circusave.com/invite/${shortCode}`,
                    });
                  } catch {
                    /* cancelled */
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Share circle code"
              >
                <FontAwesome name="share-alt" size={15} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        </View>
        {isOrganizer && circleNotStarted ? (
          <Pressable
            style={[styles.setupPrimaryBtn, { marginTop: 12 }]}
            onPress={() => router.push(circleInviteHref(circle.id))}
            accessibilityRole="button"
            accessibilityLabel="Invite a member"
          >
            <FontAwesome name="user-plus" size={15} color="#fff" />
            <Text style={styles.setupPrimaryBtnText}>Invite a member</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Pending requests */}
      {isOrganizer && waitlist.length > 0 ? (
        <View style={styles.peopleCard}>
          <View style={styles.peopleCardHeader}>
            <View style={[styles.peopleIconBubble, { backgroundColor: colors.warningSoft }]}>
              <FontAwesome name="clock-o" size={14} color="#B45309" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.peopleCardTitle}>{peoplePendingSectionTitle()}</Text>
              <Text style={styles.peopleCardSub}>
                {circleNotStarted
                  ? `${waitlist.length} waiting for review`
                  : 'Structure locked — cannot approve after start'}
              </Text>
            </View>
            <View style={styles.peopleCountPill}>
              <Text style={styles.peopleCountPillText}>{waitlist.length}</Text>
            </View>
          </View>
          {waitlist.map((m) => (
            <View key={m.id} style={styles.setupListRow}>
              <View style={styles.initialsAvatar}>
                <Text style={styles.initialsText}>
                  {initialsForDisplay(memberName(m))}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.setupListTitle}>
                  {m.displayLabel || memberName(m)}
                </Text>
                <Text style={styles.setupListSub}>
                  {m.isAdditionalHand ||
                  Number(m.handNumber ?? m.hand_number ?? 1) > 1
                    ? `Extra hand · Hand ${m.handNumber ?? m.hand_number ?? 1}`
                    : m.phone || 'Join request'}
                </Text>
              </View>
              {circleNotStarted ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    style={styles.setupGhostBtn}
                    onPress={() => handleDecline(m)}
                    disabled={structureMutationBusy}
                    accessibilityRole="button"
                    accessibilityLabel={`Decline ${memberName(m)}`}
                  >
                    <Text style={[styles.setupGhostBtnText, { color: colors.text }]}>
                      Decline
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.setupApproveBtn}
                    onPress={() => handleApprove(m.requestId)}
                    disabled={structureMutationBusy}
                    accessibilityRole="button"
                    accessibilityLabel={`Approve ${memberName(m)}`}
                  >
                    {approvingId === m.requestId ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.setupApproveBtnText}>Approve</Text>
                    )}
                  </Pressable>
                </View>
              ) : (
                <StatusBadge label="Locked" tone="muted" />
              )}
            </View>
          ))}
        </View>
      ) : null}

      {!isOrganizer && showPendingAdditionalHand ? (
        <View style={styles.peopleCard}>
          <View style={styles.validationNotice}>
            <Text style={styles.validationTitle}>Additional hand pending</Text>
            <Text style={styles.validationText}>
              Hand {pendingAdditionalHandNumber} is waiting for organizer approval.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Members / hands */}
      <View style={styles.peopleCard}>
        <View style={styles.peopleCardHeader}>
          <View style={[styles.peopleIconBubble, { backgroundColor: colors.primarySoft }]}>
            <FontAwesome name="users" size={14} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.peopleCardTitle}>{peopleHandsSectionTitle()}</Text>
            <Text style={styles.peopleCardSub}>
              {formatHandsPeopleMetrics({
                handCount: circle.handCount ?? members.length,
                uniqueMemberCount: circle.uniqueMemberCount,
                fallbackHandCount: members.length,
              })}
              {circleNotStarted ? ' · Planned' : ' · Live'}
            </Text>
          </View>
        </View>
        {circleNotStarted ? (
          <Text style={[styles.peopleCardSub, { marginBottom: 8 }]}>
            Planned hands become live contribution positions after start.
          </Text>
        ) : null}
        {!hasSchedule ? (
          <Text style={[styles.peopleCardSub, { marginBottom: 8 }]}>
            Payout order is not available yet.
          </Text>
        ) : null}

        <View style={styles.compactMemberList}>
          {memberGroups.map((group, groupIndex) => (
            <ExpandableMemberTile
              key={group.key}
              groupKey={group.key}
              hands={group.hands as BackendCircleMember[]}
              connectedUserId={group.connectedUserId}
              expanded={expandedMemberKey === group.key}
              isLast={groupIndex === memberGroups.length - 1}
              organizerId={circle.organizerId}
              turnOrder={circle.turnOrder ?? []}
              payoutOrderRows={payoutOrderRows}
              canReorder={false}
              canShareClaim={(hand) =>
                isOrganizer &&
                circleNotStarted &&
                isUnclaimedHand(hand) &&
                Boolean(token)
              }
              sharingClaimId={sharingClaimId}
              reorderingId={null}
              metaExtra={hasSchedule ? ' · See Round for dues' : ''}
              onToggle={() => toggleMemberExpanded(group.key)}
              onShareClaim={(hand) => void handleShareClaimInvite(hand)}
              onReorder={() => {}}
            />
          ))}
        </View>
      </View>

      {canAddHand ? (
        <>
          <Modal
            visible={showHandModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowHandModal(false)}
          >
            <View style={styles.setupModalOverlay}>
              <View style={styles.setupModalSheet}>
                <View style={{ alignItems: 'center', marginBottom: 8 }}>
                  <View
                    style={[
                      styles.peopleIconBubble,
                      {
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        marginBottom: 12,
                      },
                    ]}
                  >
                    <FontAwesome name="hand-o-up" size={24} color={colors.primary} />
                  </View>
                  <Text style={styles.setupModalTitle}>Add another hand</Text>
                </View>
                <Text style={styles.setupModalBody}>
                  Each hand is a separate contribution and payout slot (max 3). The
                  organizer must approve Hand 2 / Hand 3 requests.
                </Text>
                <Pressable
                  style={styles.setupPrimaryBtn}
                  onPress={handleAddHand}
                  disabled={addingHand}
                  accessibilityRole="button"
                >
                  {addingHand ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.setupPrimaryBtnText}>
                      Request another hand
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.setupModalCancel}
                  onPress={() => setShowHandModal(false)}
                >
                  <Text style={styles.setupModalCancelText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
          <Pressable
            style={[
              styles.peopleDashedBtn,
              structureMutationBusy && { opacity: 0.5 },
            ]}
            onPress={() => setShowHandModal(true)}
            disabled={structureMutationBusy}
            accessibilityRole="button"
            accessibilityLabel="Request an additional hand in this circle"
          >
            <FontAwesome name="plus" size={14} color={colors.primary} />
            <Text style={styles.peopleDashedBtnText}>Add another hand</Text>
          </Pressable>
        </>
      ) : null}

      {showSetupOrganizerActions ? (
        <View style={[styles.peopleCard, styles.peopleStartCard]}>
          <Text style={styles.peopleCardTitle}>Start circle</Text>
          {startBlockReason ? (
            <Text style={[styles.peopleCardSub, { marginBottom: 12 }]}>
              {startBlockReason}
            </Text>
          ) : (
            <Text style={[styles.peopleCardSub, { marginBottom: 12 }]}>
              Starting locks membership, hands, and payout order
              {needsUnclaimedConfirm ? '. You will confirm unclaimed hands first.' : '.'}
            </Text>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.setupPrimaryBtn,
              (pressed || structureMutationBusy) && { opacity: 0.88 },
              structureMutationBusy && { opacity: 0.65 },
            ]}
            onPress={promptStartCircle}
            disabled={structureMutationBusy}
            accessibilityRole="button"
            accessibilityLabel="Start circle"
            accessibilityState={{ busy: startingCircle, disabled: structureMutationBusy }}
          >
            {startingCircle ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <FontAwesome name="play" size={14} color="#ffffff" />
                <Text style={styles.setupPrimaryBtnText}>Start Circle</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Expand/collapse member row. Details unmount completely when collapsed so no
 * empty “skeleton” panel remains (border/height residue from open styles).
 */
function ExpandableMemberTile({
  groupKey,
  hands,
  connectedUserId,
  expanded,
  isLast,
  organizerId,
  turnOrder,
  payoutOrderRows,
  canReorder,
  canShareClaim,
  sharingClaimId,
  reorderingId,
  metaExtra,
  onToggle,
  onShareClaim,
  onReorder,
}: {
  groupKey: string;
  hands: BackendCircleMember[];
  connectedUserId: string | null;
  expanded: boolean;
  isLast: boolean;
  organizerId: string;
  turnOrder: string[];
  payoutOrderRows: Array<{ id: string }>;
  canReorder: boolean;
  canShareClaim: (hand: BackendCircleMember) => boolean;
  sharingClaimId: string | null;
  reorderingId: string | null;
  metaExtra: string | null;
  onToggle: () => void;
  onShareClaim: (hand: BackendCircleMember) => void;
  onReorder: (handId: string, move: 'up' | 'down') => void;
}) {
  const first = hands[0];
  if (!first) {
    return null;
  }
  const organizer = hands.some((hand) => hand.id === organizerId);
  const connected = Boolean(connectedUserId);
  const display = memberName(first);
  const showDetails = expanded && hands.length > 0;

  return (
    <View
      collapsable={false}
      style={[
        styles.peopleMemberTile,
        showDetails ? styles.peopleMemberTileOpen : styles.peopleMemberTileClosed,
        isLast && { marginBottom: 0 },
      ]}
    >
      <Pressable
        style={styles.compactMemberMain}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetails }}
        accessibilityLabel={`${showDetails ? 'Collapse' : 'Expand'} details for ${display}`}
      >
        <View style={styles.initialsAvatar}>
          <Text style={styles.initialsText}>{initialsForDisplay(display)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.peopleNameRow}>
            <Text style={styles.personName} numberOfLines={1}>
              {display}
            </Text>
            {organizer ? (
              <View style={styles.peopleRolePill}>
                <Text style={styles.peopleRolePillText}>Org</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.compactMemberMeta}>
            {hands.length} hand{hands.length === 1 ? '' : 's'}
            {metaExtra || ''}
          </Text>
        </View>
        <View
          style={[
            styles.peopleAccessPill,
            connected ? styles.peopleAccessPillOn : styles.peopleAccessPillOff,
          ]}
        >
          <Text
            style={[
              styles.peopleAccessPillText,
              connected
                ? styles.peopleAccessPillTextOn
                : styles.peopleAccessPillTextOff,
            ]}
          >
            {connected ? 'Connected' : 'Unclaimed'}
          </Text>
        </View>
        <FontAwesome
          name={showDetails ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={colors.subtle}
          style={{ marginLeft: 8 }}
        />
      </Pressable>

      {showDetails ? (
        <View
          key={`${groupKey}-details`}
          style={styles.handDetailList}
          collapsable={false}
        >
          {hands.map((hand, handIndex) => {
            const orderIndex = turnOrder.indexOf(hand.id);
            const payoutRowIndex = payoutOrderRows.findIndex(
              (row) => row.id === hand.id,
            );
            const share = canShareClaim(hand);
            const handKey = `${groupKey}:${hand.id || 'hand'}:${handIndex}`;
            return (
              <View key={handKey} style={styles.handDetailRow}>
                <View
                  style={[
                    styles.setupAvatar,
                    {
                      backgroundColor:
                        orderIndex >= 0
                          ? colors.primarySoft
                          : colors.warningSoft,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '900',
                      color: orderIndex >= 0 ? colors.primary : '#B45309',
                    }}
                  >
                    {orderIndex >= 0 ? orderIndex + 1 : '—'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.handDetailTitle}>
                    {hand.handLabel ||
                      `Hand ${hand.handNumber ?? hand.hand_number ?? handIndex + 1}`}
                  </Text>
                  <Text style={styles.handDetailMeta}>
                    {handClaimStatusLabel(hand)}
                    {orderIndex >= 0
                      ? ` · Position ${orderIndex + 1}`
                      : ' · Not in order'}
                  </Text>
                </View>
                {share ? (
                  <Pressable
                    style={styles.handClaimBtn}
                    onPress={() => onShareClaim(hand)}
                    disabled={sharingClaimId === hand.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Share claim invite for ${memberName(hand)}`}
                  >
                    {sharingClaimId === hand.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.handClaimAction}>Claim</Text>
                    )}
                  </Pressable>
                ) : null}
                {canReorder && payoutRowIndex >= 0 ? (
                  <View style={styles.reorderControls}>
                    <Pressable
                      onPress={() => onReorder(hand.id, 'up')}
                      disabled={Boolean(reorderingId) || payoutRowIndex === 0}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${memberName(hand)} up`}
                      style={{
                        opacity: payoutRowIndex === 0 ? 0.25 : 1,
                        padding: 6,
                      }}
                    >
                      <FontAwesome
                        name="chevron-up"
                        size={13}
                        color={colors.primary}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => onReorder(hand.id, 'down')}
                      disabled={
                        Boolean(reorderingId) ||
                        payoutRowIndex === payoutOrderRows.length - 1
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${memberName(hand)} down`}
                      style={{
                        opacity:
                          payoutRowIndex === payoutOrderRows.length - 1
                            ? 0.25
                            : 1,
                        padding: 6,
                      }}
                    >
                      <FontAwesome
                        name="chevron-down"
                        size={13}
                        color={colors.primary}
                      />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
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
    viewerRole === 'none'
      ? 'No active membership'
      : 'Access unavailable';

  return (
    <View style={styles.blockedCard}>
      <FontAwesome name="lock" size={34} color={colors.warning} />
      <Text style={styles.blockedTitle}>{label}</Text>
      <Text style={styles.blockedText}>
        You do not have access to {circleName} with this account.
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

function setupStatusTone(status: SetupStepStatus): {
  bg: string;
  fg: string;
} {
  switch (status) {
    case 'complete':
      return { bg: colors.successSoft, fg: '#047857' };
    case 'action_required':
      return { bg: '#FFEDD5', fg: '#C2410C' };
    case 'waiting':
      return { bg: '#DBEAFE', fg: '#1D4ED8' };
    case 'blocked':
      return { bg: '#F1F5F9', fg: '#64748B' };
    default:
      return { bg: '#F1F5F9', fg: '#64748B' };
  }
}

function SetupStatusBadge({
  status,
  compact,
}: {
  status: SetupStepStatus;
  compact?: boolean;
}) {
  const tone = setupStatusTone(status);
  const label = compact
    ? status === 'action_required'
      ? 'Action'
      : status === 'waiting'
        ? 'Waiting'
        : status === 'complete'
          ? 'Done'
          : 'Blocked'
    : setupStepStatusLabel(status);
  return (
    <View
      style={{
        backgroundColor: tone.bg,
        borderRadius: 999,
        paddingHorizontal: compact ? 8 : 10,
        paddingVertical: compact ? 3 : 4,
      }}
    >
      <Text style={{ fontSize: compact ? 10 : 11, fontWeight: '800', color: tone.fg }}>
        {label}
      </Text>
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
  if (!contributions || !memberId || roundNumber == null) {
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
  if (!wallet || !memberId || roundNumber == null) {
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
  if (!memberId || roundNumber == null) {
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

function memberName(member: BackendCircleMember | BackendJoinRequest | undefined) {
  return member?.displayLabel || member?.full_name || member?.name || 'Unknown member';
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

function formatRelativeDays(value?: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  
  const diffTime = time - Date.now();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays > 0) return `(in ${diffDays} day${diffDays === 1 ? '' : 's'})`;
  if (diffDays === 0) return '(today)';
  if (diffDays === -1) return '(yesterday)';
  return `(${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ago)`;
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
  peopleSectionStack: {
    gap: 12,
  },
  peopleHero: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    ...shadows.small,
  },
  peopleHeroTitle: {
    color: colors.textStrong,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  peopleHeroSub: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  peopleCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    ...shadows.small,
  },
  peopleStartCard: {
    borderColor: colors.primaryBorder,
    backgroundColor: '#FBF9FF',
  },
  peopleCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  peopleCardTitle: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: '900',
  },
  peopleCardSub: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  peopleIconBubble: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  peopleCountPill: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 999,
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  peopleCountPillText: {
    color: colors.textStrong,
    fontSize: 12,
    fontWeight: '900',
  },
  peopleMemberTile: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    // Keep border width constant so open/close never leaves residual height.
    paddingHorizontal: 10,
  },
  peopleMemberTileClosed: {
    backgroundColor: colors.card,
    borderColor: 'transparent',
  },
  peopleMemberTileOpen: {
    backgroundColor: colors.background,
    borderColor: colors.primaryBorder,
  },
  // When collapsed, never reserve space for details (no minHeight on tile).
  peopleNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  peopleRolePill: {
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  peopleRolePillText: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: '800',
  },
  peopleAccessPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  peopleAccessPillOn: {
    backgroundColor: colors.successSoft,
  },
  peopleAccessPillOff: {
    backgroundColor: colors.warningSoft,
  },
  peopleAccessPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  peopleAccessPillTextOn: {
    color: '#047857',
  },
  peopleAccessPillTextOff: {
    color: '#B45309',
  },
  peopleDashedBtn: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
  },
  peopleDashedBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  reorderControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    marginLeft: 4,
  },
  handClaimBtn: {
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  setupHeaderSummary: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 14,
    padding: 16,
  },
  compactMemberList: {
    marginTop: 4,
  },
  compactMemberRow: {
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
  },
  compactMemberMain: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 64,
    paddingVertical: 10,
  },
  initialsAvatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  initialsText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
  compactMemberMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  compactContribution: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
  handDetailList: {
    borderTopColor: colors.cardBorder,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
    paddingLeft: 4,
    paddingRight: 4,
  },
  handDetailRow: {
    alignItems: 'center',
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    paddingVertical: 10,
  },
  handDetailTitle: {
    color: colors.textStrong,
    fontSize: 13,
    fontWeight: '800',
  },
  handDetailMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
  handClaimAction: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  validationNotice: {
    backgroundColor: colors.warningSoft,
    borderColor: '#FDE68A',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  validationTitle: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '900',
  },
  validationText: {
    color: '#A16207',
    fontSize: 12,
    marginTop: 4,
  },
  payoutReviewList: {
    backgroundColor: colors.background,
    borderRadius: 16,
    overflow: 'hidden',
  },
  payoutReviewRow: {
    alignItems: 'center',
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 54,
    paddingHorizontal: 14,
  },
  payoutReviewPosition: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    marginRight: 12,
    width: 30,
  },
  payoutReviewPositionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  payoutReviewName: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  unclaimedReviewList: {
    backgroundColor: colors.background,
    borderRadius: 16,
    overflow: 'hidden',
  },
  unclaimedReviewRow: {
    alignItems: 'center',
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
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
  inlineErrorBanner: {
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B55',
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inlineErrorText: {
    color: '#92400E',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  inlineErrorRetry: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
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
  roundDetailsHeader: {
    alignItems: 'center',
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  roundDetailsTitle: {
    color: colors.textStrong,
    fontSize: 17,
    fontWeight: '900',
  },
  roundDetailsSummary: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 4,
  },
  roundDetailsStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  roundDetailsStatusReleased: {
    backgroundColor: colors.successSoft,
  },
  roundDetailsStatusReady: {
    backgroundColor: colors.warningSoft,
  },
  roundDetailsStatusPending: {
    backgroundColor: '#F3F4F6',
  },
  roundDetailsStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  roundDetailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  roundDetailIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    marginRight: 12,
    width: 32,
  },
  roundDetailLabel: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    paddingRight: 8,
  },
  roundDetailValue: {
    color: colors.muted,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    maxWidth: '48%',
    textAlign: 'right',
  },
  roundDetailDivider: {
    backgroundColor: '#F3F4F6',
    height: 1,
    marginLeft: 60,
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

  /* ── Setup People (fintech single surface) ─────────────────── */
  setupShell: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 4,
  },
  setupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  setupEyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  setupTitle: {
    color: colors.textStrong,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  setupSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  setupStepTitle: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '800',
  },
  setupStepReason: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  setupBody: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    gap: 12,
  },
  setupCodeBlock: {
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 14,
    width: '100%',
  },
  setupCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  setupCodeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
  },
  setupIconBtn: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  setupMicroLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  setupCodeValue: {
    color: colors.primary,
    flex: 1,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    // Show full code; wrap if needed rather than truncating.
    minWidth: 0,
  },
  setupGhostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  setupGhostBtnText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  setupPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  setupPrimaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  setupApproveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  setupApproveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  setupList: {
    gap: 0,
  },
  setupListHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  setupListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  setupListTitle: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '800',
  },
  setupListSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  setupEmpty: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  setupAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  setupMetricCell: {
    width: '30%',
    flexGrow: 1,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'flex-start',
  },
  setupMetricValue: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: '900',
  },
  setupMetricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  setupNotice: {
    color: '#92400E',
    fontSize: 12,
    lineHeight: 17,
    backgroundColor: colors.warningSoft,
    borderRadius: 10,
    padding: 10,
    overflow: 'hidden',
  },
  setupModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  setupModalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 14,
  },
  setupModalTitle: {
    color: colors.textStrong,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  setupModalBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  setupModalCancel: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  setupModalCancelText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },
});
