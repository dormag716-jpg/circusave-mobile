import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useRef, type ComponentProps } from 'react';
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
  type BackendWalletSnapshot,
  requestPositionSwap,
  getMemberAccessToken,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import {
  circleInviteHref,
  circlePaymentSetupHref,
  contributionHref,
  myCirclesHref,
} from '@/lib/navigation';
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
        !scheduleData && secondaryLoading ? (
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
        ) : scheduleData ? (
          <>
            {secondaryLoading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.inlineLoadingText}>Syncing backend data…</Text>
              </View>
            ) : null}
            {secondaryError ? (
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
        />
      ) : null}

      {activeTab === 'records' ? <RecordsTab entries={ledgerEntries} circleId={circle.id} members={circle.members || []} isPremium={isPremium} /> : null}
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

  // All display values arrive pre-normalized from WorkspaceContent.
  const expectedContributionsCount = totalMembers;
  const visibleTotalRounds = totalRoundsCount;

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
      ) : recipient ? (
        <View style={[styles.sectionCard, { marginTop: 0, marginBottom: 16, borderColor: '#6366f1', backgroundColor: '#6366f110' }]}>
          <Text style={[styles.sectionTitle, { color: '#6366f1' }]}>
            🎁 {memberName(recipient)} receives the payout
          </Text>
          <Text style={styles.sectionSubtitle}>
            {memberName(recipient)} will receive {formatOptionalMoney(payoutAmount)} once all contributions are collected.
          </Text>
        </View>
      ) : null}

      <View style={[styles.heroCard, { backgroundColor: '#6231d6', padding: 24, borderRadius: 20 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', width: 50, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{currentRoundNumber}</Text>
            </View>
            <View>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Round {currentRoundNumber} of {visibleTotalRounds}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>Collecting contributions</Text>
            </View>
          </View>
          <View style={{ backgroundColor: '#8a6234', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <FontAwesome name="clock-o" size={14} color="#fef08a" />
            <Text style={{ color: '#fef08a', fontSize: 13, fontWeight: '600' }}>Not ready yet</Text>
          </View>
        </View>

        {recipient ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 28 }}>
            <Image 
              source={{ uri: `https://i.pravatar.cc/150?u=${recipient.id}` }} 
              style={{ width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: '#fff' }} 
            />
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' }}>Payout recipient</Text>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 2 }}>{memberName(recipient)}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', marginTop: 4 }}>Will receive</Text>
              <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', marginTop: -2 }}>{formatOptionalMoney(payoutAmount)}</Text>
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: 24 }}>
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Progress</Text>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
              {visibleConfirmedCount} of {expectedContributionsCount} confirmed
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 5, overflow: 'hidden' }}>
              <View style={{ width: `${Math.max(0, Math.min(100, visibleProgress || 0))}%`, height: '100%', backgroundColor: '#22c55e', borderRadius: 5 }} />
            </View>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{Math.round(visibleProgress || 0)}%</Text>
          </View>
        </View>
      </View>


      {/* Members only: report own payment. Organizers manage everyone below. */}
      {!canReviewContributions && viewerMember ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>My contribution</Text>
          <Text style={styles.sectionSubtitle}>
            Report your own payment for this round. Only you can use this action.
          </Text>
          <Text style={[styles.sectionSubtitle, { marginTop: 8 }]}>
            {memberCanSubmitContribution
              ? `Your ${formatMoney(circle.contributionAmount)} contribution is due.`
              : viewerContributionStatus.raw === 'confirmed'
                ? 'Your contribution for this round is confirmed.'
                : viewerContributionStatus.raw === 'submitted' ||
                    viewerContributionStatus.raw === 'late'
                  ? 'Your payment is waiting for the organizer to confirm.'
                  : `Status: ${viewerContributionStatus.label}`}
          </Text>
          
          {memberCanSubmitContribution ? (
            <View style={styles.paymentInstructions}>
              <FontAwesome name="send" size={14} color={colors.primary} style={{ marginBottom: 6 }} />
              <Text style={styles.paymentInstructionsTitle}>Where to send your payment</Text>
              <Text style={styles.paymentInstructionsText}>
                {paymentInstructions ?? 'Contact the organizer for payment details.'}
              </Text>
            </View>
          ) : null}

          {viewerContributionStatus.raw === 'submitted' ||
          viewerContributionStatus.raw === 'late' ? (
            <View style={styles.pendingConfirmationCard}>
              <FontAwesome name="clock-o" size={20} color={colors.warning} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.pendingConfirmationTitle}>Payment reported!</Text>
                <Text style={styles.pendingConfirmationText}>
                  Waiting for the organizer to confirm receipt. You're all set for now.
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

      {viewerPayoutPosition && !canReviewContributions ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Your turn</Text>
          <Text style={styles.sectionSubtitle}>
            Your payout position: #{viewerPayoutPosition} • You receive on Round {viewerPayoutPosition}
          </Text>
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
                <Image 
                  source={{ uri: `https://i.pravatar.cc/150?u=${member.id}` }} 
                  style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} 
                />
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

      <View style={[styles.sectionCard, { padding: 0, overflow: 'hidden', backgroundColor: '#fff', borderRadius: 20 }]}>
        <View style={{ padding: 16, paddingBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>Round details</Text>
        </View>

        <View style={{ paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3e8ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <FontAwesome name="dollar" size={14} color="#7c3aed" />
            </View>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' }}>Contribution</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'right' }}>
              <Text style={{ fontWeight: '900', color: '#111827' }}>{formatMoney(circle.contributionAmount)}</Text>{' '}per member
            </Text>
          </View>

          <View style={{ height: 1, backgroundColor: '#f3f4f6', marginLeft: 60 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3e8ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <FontAwesome name="calendar" size={14} color="#7c3aed" />
            </View>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' }}>Due date</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'right' }}>
              <Text style={{ fontWeight: '900', color: '#111827' }}>{formatDate(dueDate) || 'Unknown'}</Text>
              {dueDate ? ` ${formatRelativeDays(dueDate)}` : ''}
            </Text>
          </View>

          <View style={{ height: 1, backgroundColor: '#f3f4f6', marginLeft: 60 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3e8ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <FontAwesome name="users" size={14} color="#7c3aed" />
            </View>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' }}>Expected contributions</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'right' }}>
              <Text style={{ fontWeight: '900', color: '#111827' }}>{typeof expectedContributionsCount === 'number' && expectedContributionsCount > 0 ? expectedContributionsCount : 'Unknown'} members</Text>
            </Text>
          </View>

          <View style={{ height: 1, backgroundColor: '#f3f4f6', marginLeft: 60 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3e8ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <FontAwesome name="shield" size={14} color="#7c3aed" />
            </View>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' }}>Payout readiness</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'right' }}>
              <Text style={{ fontWeight: '900', color: payoutReleased ? '#166534' : displayPayoutReady ? '#d97706' : '#d97706' }}>
                {payoutReleased ? 'Released' : displayPayoutReady ? 'Ready' : 'Not ready'}
              </Text>
              {' '}({visibleConfirmedCount} of {expectedContributionsCount} confirmed)
            </Text>
          </View>
        </View>
      </View>
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
  currentRoundNumber,
}: {
  circle: BackendCircleDetail;
  hasSchedule: boolean;
  isOrganizer: boolean;
  members: BackendCircleMember[];
  recipientId?: string | null;
  userId: string;
  currentRoundNumber: number;
}) {
  const [showAll, setShowAll] = useState(false);
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
                    {hasSchedule && (index + 1) < currentRoundNumber ? (
                      <StatusBadge label="Paid" tone="success" />
                    ) : null}
                    {hasSchedule && (index + 1) === currentRoundNumber ? (
                      <StatusBadge label="Current round" tone="warning" />
                    ) : null}
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

function RecordsTab({ entries, circleId, members, isPremium }: { entries: BackendLedgerEntry[], circleId: string, members: BackendCircleMember[], isPremium: boolean }) {
  const visibleEntries = isPremium ? entries : entries.slice(0, 10);
  const hasMore = !isPremium && entries.length > 10;

  return (
    <View style={styles.section}>
      <View style={[styles.sectionCard, { padding: 0, overflow: 'hidden', backgroundColor: '#fff', borderRadius: 20 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
          <View style={{ backgroundColor: '#f3e8ff', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
            <FontAwesome name="line-chart" size={20} color="#7c3aed" />
          </View>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>Activity</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 2 }}>
              {entries.length} recorded action{entries.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        {entries.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <FontAwesome name="book" size={32} color="#d1d5db" />
            <Text style={{ marginTop: 12, fontSize: 16, color: '#6b7280', fontWeight: '600' }}>No activity yet.</Text>
          </View>
        ) : (
          <View>
            {visibleEntries.map((entry, index) => {
              const bg = `${ledgerIconColor(entry)}15`;
              return (
                <View key={entry.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: bg, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                      <FontAwesome name={ledgerIcon(entry)} size={16} color={ledgerIconColor(entry)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>{ledgerTitle(entry)}</Text>
                      <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                        {entryMemberName(entry, members)}
                        {entryMemberName(entry, members) ? ' · ' : ''}
                        Round {entry.round || '—'} · {formatRelativeDays(entry.created_at || entry.at)}
                      </Text>
                    </View>
                    {typeof entry.amount === 'number' ? (
                      <Text style={{ fontSize: 15, fontWeight: '800', color: ledgerIconColor(entry) }}>
                        {ledgerAmountLabel(entry)}
                      </Text>
                    ) : null}
                  </View>
                  {index < visibleEntries.length - 1 ? (
                    <View style={{ height: 1, backgroundColor: '#f3f4f6', marginLeft: 68 }} />
                  ) : null}
                </View>
              );
            })}

            {hasMore ? (
              <View style={{ padding: 16, backgroundColor: '#f9fafb', borderTopWidth: 1, borderTopColor: '#f3f4f6', alignItems: 'center' }}>
                <FontAwesome name="lock" size={24} color="#6b37cf" style={{ marginBottom: 8 }} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827', textAlign: 'center' }}>Unlock Full History</Text>
                <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 4, marginBottom: 12 }}>
                  You have {entries.length - 10} more activities hidden. Upgrade to Premium to view your entire circle's history.
                </Text>
                <Pressable
                  style={{ backgroundColor: '#6b37cf', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, width: '100%', alignItems: 'center' }}
                  onPress={() => router.push('/subscription')}
                >
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Upgrade to Premium</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                onPress={() => Alert.alert('Export not available yet', 'Full history export will be available when the backend endpoint is connected.')}
              >
                <FontAwesome name="download" size={14} color="#6b37cf" style={{ marginRight: 8 }} />
                <Text style={{ color: '#6b37cf', fontSize: 15, fontWeight: '800' }}>Export Full History</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
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

