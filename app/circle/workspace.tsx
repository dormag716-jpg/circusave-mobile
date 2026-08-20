import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, type Href, useLocalSearchParams } from 'expo-router';
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
  Keyboard,
  Linking,
  Modal,
  Platform,
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
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

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
  ApiError,
  type BackendCircleDetail,
  type BackendCircleMember,
  type BackendJoinRequest,
  type BackendLedgerEntry,
  type BackendRoundContribution,
  type BackendRoundSnapshot,
  type BackendScheduleRound,
  type BackendWalletSnapshot,
  getCircleAgreementSnapshot,
  getMemberAccessToken,
  reorderPayoutTurn,
  requestAdditionalHand,
  startCircle,
  type CircleAgreementSnapshot,
} from '@/lib/api';
import { logClientError } from '@/lib/errorLogging';
import {
  getMemberAgreementPrompt,
  memberCanOpenAgreementReview,
  shouldShowMemberAgreementBanner,
  type MemberAgreementPrompt,
} from '@/lib/circleAgreements';
import { PaymentDestinationList } from '@/components/PaymentDestinationList';
import { RecordsStatementCenter } from '@/components/records/RecordsStatementCenter';

import { shouldLoadAuthenticatedScreen } from '@/lib/activityAuthGate';
import { shouldFetchWorkspaceAgreementSnapshot } from '@/lib/workspaceAgreementLoad';
import { useAuthSession } from '@/lib/authContext';
import {
  evictCircleWorkspaceCache,
  readCircleWorkspacePresentation,
  seedCircleWorkspaceCache,
} from '@/lib/circleWorkspaceCache';
import { invalidateCachedGets } from '@/lib/httpGetCache';
import { createRequestGeneration } from '@/lib/requestGeneration';
import {
  isWorkspaceChromeCollapsed,
  workspaceChromeLayoutStyle,
} from '@/lib/workspaceKeyboardChrome';
import { useEntitlements } from '@/lib/entitlementsContext';
import {
  additionalHandConsentHref,
  circleAgreementReviewHref,
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
  isCircleNotStarted,
  isUnclaimedHand,
  roundClosedSubtitle,
  roundClosedTitle,
  roundPausedSubtitle,
  roundPausedTitle,
} from '@/lib/circleLifecycleCopy';
import {
  buildCircleSetupProgress,
  hasContributionPaymentInstructions,
  orderedParticipatingHands,
  splitWaitlistRequests,
  type SetupStepStatus,
} from '@/lib/circleSetupProgress';
import {
  buildPayoutOrderReviewLines,
  buildStartCircleConfirmations,
  canShowBackendGatedAction,
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
import ConversationChat from '@/components/ConversationChat';
import { Avatar } from '@/components/Avatar';
import { DecisionSheet } from '@/components/DecisionSheet';
import {
  groupCurrentApiHandsForDisplay,
  initialsForDisplay,
  validateCurrentPayoutOrder,
} from '@/lib/peopleWorkspace';
import { useConversationUnreadCount } from '@/lib/useConversations';
import { contributionCopy } from '@/lib/i18n/contributionCopy';
import {
  buildManualContributionSubmitPayload,
  claimedPaymentMethodLabelKey,
  MAX_PAYMENT_REFERENCE_LENGTH,
} from '@/lib/contributionClaim';
import {
  contributionStatusLabel,
  presentManualContribution,
  roundStatusLabel,
} from '@/lib/i18n/financial-presentation';
import {
  buildMemberContributionCardModel,
  collectViewerParticipatingHands,
  formatContributionReportedAt,
  type MemberContributionCardModel,
} from '@/lib/memberContributionCard';
import {
  canStartMarkAsSentSubmit,
  isAlreadyReportedSubmissionError,
  resolveMarkAsSentContributionHrefHandId,
  resolveMarkAsSentTarget,
} from '@/lib/markContributionSent';
import {
  ORGANIZER_REJECT_REASON_CODES,
  buildOrganizerReviewRowModel,
  organizerRejectReasonLabel,
  organizerRejectReasonPayload,
  presentRejectReasonForMember,
  shouldShowOrganizerHandLabel,
  type OrganizerRejectReasonCode,
} from '@/lib/organizerContributionReview';
import {
  formatCurrency,
  formatDateTime as formatLocalizedDate,
  formatOrdinal,
  formatPercentage,
  formatRelativeDate,
} from '@/lib/i18n/formatters';

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
}[] = [
  { id: 'round', icon: 'compass' },
  { id: 'chat', icon: 'comments' },
  { id: 'people', icon: 'users' },
  { id: 'records', icon: 'list-alt' },
];

export default function CircleWorkspaceScreen() {
  const { t } = useTranslation('circleWorkspace');
  const { session, status } = useAuthSession();
  const params = useLocalSearchParams<{
    circleId?: string | string[];
    tab?: string | string[];
    conversationId?: string | string[];
  }>();
  const circleId = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const conversationIdParam = Array.isArray(params.conversationId)
    ? params.conversationId[0]
    : params.conversationId;
  const initialTab = (tabParam as ActiveTab) || 'round';
  const token = session?.session.token;
  // Premium UI flags come from entitlements, never users.role.
  // Core payout release is free for all organizers with backend permission.

  const warmPresentation = circleId
    ? readCircleWorkspacePresentation(circleId)
    : null;
  const [circle, setCircle] = useState<BackendCircleDetail | null>(
    warmPresentation?.detail ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(!warmPresentation?.detail);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [resolvedRound, setResolvedRound] = useState<number | null>(null);
  const [workspaceKeyboardVisible, setWorkspaceKeyboardVisible] =
    useState(false);
  const workspaceGeneration = useRef(createRequestGeneration());
  const hasLastKnownCircleRef = useRef(Boolean(warmPresentation?.detail));

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      setWorkspaceKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setWorkspaceKeyboardVisible(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  async function loadWorkspace(options?: { silent?: boolean; revalidate?: boolean }) {
    const generation = workspaceGeneration.current.next();
    const accessToken = String(token ?? '').trim();
    // Logout / unauthenticated: quiet no-op (do not console.error or generic error).
    if (!shouldLoadAuthenticatedScreen({ status, token: accessToken })) {
      if (workspaceGeneration.current.isCurrent(generation)) {
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }
    if (!circleId) {
      // Authenticated but missing route id - real navigation problem.
      if (workspaceGeneration.current.isCurrent(generation)) {
        setError(t('status.genericError'));
        setLoading(false);
      }
      return;
    }

    if (!options?.silent && !hasLastKnownCircleRef.current) {
      setLoading(true);
    }
    if (workspaceGeneration.current.isCurrent(generation)) {
      setError(null);
    }

    try {
      const nextCircle = await getCircleDetail(
        accessToken,
        circleId,
        options?.revalidate ? { revalidate: true } : undefined,
      );
      if (!workspaceGeneration.current.isCurrent(generation)) {
        return;
      }
      hasLastKnownCircleRef.current = true;
      setAccessDenied(false);
      setCircle(nextCircle);
      seedCircleWorkspaceCache({ circleId, detail: nextCircle });
    } catch (loadError) {
      if (!workspaceGeneration.current.isCurrent(generation)) {
        return;
      }
      if (loadError instanceof ApiError && loadError.status === 403) {
        invalidateCachedGets();
        evictCircleWorkspaceCache(circleId);
        setAccessDenied(true);
        setError(null);
        setLoading(false);
        return;
      }
      logClientError('Unable to load circle workspace', loadError, { circleId });
      setError(t('status.genericError'));
    } finally {
      if (
        !options?.silent &&
        workspaceGeneration.current.isCurrent(generation)
      ) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    workspaceGeneration.current.next();
    const warm = circleId
      ? readCircleWorkspacePresentation(circleId)
      : null;
    if (warm?.detail) {
      hasLastKnownCircleRef.current = true;
      setCircle(warm.detail);
      setLoading(false);
    } else {
      hasLastKnownCircleRef.current = false;
      setCircle(null);
      setLoading(true);
    }
    setResolvedRound(null);
    setAccessDenied(false);
    setError(null);
  }, [circleId]);

  useEffect(() => {
    void loadWorkspace();
  }, [circleId, token, status]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadWorkspace({ silent: true, revalidate: true });
      setRefreshNonce((n) => n + 1);
    } finally {
      setRefreshing(false);
    }
  };

  const displayRound = resolvedRound ?? circle?.currentRound;

  const workspaceHeader = (
    <View style={styles.header}>
      <Pressable
        onPress={() => router.replace(myCirclesHref)}
        hitSlop={20}
        accessibilityRole="button"
        accessibilityLabel={t('accessibility.backToCircles')}
      >
        <FontAwesome name="chevron-left" size={28} color={colors.textStrong} />
      </Pressable>

      <View style={styles.headerCenter}>
        <Text style={styles.title}>{circle?.name || t('fallbackName')}</Text>
        <Text style={styles.subtitle}>
          {circle
            ? t('headerSummary', {
                round: displayRound ?? circle.currentRound,
                frequency: localizedFrequency(t, circle.frequency),
              })
            : t('loading')}
        </Text>
      </View>

      <Pressable
        onPress={() => router.replace('/(tabs)/dashboard')}
        hitSlop={20}
        accessibilityRole="button"
        accessibilityLabel={t('accessibility.dashboard')}
      >
        <FontAwesome name="home" size={28} color={colors.textStrong} />
      </Pressable>
    </View>
  );

  // Chat tab needs a flex-bounded column (not a parent ScrollView) so the
  // composer can stay above the software keyboard on Android resize + iOS.
  // Keep last-known circle mounted across refetch errors and silent reloads.
  const readyWorkspace = Boolean(circle && token && !accessDenied);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {accessDenied ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {workspaceHeader}
          <BlockedAccessCard
            circleName={circle?.name || t('fallbackName')}
            viewerRole="none"
          />
        </ScrollView>
      ) : readyWorkspace ? (
        <View style={styles.workspaceShell}>
          <View
            style={[
              styles.workspaceHeaderPad,
              workspaceChromeLayoutStyle(
                isWorkspaceChromeCollapsed(workspaceKeyboardVisible),
              ),
            ]}
            collapsable={false}
          >
            {workspaceHeader}
          </View>
          {error ? (
            <View style={[styles.inlineErrorBanner, styles.workspaceLoadError]}>
              <FontAwesome name="warning" size={14} color={colors.warning} />
              <Text style={styles.inlineErrorText}>{error}</Text>
              <Pressable
                onPress={() => void loadWorkspace({ silent: true })}
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.retryWorkspace')}
              >
                <Text style={styles.inlineErrorRetry}>{t('status.retry')}</Text>
              </Pressable>
            </View>
          ) : null}
          <WorkspaceContent
            circle={circle!}
            token={token!}
            userId={session!.user.id}
            initialTab={initialTab}
            initialConversationId={conversationIdParam}
            onReload={() => loadWorkspace({ silent: true })}
            refreshNonce={refreshNonce}
            onRoundResolved={setResolvedRound}
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            keyboardVisible={workspaceKeyboardVisible}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {workspaceHeader}
          {loading ? (
            <StatusCard
              icon="spinner"
              loading
              title={t('status.settingUpTitle')}
              text={t('status.settingUpBody')}
            />
          ) : error ? (
            <View style={styles.statusCard}>
              <FontAwesome name="warning" size={34} color={colors.warning} />
              <Text style={styles.statusTitle}>{t('status.openErrorTitle')}</Text>
              <Text style={styles.statusText}>{error}</Text>
              <Pressable
                style={styles.retryButton}
                onPress={() => void loadWorkspace()}
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.retryWorkspace')}
              >
                <Text style={styles.retryButtonText}>{t('status.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <StatusCard
              icon="clock-o"
              title={t('status.workspacePendingTitle')}
              text={t('status.workspacePendingBody')}
            />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function WorkspaceContent({
  circle,
  token,
  userId,
  initialTab,
  initialConversationId,
  onReload,
  refreshNonce,
  onRoundResolved,
  refreshing,
  onRefresh,
  keyboardVisible,
}: {
  circle: BackendCircleDetail;
  token: string;
  userId: string;
  initialTab: ActiveTab;
  initialConversationId?: string;
  onReload: () => Promise<void>;
  refreshNonce: number;
  onRoundResolved: (round: number) => void;
  refreshing: boolean;
  onRefresh: () => void;
  keyboardVisible: boolean;
}) {
  const { hasCapability } = useEntitlements();
  const canExportAdvancedReports = hasCapability('advancedReports');
  const contributionPaymentsEnabled = hasCapability(
    'contributionPaymentsEnabled',
  );
  const isOrganizer = circle.userRole === 'organizer';
  const { t, i18n: translation } = useTranslation([
    'circleWorkspace',
    'contributions',
    'rounds',
    'schedule',
    'financialErrors',
    'assistant',
  ]);
  const language = translation.resolvedLanguage || translation.language;
  const { t: tPeople } = useTranslation('people');
  const hasChatMembership = (circle.members || []).some(
    (member) => String(member.userId || '').trim() === userId,
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    initialTab === 'chat' && !hasChatMembership ? 'round' : initialTab,
  );
  const [chatOpened, setChatOpened] = useState(
    initialTab === 'chat' && hasChatMembership,
  );
  const warmSections = readCircleWorkspacePresentation(circle.id);
  const [scheduleData, setScheduleData] = useState<BackendRoundSnapshot | null>(
    warmSections?.schedule ?? null,
  );
  const [ledgerEntries, setLedgerEntries] = useState<BackendLedgerEntry[]>([]);
  const [secondaryLoading, setSecondaryLoading] = useState(
    !warmSections?.schedule,
  );
  const [secondaryError, setSecondaryError] = useState<string | null>(null);
  const cacheHealRetries = useRef(0);
  const sectionsGeneration = useRef(createRequestGeneration());
  const ledgerGeneration = useRef(createRequestGeneration());
  const hasLastKnownSectionsRef = useRef(Boolean(warmSections?.schedule));
  const [actionMemberId, setActionMemberId] = useState<string | null>(null);
  const [paymentSheet, setPaymentSheet] = useState<
    | null
    | { kind: 'mark_as_sent'; handId: string }
    | { kind: 'confirm_received'; member: BackendCircleMember }
    | { kind: 'record_paid'; member: BackendCircleMember }
  >(null);
  const [paymentReferenceDraft, setPaymentReferenceDraft] = useState('');
  const paymentInstructions = circle.paymentInstructions ?? null;
  const paymentDestinations = circle.paymentDestinations ?? null;
  const {
    unreadCount: chatUnreadCount,
    accessDenied: chatAccessDenied,
  } = useConversationUnreadCount(
    circle.id,
    token,
    hasChatMembership,
  );
  const chatAvailable = hasChatMembership && !chatAccessDenied;
  const visibleTabs = chatAvailable
    ? tabs
    : tabs.filter((tab) => tab.id !== 'chat');
  const [workspaceAgreementSnapshot, setWorkspaceAgreementSnapshot] =
    useState<CircleAgreementSnapshot | null>(null);
  const [workspaceAgreementLoaded, setWorkspaceAgreementLoaded] = useState(false);

  useEffect(() => {
    if (activeTab === 'chat' && chatAvailable) {
      setChatOpened(true);
    }
  }, [activeTab, chatAvailable]);

  useEffect(() => {
    if (!chatAvailable && activeTab === 'chat') {
      setActiveTab('round');
      setChatOpened(false);
    }
  }, [activeTab, chatAvailable]);

  const workspaceParticipating = useMemo(
    () =>
      (circle.members || []).some(
        (member) =>
          String(member.userId || '').trim() === userId &&
          member.isParticipating !== false,
      ),
    [circle.members, userId],
  );
  const circleNotStarted = isCircleNotStarted(circle);

  useEffect(() => {
    let cancelled = false;
    if (
      !shouldFetchWorkspaceAgreementSnapshot({
        token,
        circleNotStarted,
        isParticipating: workspaceParticipating,
      })
    ) {
      setWorkspaceAgreementSnapshot(null);
      setWorkspaceAgreementLoaded(true);
      return () => {
        cancelled = true;
      };
    }
    setWorkspaceAgreementLoaded(false);
    void (async () => {
      try {
        const next = await getCircleAgreementSnapshot(token, circle.id);
        if (!cancelled) setWorkspaceAgreementSnapshot(next);
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'status' in error &&
          (error as { status?: unknown }).status === 404
        ) {
          if (!cancelled) setWorkspaceAgreementSnapshot(null);
        } else {
          logClientError('Unable to load agreement snapshot for workspace banner', error, {
            circleId: circle.id,
          });
          if (!cancelled) setWorkspaceAgreementSnapshot(null);
        }
      } finally {
        if (!cancelled) setWorkspaceAgreementLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    circle.id,
    circleNotStarted,
    refreshNonce,
    token,
    workspaceParticipating,
  ]);

  const workspaceMemberAgreementPrompt: MemberAgreementPrompt = useMemo(() => {
    if (!workspaceAgreementLoaded) return { kind: 'none' };
    return getMemberAgreementPrompt({
      circleStarted: !circleNotStarted,
      userId,
      isParticipatingMember: workspaceParticipating,
      snapshot: workspaceAgreementSnapshot,
    });
  }, [
    circleNotStarted,
    userId,
    workspaceAgreementLoaded,
    workspaceAgreementSnapshot,
    workspaceParticipating,
  ]);

  const workspaceMemberAgreementBanner =
    memberCanOpenAgreementReview(workspaceMemberAgreementPrompt) &&
    shouldShowMemberAgreementBanner(workspaceMemberAgreementPrompt) ? (
      <View
        style={{
          marginTop: 12,
          marginHorizontal: 0,
          backgroundColor: colors.warningSoft,
          borderColor: colors.warning,
          borderWidth: 1,
          borderRadius: radii.card,
          padding: 14,
          gap: 10,
        }}
        accessibilityRole="summary"
      >
        <Text style={{ color: colors.textStrong, fontWeight: '800', fontSize: 15 }}>
          {tPeople('agreements.bannerTitle')} - {tPeople('agreements.cta')}
        </Text>
        <Text style={{ color: colors.text, lineHeight: 20 }}>
          {workspaceMemberAgreementPrompt.kind === 'waiting_for_snapshot'
            ? tPeople('agreements.bannerWaitingBody')
            : workspaceMemberAgreementPrompt.kind === 'stale_structure'
              ? tPeople('agreements.bannerStaleBody')
              : tPeople('agreements.bannerBody')}
        </Text>
        <Pressable
          style={{
            backgroundColor: colors.primary,
            borderRadius: radii.control,
            paddingVertical: 12,
            paddingHorizontal: 14,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
          }}
          onPress={() => router.push(circleAgreementReviewHref(circle.id))}
          accessibilityRole="button"
          accessibilityLabel={tPeople('agreements.ctaA11y')}
        >
          <FontAwesome name="file-text-o" size={14} color={colors.onColor} />
          <Text style={{ color: colors.onColor, fontWeight: '800' }}>
            {tPeople('agreements.cta')}
          </Text>
        </Pressable>
      </View>
    ) : null;

  const loadBackendSections = useCallback(async () => {
    const generation = sectionsGeneration.current.next();
    if (!hasLastKnownSectionsRef.current) {
      setSecondaryLoading(true);
    }
    if (sectionsGeneration.current.isCurrent(generation)) {
      setSecondaryError(null);
    }
    try {
      const scheduleResponse = await getCircleSchedule(token, circle.id);
      if (!sectionsGeneration.current.isCurrent(generation)) {
        return;
      }
      hasLastKnownSectionsRef.current = true;
      setScheduleData(scheduleResponse);
      seedCircleWorkspaceCache({
        circleId: circle.id,
        schedule: scheduleResponse,
      });
    } catch (loadError) {
      logClientError('Unable to load circle workspace sections', loadError, {
        circleId: circle.id,
      });
      if (!sectionsGeneration.current.isCurrent(generation)) {
        return;
      }
      setSecondaryError(t('status.genericError'));
    } finally {
      if (sectionsGeneration.current.isCurrent(generation)) {
        setSecondaryLoading(false);
      }
    }
  }, [token, circle.id, t]);

  const loadLedger = useCallback(async () => {
    const generation = ledgerGeneration.current.next();
    try {
      const ledgerResponse = await getLedgerEntries(token, circle.id);
      if (!ledgerGeneration.current.isCurrent(generation)) {
        return;
      }
      setLedgerEntries(ledgerResponse.entries || []);
    } catch (loadError) {
      logClientError('Unable to load circle ledger', loadError, { circleId: circle.id });
    }
  }, [token, circle.id]);

  useEffect(() => {
    sectionsGeneration.current.next();
    ledgerGeneration.current.next();
    const warm = readCircleWorkspacePresentation(circle.id);
    if (warm?.schedule) {
      hasLastKnownSectionsRef.current = true;
      setScheduleData(warm.schedule);
      setSecondaryLoading(false);
    } else {
      hasLastKnownSectionsRef.current = false;
      setScheduleData(null);
      setSecondaryLoading(true);
    }
    setLedgerEntries([]);
    setSecondaryError(null);
  }, [circle.id]);

  useEffect(() => {
    void loadBackendSections();
  }, [circle.id, token, refreshNonce, loadBackendSections]);

  useEffect(() => {
    if (activeTab !== 'records') {
      return;
    }
    void loadLedger();
  }, [activeTab, circle.id, loadLedger, refreshNonce]);

  // scheduleData is the single source of truth for the round summary.
  // Do not fall back to circle.currentRoundSummary - it can be stale relative
  // to what getCircleSchedule returns, causing contradictory display values.
  const summary = scheduleData?.currentRoundSummary;
  const roundWorkspace = scheduleData?.roundWorkspace;
  const viewerPermissions = roundWorkspace?.viewerPermissions;
  const viewerRole = roundWorkspace?.viewerRole;

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
          t,
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
    t,
  );
  const viewerParticipatingHands = collectViewerParticipatingHands({
    userId,
    members: orderedMembers,
    viewerHands: circle.viewerHands,
  });
  const memberContributionCard = buildMemberContributionCardModel({
    hands: viewerParticipatingHands,
    contributions: scheduleData?.contributions,
    currentRoundNumber,
    contributionAmount: circle.contributionAmount,
    paymentInstructions,
    paymentDestinations,
    statusByHandId: Object.fromEntries(
      viewerParticipatingHands.map((hand) => {
        const contribution = findContribution(
          scheduleData?.contributions,
          hand.id,
          currentRoundNumber,
        );
        return [
          hand.id,
          contributionStatus(
            contribution,
            roundWallet,
            ledgerEntries,
            hand.id,
            currentRoundNumber,
            t,
          ).raw,
        ];
      }),
    ),
    t,
  });
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

  const backendPayoutReady = roundWorkspace?.readyForPayout === true;
  const payoutReleased = roundWorkspace?.payoutReleased === true;

  const displayPayoutReady = payoutReleased || backendPayoutReady;

  const displayRoundStatus =
    payoutReleased
      ? t('rounds:payoutSent', {
          name: recipient
            ? recipient.full_name || recipient.name
            : t('rounds:recipient'),
        })
      : displayPayoutReady
        ? t('rounds:allConfirmed')
        : roundStatusLabel(
            roundWorkspace?.currentRoundStatus || circle.status,
            t,
          );
  // ────────────────────────────────────────────────────────────────────────

  // Financial UI: backend viewerPermissions are authoritative (P0.5.2/P0.5.3).
  // Missing flags default false. Local conditions may only further restrict.
  const canReviewContributions = canShowBackendGatedAction(
    viewerPermissions?.canApproveContributions,
  );
  const canRejectContributions = canShowBackendGatedAction(
    // Prefer explicit reject flag when present; fall back to approve (same lifecycle).
    (viewerPermissions as { canRejectContributions?: boolean } | undefined)
      ?.canRejectContributions ?? viewerPermissions?.canApproveContributions,
  );
  // Release Payout is strictly backend-gated - display state alone must never
  // enable this button.
  const canReleasePayout = canShowBackendGatedAction(
    viewerPermissions?.canReleasePayout,
    backendPayoutReady && !payoutReleased,
  );
  const canRemindMembers = canShowBackendGatedAction(
    viewerPermissions?.canRemindMembers,
  );
  const memberCanSubmitContribution = canShowBackendGatedAction(
    viewerPermissions?.canSubmitOwnContribution,
    memberContributionCard.anyReportable,
  );
  const hasSchedule = Boolean(scheduleData?.schedule?.length);

  if (!activeParticipant && secondaryLoading) {
    return (
      <StatusCard
        icon="spinner"
        loading
        title={t('status.checkingMembershipTitle')}
        text={t('status.checkingMembershipBody')}
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

  function promptConfirmReceived(member: BackendCircleMember) {
    setPaymentSheet({ kind: 'confirm_received', member });
  }

  function promptRecordPaid(member: BackendCircleMember) {
    setPaymentSheet({ kind: 'record_paid', member });
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
      logClientError('Unable to confirm contribution', confirmError, {
        circleId: circle.id,
        memberId: member.id,
      });
      Alert.alert(
        t('contributions:alerts.confirmFailedTitle'),
        financialActionErrorMessage(
          confirmError,
          t('financialErrors:confirmContribution'),
        ),
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
            t('contributions:alerts.recordedTitle'),
            t('contributions:alerts.recordedPending'),
          );
          return;
        }
      }
      await Promise.all([onReload(), loadBackendSections()]);
    } catch (markPaidError) {
      logClientError('Unable to record payment', markPaidError, {
        circleId: circle.id,
        memberId: member.id,
      });
      Alert.alert(
        t('contributions:alerts.recordFailedTitle'),
        financialActionErrorMessage(
          markPaidError,
          t('financialErrors:recordPayment'),
        ),
      );
    } finally {
      setActionMemberId(null);
    }
  }

  function handleMarkContributionSent(handId: string) {
    const navigationHandId = resolveMarkAsSentContributionHrefHandId(
      memberContributionCard,
      handId,
      memberContributionCard.destinations.length,
    );
    if (navigationHandId) {
      router.push(contributionHref(circle.id, navigationHandId));
      return;
    }

    promptMarkContributionSent(handId);
  }

  function promptMarkContributionSent(handId: string) {
    const target = resolveMarkAsSentTarget(memberContributionCard, handId);
    if (
      !canStartMarkAsSentSubmit({
        canSubmit: memberCanSubmitContribution,
        target,
        inflightHandId: actionMemberId,
      }) ||
      !target
    ) {
      return;
    }

    setPaymentReferenceDraft('');
    setPaymentSheet({ kind: 'mark_as_sent', handId: target.handId });
  }

  async function submitMarkContributionSent(handId: string) {
    const target = resolveMarkAsSentTarget(memberContributionCard, handId);
    if (
      !canStartMarkAsSentSubmit({
        canSubmit: memberCanSubmitContribution,
        target,
        inflightHandId: actionMemberId,
      }) ||
      !target
    ) {
      return;
    }

    setActionMemberId(target.handId);
    try {
      await submitContribution(
        token,
        circle.id,
        target.handId,
        buildManualContributionSubmitPayload(
          memberContributionCard.destinations[0] ?? null,
          paymentReferenceDraft,
        ),
      );
      await Promise.all([onReload(), loadBackendSections()]);
    } catch (submitError) {
      if (isAlreadyReportedSubmissionError(submitError)) {
        await Promise.all([onReload(), loadBackendSections()]);
        return;
      }
      logClientError('Unable to report contribution as sent', submitError, {
        circleId: circle.id,
        memberId: target.handId,
      });
      Alert.alert(
        t('contributions:markAsSent.failedTitle'),
        financialActionErrorMessage(
          submitError,
          t('financialErrors:submitContribution'),
        ),
      );
    } finally {
      setActionMemberId(null);
    }
  }

  async function handleReleasePayout(isManual = false) {
    if (!recipientId || typeof payoutAmount !== 'number') {
      Alert.alert(
        t('rounds:status.unknown'),
        t('financialErrors:releasePayout'),
      );
      return;
    }

    const recipient = orderedMembers.find(m => m.id === recipientId);
    if (!recipient) {
      logClientError('Payout recipient membership was not found', undefined, {
        circleId: circle.id,
        recipientId,
      });
      Alert.alert(t('rounds:status.unknown'), t('financialErrors:releasePayout'));
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
        logClientError('Unable to release payout', releaseError, {
          circleId: circle.id,
          recipientId,
        });
        Alert.alert(
          t('financialErrors:releasePayout'),
          financialActionErrorMessage(
            releaseError,
            t('financialErrors:generic'),
          ),
        );
      }
    };

    const promptConfirmRelease = () => {
      Alert.alert(
        t('rounds:payout.confirmTitle'),
        t('rounds:payout.confirmBody'),
        [
          { text: t('contributions:alerts.cancel'), style: 'cancel' },
          {
            text: t('rounds:payout.markPaid'),
            onPress: executeBackendRelease,
          },
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
      text: t('rounds:payout.markPaidManually'),
      onPress: promptConfirmRelease
    });

    buttons.push({
      text: t('contributions:alerts.cancel'),
      style: 'cancel'
    });

    const recipientName =
      recipient.full_name || recipient.name || t('rounds:recipient');

    Alert.alert(
      t('rounds:payout.release'),
      t('rounds:payout.methodBody', {
        amount: formatCurrency(payoutAmount, language),
        name: recipientName,
      }),
      buttons
    );
  }

  async function runMemberAction(
    member: BackendCircleMember,
    action: 'reject' | 'remind-sms' | 'remind-whatsapp' | 'remind-app',
    reason?: string,
    reasonCode?: string,
  ) {
    if (action === 'remind-sms' && member.phone) {
      const message = t('contributions:reminderMessage', {
        name: memberName(member),
        circle: circle.name,
      });
      void Linking.openURL(`sms:${member.phone}?body=${encodeURIComponent(message)}`);
      return;
    }
    
    if (action === 'remind-whatsapp' && member.phone) {
      const message = t('contributions:reminderMessage', {
        name: memberName(member),
        circle: circle.name,
      });
      const numericPhone = member.phone.replace(/[^0-9]/g, '');
      void Linking.openURL(`https://wa.me/${numericPhone}?text=${encodeURIComponent(message)}`);
      return;
    }

    setActionMemberId(member.id);
    try {
      if (action === 'reject') {
        await rejectContribution(token, circle.id, member.id, {
          reason,
          reasonCode,
        });
      } else {
        await sendContributionReminder(token, circle.id, member.id);
        Alert.alert(
          t('contributions:alerts.reminderSentTitle'),
          t('contributions:alerts.reminderSentBody', {
            name: memberName(member),
          }),
        );
      }
      await Promise.all([onReload(), loadBackendSections()]);
    } catch (actionError) {
      const isReject = action === 'reject';
      logClientError(
        isReject ? 'Unable to reject contribution' : 'Unable to send reminder',
        actionError,
        { circleId: circle.id, memberId: member.id },
      );
      Alert.alert(
        isReject
          ? t('contributions:alerts.rejectFailedTitle')
          : t('contributions:alerts.reminderFailedTitle'),
        financialActionErrorMessage(
          actionError,
          isReject
            ? t('financialErrors:rejectContribution')
            : t('financialErrors:sendReminder'),
        ),
      );
    } finally {
      setActionMemberId(null);
    }
  }

  function handleRemindPress(member: BackendCircleMember) {
    if (member.phone) {
      Alert.alert(
        t('contributions:alerts.sendReminderTitle'),
        t('contributions:alerts.sendReminderBody', {
          name: memberName(member),
        }),
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
            text: t('contributions:alerts.appNotification'),
            onPress: () => void runMemberAction(member, 'remind-app'),
          },
          {
            text: t('contributions:alerts.cancel'),
            style: 'cancel',
          },
        ]
      );
    } else {
      void runMemberAction(member, 'remind-app');
    }
  }

  const chrome = (
    <>
      <View style={styles.organizerTools}>
        <Pressable
          style={({ pressed }) => [
            styles.organizerTool,
            styles.assistantTool,
            pressed && styles.organizerToolPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('assistant:entry.openA11y')}
          onPress={() =>
            router.push(
              `/circle/assistant?circleId=${encodeURIComponent(circle.id)}` as Href,
            )
          }
        >
          <View style={[styles.organizerToolIcon, styles.assistantToolIcon]}>
            <FontAwesome name="magic" size={15} color={colors.onColor} />
          </View>
          <View style={styles.organizerToolText}>
            <Text style={[styles.organizerToolTitle, styles.assistantToolTitle]}>
              {t('assistant:entry.title')}
            </Text>
            <Text style={[styles.organizerToolCopy, styles.assistantToolCopy]}>
              {t('assistant:entry.subtitle')}
            </Text>
          </View>
          <FontAwesome name="chevron-right" size={11} color={colors.premiumLavender} />
        </Pressable>

      </View>

      <View style={styles.tabBar}>
        {visibleTabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[styles.tab, selected && styles.activeTab]}
              onPress={() => setActiveTab(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <View style={styles.tabIcon}>
                <FontAwesome
                  name={tab.icon}
                  size={18}
                  color={selected ? colors.onColor : colors.muted}
                />
                {tab.id === 'chat' && chatUnreadCount > 0 ? (
                  <View style={styles.chatUnreadBadge}>
                    <Text style={styles.chatUnreadBadgeText}>
                      {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.tabText, selected && styles.activeTabText]}>
                {t(`tabs.${tab.id}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  const nonChatBody = (
    <>
      {workspaceMemberAgreementBanner}

      {activeTab === 'round' ? (
        // Lifecycle phase comes only from circle.status / startedAt / isStarted.
        // Do not wait on schedule to decide setup vs live - schedule is for active rounds only.
        isCircleNotStarted(circle) || isCircleCompleted(circle) || scheduleData ? (
          <>
            {secondaryLoading && isCircleStarted(circle) && !isCircleCompleted(circle) ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.inlineLoadingText}>{t('status.syncing')}</Text>
              </View>
            ) : null}
            {secondaryError && isCircleStarted(circle) && !isCircleCompleted(circle) ? (
              <View style={styles.inlineErrorBanner}>
                <FontAwesome name="warning" size={14} color={colors.warning} />
                <Text style={styles.inlineErrorText}>
                  {t('status.refreshError')}
                </Text>
                <Pressable
                  onPress={() => void loadBackendSections()}
                  accessibilityRole="button"
                  accessibilityLabel={t('accessibility.retryRefresh')}
                >
                  <Text style={styles.inlineErrorRetry}>{t('status.retry')}</Text>
                </Pressable>
              </View>
            ) : null}
            <RoundTab
              canReleasePayout={canReleasePayout}
              canRemindMembers={canRemindMembers}
              canRejectContributions={canRejectContributions}
              canReviewContributions={canReviewContributions}
              circle={circle}
              currentRoundMembers={currentRoundMembers}
              currentRoundNumber={currentRoundNumber}
              displayPayoutReady={displayPayoutReady}
              displayRoundStatus={displayRoundStatus}
              dueDate={dueDate}
              memberCanSubmitContribution={memberCanSubmitContribution}
              contributionPaymentsEnabled={contributionPaymentsEnabled}
              onApprove={promptConfirmReceived}
              onMarkPaid={promptRecordPaid}
              onReject={(member, reason, reasonCode) =>
                void runMemberAction(member, 'reject', reason, reasonCode)
              }
              onRemind={handleRemindPress}
              onReleasePayout={handleReleasePayout}
              payoutAmount={payoutAmount}
              payoutReleased={payoutReleased}
              recipient={recipient}
              schedule={scheduleData?.schedule || []}
              totalMembers={expectedContributionsCount}
              totalRoundsCount={totalRoundsCount}
              visibleConfirmedCount={visibleConfirmedCount}
              visibleProgress={visibleProgress}
              viewerContributionStatus={viewerContributionStatus}
              viewerMember={viewerMember}
              viewerPayoutPosition={viewerPayoutPosition}
              processingMemberId={actionMemberId}
              paymentInstructions={paymentInstructions}
              memberContributionCard={memberContributionCard}
              onMarkContributionSent={handleMarkContributionSent}
            />
          </>
        ) : !scheduleData && secondaryLoading ? (
          <StatusCard
            icon="spinner"
            loading
            title={t('status.roundLoadingTitle')}
            text={t('status.roundLoadingBody')}
          />
        ) : !scheduleData && secondaryError ? (
          <View style={styles.statusCard}>
            <FontAwesome name="warning" size={34} color={colors.warning} />
            <Text style={styles.statusTitle}>{t('status.roundErrorTitle')}</Text>
            <Text style={styles.statusText}>{secondaryError}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => void loadBackendSections()}
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.retryRound')}
            >
              <Text style={styles.retryButtonText}>{t('status.retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <StatusCard
            icon="clock-o"
            title={t('status.roundUnavailableTitle')}
            text={t('status.roundUnavailableBody')}
          />
        )
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
          agreementSnapshot={workspaceAgreementSnapshot}
          agreementSnapshotLoaded={workspaceAgreementLoaded}
        />
      ) : null}

      {activeTab === 'records' ? (
        <RecordsStatementCenter
          circleId={circle.id}
          token={token ?? ''}
          members={circle.members || []}
          ledgerEntries={ledgerEntries}
          isPremium={canExportAdvancedReports}
          circleName={circle.name}
          wallet={roundWallet}
        />
      ) : null}
    </>
  );

  const chatSurface = chatAvailable && chatOpened ? (
    <View
      style={
        activeTab === 'chat'
          ? [
              styles.chatPanel,
              keyboardVisible && styles.chatPanelKeyboardOpen,
            ]
          : styles.chatHidden
      }
      pointerEvents={activeTab === 'chat' ? 'auto' : 'none'}
      collapsable={false}
    >
      <ConversationChat
        circleId={circle.id}
        token={token}
        currentUserId={userId}
        members={circle.members || []}
        initialConversationId={initialConversationId}
        focused={activeTab === 'chat'}
        chromeCollapsed={isWorkspaceChromeCollapsed(keyboardVisible)}
      />
    </View>
  ) : null;

  const markAsSentTarget =
    paymentSheet?.kind === 'mark_as_sent'
      ? resolveMarkAsSentTarget(memberContributionCard, paymentSheet.handId)
      : null;
  const paymentDecisionSheets = (
    <>
      <DecisionSheet
        visible={paymentSheet?.kind === 'mark_as_sent'}
        onClose={() => setPaymentSheet(null)}
        icon="check-circle-o"
        iconTone="primary"
        title={t('contributions:markAsSent.confirmTitle')}
        body={t('contributions:markAsSent.confirmBody', {
          amount: formatCurrency(markAsSentTarget?.amount ?? 0, language),
        })}
        primaryLabel={t('contributions:workspace.markAsSent')}
        secondaryLabel={t('contributions:alerts.cancel')}
        busy={actionMemberId != null}
        onPrimary={() => {
          const handId =
            paymentSheet?.kind === 'mark_as_sent' ? paymentSheet.handId : null;
          setPaymentSheet(null);
          if (handId) {
            void submitMarkContributionSent(handId);
          }
        }}
      >
        <TextInput
          value={paymentReferenceDraft}
          onChangeText={setPaymentReferenceDraft}
          placeholder={t('contributions:markAsSent.referencePlaceholder')}
          accessibilityLabel={t('contributions:markAsSent.referenceA11y')}
          placeholderTextColor={colors.muted}
          maxLength={MAX_PAYMENT_REFERENCE_LENGTH}
          style={{
            borderColor: colors.cardBorder,
            borderRadius: 14,
            borderWidth: 1,
            color: colors.textStrong,
            fontSize: 15,
            marginTop: 8,
            minHeight: 44,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        />
      </DecisionSheet>
      <DecisionSheet
        visible={paymentSheet?.kind === 'confirm_received'}
        onClose={() => setPaymentSheet(null)}
        icon="check"
        iconTone="success"
        title={t('contributions:workspace.review.confirmTitle')}
        body={t('contributions:workspace.review.confirmBody')}
        primaryLabel={t('contributions:workspace.review.confirmAction')}
        secondaryLabel={t('contributions:alerts.cancel')}
        busy={actionMemberId != null}
        onPrimary={() => {
          const member =
            paymentSheet?.kind === 'confirm_received' ? paymentSheet.member : null;
          setPaymentSheet(null);
          if (member) {
            void handleConfirmContribution(member);
          }
        }}
      />
      <DecisionSheet
        visible={paymentSheet?.kind === 'record_paid'}
        onClose={() => setPaymentSheet(null)}
        icon="check-circle"
        iconTone="success"
        title={t('contributions:workspace.review.recordPaidTitle')}
        body={t('contributions:workspace.review.recordPaidBody')}
        primaryLabel={t('contributions:workspace.recordPaid')}
        secondaryLabel={t('contributions:alerts.cancel')}
        busy={actionMemberId != null}
        onPrimary={() => {
          const member =
            paymentSheet?.kind === 'record_paid' ? paymentSheet.member : null;
          setPaymentSheet(null);
          if (member) {
            void handleMarkPaid(member);
          }
        }}
      />
    </>
  );

  if (activeTab === 'chat') {
    return (
      <View style={styles.workspaceBody}>
        <View
          style={[
            styles.chatChrome,
            workspaceChromeLayoutStyle(
              isWorkspaceChromeCollapsed(keyboardVisible),
            ),
          ]}
          collapsable={false}
        >
          {chrome}
        </View>
        {chatSurface}
        {paymentDecisionSheets}
      </View>
    );
  }

  return (
    <View style={styles.workspaceBody}>
      <ScrollView
        style={styles.workspaceBody}
        contentContainerStyle={styles.contentUnderShell}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {chrome}
        {nonChatBody}
      </ScrollView>
      {chatSurface}
      {paymentDecisionSheets}
    </View>
  );
}

function MemberContributionCard({
  card,
  currentRoundNumber,
  language,
  memberCanSubmitContribution,
  contributionPaymentsEnabled,
  onMarkAsSent,
  onPayInApp,
  payoutPosition,
  submittingHandId,
}: {
  card: MemberContributionCardModel;
  currentRoundNumber?: number;
  language: string;
  memberCanSubmitContribution: boolean;
  contributionPaymentsEnabled: boolean;
  onMarkAsSent: (handId: string) => void;
  onPayInApp: (handId: string) => void;
  payoutPosition?: number | null;
  submittingHandId: string | null;
}) {
  const { t } = useTranslation(['contributions', 'people']);
  const firstHand = card.hands[0];
  const awaitingHands = card.hands.filter((hand) => hand.presentation.awaitingOrganizer);
  const rejectedHands = card.hands.filter((hand) => hand.presentation.needsAttention);
  const showPayOutside = card.anyReportable;
  const reportedAt = awaitingHands
    .map((hand) => formatContributionReportedAt(hand.submittedAt, language))
    .find(Boolean);
  const rejectNote = rejectedHands
    .map((hand) =>
      presentRejectReasonForMember(
        {
          rejectReason: hand.rejectReason,
          rejectReasonCode: hand.rejectReasonCode,
        },
        t,
      ),
    )
    .find(Boolean);

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>
        {card.hands.length > 1
          ? contributionCopy(t, 'workspace.myContributions')
          : contributionCopy(t, 'workspace.myContribution')}
      </Text>

      <Text style={styles.memberDueAmount}>
        {card.anyReportable
          ? contributionCopy(
              t,
              card.hands.length > 1 ? 'workspace.totalDue' : 'workspace.amountDue',
              {
                amount: formatCurrency(
                  card.hands.length > 1 ? card.totalDue : firstHand?.amount ?? 0,
                  language,
                ),
              },
            )
          : firstHand?.presentation.primaryLabel ?? ''}
      </Text>

      <Text style={styles.sectionSubtitle}>
        {[
          typeof currentRoundNumber === 'number'
            ? contributionCopy(t, 'workspace.roundLabel', {
                round: currentRoundNumber,
              })
            : null,
          payoutPosition
            ? contributionCopy(t, 'workspace.payoutTurn', {
                position: formatOrdinal(payoutPosition, language),
              })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>

      <Text style={styles.memberEducation}>
        {contributionCopy(t, 'workspace.markAsSentEducation')}
      </Text>

      {card.hands.map((hand, index) => (
        <View
          key={hand.handId}
          style={[
            styles.memberHandRow,
            index < card.hands.length - 1 && styles.memberHandRowDivider,
          ]}
        >
          <View style={styles.memberHandCopy}>
            <View style={styles.memberHandTitleRow}>
              <Text style={styles.memberHandTitle}>
                {contributionCopy(t, 'workspace.handLabel', {
                  number: hand.handNumber,
                })}
              </Text>
              <Text style={styles.memberHandAmount}>
                {formatCurrency(hand.amount, language)}
              </Text>
            </View>
            <View style={styles.memberHandStatusRow}>
              <View style={styles.memberHandStatusCopy}>
                <Text style={styles.memberHandMeta}>
                  {hand.presentation.primaryLabel}
                </Text>
                {hand.presentation.secondaryLabel ? (
                  <Text style={styles.memberHandSecondary}>
                    {hand.presentation.secondaryLabel}
                  </Text>
                ) : null}
              </View>
              {memberCanSubmitContribution &&
              hand.presentation.canReportPayment ? (
                <Pressable
                  style={[
                    styles.memberHandInlineButton,
                    submittingHandId != null && styles.saveButtonDisabled,
                  ]}
                  disabled={submittingHandId != null}
                  onPress={() => onMarkAsSent(hand.handId)}
                  accessibilityRole="button"
                  accessibilityLabel={contributionCopy(
                    t,
                    'workspace.markAsSentA11y',
                    {
                      hand: contributionCopy(t, 'workspace.handLabel', {
                        number: hand.handNumber,
                      }),
                    },
                  )}
                >
                  {submittingHandId === hand.handId ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={styles.memberHandInlineButtonText}>
                      {contributionCopy(t, 'workspace.markAsSent')}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>
            {memberCanSubmitContribution &&
            contributionPaymentsEnabled &&
            hand.presentation.canReportPayment &&
            card.reportableHandCount <= 1 ? (
              <Pressable
                style={styles.memberHandTextAction}
                disabled={submittingHandId != null}
                onPress={() => onPayInApp(hand.handId)}
                accessibilityRole="button"
                accessibilityLabel={contributionCopy(
                  t,
                  'workspace.payInCircusaveA11y',
                  {
                    hand: contributionCopy(t, 'workspace.handLabel', {
                      number: hand.handNumber,
                    }),
                  },
                )}
              >
                <Text style={styles.memberHandTextActionLabel}>
                  {contributionCopy(t, 'workspace.payInCircusave')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}

      {showPayOutside ? (
        <View style={styles.paymentInstructions}>
          <Text style={styles.paymentInstructionsTitle}>
            {contributionCopy(t, 'workspace.payOutsideTitle')}
          </Text>
          {card.hasInstructions ? (
            <>
              <Text style={styles.memberHandSecondary}>
                {contributionCopy(t, 'workspace.sendUsingInstructions')}
              </Text>
              <PaymentDestinationList
                destinations={card.destinations}
                fallbackText={card.instructions}
              />
            </>
          ) : (
            <>
              <Text style={styles.paymentInstructionsText}>
                {contributionCopy(t, 'workspace.instructionsMissingTitle')}
              </Text>
              <Text style={styles.memberHandSecondary}>
                {contributionCopy(t, 'workspace.instructionsMissingBody')}
              </Text>
            </>
          )}
          <Text style={styles.memberDisclosure}>
            {contributionCopy(t, 'workspace.circuSaveDoesNotSend')}
          </Text>
          <Text style={styles.memberDisclosure}>
            {contributionCopy(t, 'workspace.organizerVerifiesAfterReport')}
          </Text>
        </View>
      ) : null}

      {awaitingHands.length > 0 ? (
        <View style={styles.pendingConfirmationCard}>
          <FontAwesome name="clock-o" size={20} color={colors.warning} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.pendingConfirmationTitle}>
              {awaitingHands.length === 1
                ? awaitingHands[0].presentation.primaryLabel
                : contributionCopy(t, 'manualPresentation.reported')}
            </Text>
            <Text style={styles.pendingConfirmationText}>
              {contributionCopy(t, 'manualPresentation.waitingForOrganizer')}
            </Text>
            <Text style={styles.pendingConfirmationText}>
              {contributionCopy(t, 'workspace.reportedNotConfirmed')}
            </Text>
            {reportedAt ? (
              <Text style={styles.pendingConfirmationText}>
                {contributionCopy(t, 'workspace.reportedAt', { when: reportedAt })}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {rejectedHands.length > 0 ? (
        <View style={styles.pendingConfirmationCard}>
          <FontAwesome name="exclamation-circle" size={20} color={colors.warning} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.pendingConfirmationTitle}>
              {contributionCopy(t, 'manualPresentation.needsAttention')}
            </Text>
            {rejectNote ? (
              <Text style={styles.pendingConfirmationText}>{rejectNote}</Text>
            ) : null}
            <Text style={styles.pendingConfirmationText}>
              {contributionCopy(t, 'workspace.rejectedExplainer')}
            </Text>
          </View>
        </View>
      ) : null}

      {card.allConfirmed ? (
        <Text style={styles.sectionSubtitle}>
          {contributionCopy(t, 'workspace.confirmedExplainer')}
        </Text>
      ) : null}
    </View>
  );
}

function openContributionPaymentSetup(circleId: string) {
  router.push(circlePaymentSetupHref(circleId));
}

function RoundTab({
  canReleasePayout,
  canRemindMembers,
  canRejectContributions,
  canReviewContributions,
  circle,
  currentRoundMembers,
  currentRoundNumber,
  displayPayoutReady,
  displayRoundStatus,
  dueDate,
  processingMemberId,
  memberCanSubmitContribution,
  contributionPaymentsEnabled,
  onApprove,
  onMarkPaid,
  onReject,
  onRemind,
  onReleasePayout,
  payoutAmount,
  payoutReleased,
  recipient,
  schedule,
  totalMembers,
  totalRoundsCount,
  visibleConfirmedCount,
  visibleProgress,
  viewerContributionStatus,
  viewerMember,
  viewerPayoutPosition,
  paymentInstructions,
  memberContributionCard,
  onMarkContributionSent,
}: {
  canReleasePayout: boolean;
  canRemindMembers: boolean;
  canRejectContributions: boolean;
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
  contributionPaymentsEnabled: boolean;
  onApprove: (member: BackendCircleMember) => void;
  onMarkPaid: (member: BackendCircleMember) => void;
  onReject: (
    member: BackendCircleMember,
    reason: string,
    reasonCode?: string,
  ) => void;
  onRemind: (member: BackendCircleMember) => void;
  onReleasePayout: (isManual?: boolean) => void;
  payoutAmount?: number;
  payoutReleased: boolean;
  recipient?: BackendCircleMember;
  schedule: BackendScheduleRound[];
  totalMembers: number;
  totalRoundsCount: number;
  visibleConfirmedCount: number;
  visibleProgress: number | null;
  viewerContributionStatus: ContributionStatusView;
  viewerMember?: BackendCircleMember;
  viewerPayoutPosition?: number | null;
  paymentInstructions?: string | null;
  memberContributionCard: MemberContributionCardModel;
  onMarkContributionSent: (handId: string) => void;
}) {
  const { t, i18n: translation } = useTranslation([
    'circleWorkspace',
    'people',
    'contributions',
    'rounds',
    'schedule',
    'financialErrors',
    'createCircle',
    'ledger',
  ]);
  const language = translation.resolvedLanguage || translation.language;
  const [visibleActionCount, setVisibleActionCount] = useState(5);
  const [showAllPaid, setShowAllPaid] = useState(false);
  const [actionSearch, setActionSearch] = useState('');
  // Always start collapsed; only open when the user taps (reference terms, not live status).
  const [roundDetailsExpanded, setRoundDetailsExpanded] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<BackendCircleMember | null>(
    null,
  );
  const [rejectReasonCode, setRejectReasonCode] =
    useState<OrganizerRejectReasonCode>('not_received');
  const [rejectOtherText, setRejectOtherText] = useState('');
  const showOrganizerHandLabel = shouldShowOrganizerHandLabel(
    currentRoundMembers.map(({ member }) => member),
  );

  useEffect(() => {
    // New round or circle → keep details closed until needed.
    setRoundDetailsExpanded(false);
    setScheduleExpanded(false);
  }, [circle.id, currentRoundNumber]);

  // All display values arrive pre-normalized from WorkspaceContent.
  const expectedContributionsCount = totalMembers;
  const visibleTotalRounds = totalRoundsCount;
  // Authoritative only: status / startedAt / isStarted - never schedule presence.
  const lifecyclePhase = getCircleLifecyclePhase(circle);
  const notStarted = lifecyclePhase === 'setup';
  const completed = lifecyclePhase === 'completed';
  const paused = lifecyclePhase === 'paused';
  const closed = lifecyclePhase === 'closed';
  // Financial CTAs only when backend grants; paused/closed never look "live".
  const financialActionsLocked = paused || closed || completed;

  const isViewerRecipient = viewerMember && recipient && viewerMember.id === recipient.id;
  const potTarget =
    Number.isFinite(circle.contributionAmount) && expectedContributionsCount > 0
      ? circle.contributionAmount * expectedContributionsCount
      : payoutAmount ?? null;

  // Setup / draft: planned hands only - never Collecting, dues, or payout readiness.
  if (notStarted) {
    const plannedHands =
      currentRoundMembers.length > 0
        ? currentRoundMembers.map(({ member }) => member)
        : (circle.members || []).filter((m) => m.isParticipating !== false);
    const handCount = circle.handCount ?? plannedHands.length;
    const peopleCount = circle.uniqueMemberCount;
    const handMetrics =
      typeof peopleCount === 'number'
        ? t('people:hands.metrics', {
            hands: t('people:hands.count', { count: handCount }),
            people: t('people:hands.peopleCount', { count: peopleCount }),
          })
        : t('people:hands.count', { count: handCount });
    const plannedRounds =
      visibleTotalRounds > 0 ? visibleTotalRounds : plannedHands.length;

    return (
      <View style={styles.section}>
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: colors.primary,
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
              <FontAwesome name="calendar-o" size={22} color={colors.onColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onColor, fontSize: 18, fontWeight: '800' }}>
                {t('circleWorkspace:setupRound.title')}
              </Text>
              <Text
                style={{
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: 14,
                  marginTop: 4,
                  lineHeight: 20,
                }}
              >
                {t('circleWorkspace:setupRound.subtitle')}
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
              {t('circleWorkspace:setupRound.roster')}
            </Text>
            <Text style={{ color: colors.onColor, fontSize: 20, fontWeight: '900', marginTop: 4 }}>
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
              {t('circleWorkspace:setupRound.plannedRounds', {
                count: plannedRounds,
              })}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.sectionCard,
            { padding: 0, overflow: 'hidden', backgroundColor: colors.card, borderRadius: 20 },
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.surfaceMuted,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textStrong }}>
              {t('circleWorkspace:setupRound.plannedHands')}
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, fontWeight: '600' }}>
              {t('circleWorkspace:setupRound.notActive')}
            </Text>
          </View>
          {plannedHands.length === 0 ? (
            <Text style={[styles.helperText, { padding: 16 }]}>
              {t('circleWorkspace:setupRound.emptyHands')}
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
                  borderBottomColor: colors.background,
                }}
              >
                <View style={styles.positionBadge}>
                  <Text style={styles.positionText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={{ fontSize: 15, fontWeight: '800', color: colors.textStrong }}
                    numberOfLines={1}
                  >
                    {member.displayLabel || memberName(member)}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {t('circleWorkspace:setupRound.payoutPosition', {
                      position: formatOrdinal(index + 1, language),
                    })}
                  </Text>
                </View>
                <StatusBadge
                  label={
                    isUnclaimedHand(member)
                      ? t('people:hands.awaitingClaim')
                      : t('people:common.connected')
                  }
                  tone={isUnclaimedHand(member) ? 'warning' : 'success'}
                />
              </View>
            ))
          )}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.infoSoft, borderColor: colors.infoBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.infoText }]}>
            {t('circleWorkspace:setupRound.beforeStartTitle')}
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.infoText }]}>
            {t('circleWorkspace:setupRound.beforeStartBody')}
          </Text>
        </View>
      </View>
    );
  }

  // Completed: historical only - no Start, no structural setup, no live Collecting chrome.
  if (completed) {
    return (
      <View style={styles.section}>
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: colors.text,
              padding: 24,
              borderRadius: 20,
            },
          ]}
        >
          <Text style={{ color: colors.onColor, fontSize: 18, fontWeight: '800' }}>
            {t('circleWorkspace:completedRound.title')}
          </Text>
          <Text
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 14,
              marginTop: 8,
              lineHeight: 20,
            }}
          >
            {t('circleWorkspace:completedRound.subtitle')}
          </Text>
          {visibleTotalRounds > 0 ? (
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 12 }}>
              {t('circleWorkspace:completedRound.roundCount', {
                count: visibleTotalRounds,
              })}
            </Text>
          ) : null}
        </View>
        {recipient ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              {t('circleWorkspace:completedRound.lastRecipient')}
            </Text>
            <Text style={styles.sectionSubtitle}>{memberName(recipient)}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  const lifecycleBanner =
    paused || closed ? (
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: paused ? colors.warningSoft : colors.surfaceMuted,
            borderColor: paused ? colors.warningBorder : colors.cardBorder,
            marginBottom: 12,
          },
        ]}
      >
        <Text
          style={[
            styles.sectionTitle,
            { color: paused ? colors.warningText : colors.text },
          ]}
        >
          {paused ? roundPausedTitle() : roundClosedTitle()}
        </Text>
        <Text
          style={[
            styles.sectionSubtitle,
            { color: paused ? colors.warningText : colors.muted },
          ]}
        >
          {paused ? roundPausedSubtitle() : roundClosedSubtitle()}
        </Text>
      </View>
    ) : null;

  return (
    <>
    <View style={styles.section}>
      {lifecycleBanner}
      {/* Single hero: round status, recipient, pot, progress (no duplicate banners) */}
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: paused ? colors.warningStrong : closed ? colors.muted : colors.primary,
            padding: 24,
            borderRadius: 20,
          },
        ]}
      >
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
              <Text style={{ color: colors.onColor, fontSize: 24, fontWeight: '900' }}>
                {currentRoundNumber}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onColor, fontSize: 18, fontWeight: '800' }}>
                {visibleTotalRounds > 0
                  ? t('rounds:number', {
                      current: currentRoundNumber,
                      total: visibleTotalRounds,
                    })
                  : t('rounds:numberOnly', { current: currentRoundNumber })}
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
                  {t('rounds:payoutDate', {
                    date: formatLocalizedDate(dueDate, language),
                  })}{' '}
                  · {formatRelativeDate(dueDate, language)}
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
              color={payoutReleased || displayPayoutReady ? colors.onColor : colors.warningBorder}
            />
            <Text
              style={{
                color: payoutReleased || displayPayoutReady ? colors.onColor : colors.warningBorder,
                fontSize: 13,
                fontWeight: '600',
              }}
            >
              {payoutReleased
                ? t('rounds:status.released')
                : displayPayoutReady
                  ? t('rounds:status.ready')
                  : t('rounds:status.collecting')}
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
                  ? t('rounds:viewerRecipient')
                  : t('rounds:recipient')}
              </Text>
              <Text
                style={{
                  color: colors.onColor,
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
                {t('rounds:potAmount')}
              </Text>
              <Text
                style={{
                  color: colors.onColor,
                  fontSize: 32,
                  fontWeight: '900',
                  marginTop: -2,
                }}
              >
                {typeof payoutAmount === 'number'
                  ? formatCurrency(payoutAmount, language)
                  : t('contributions:statusLabels.unavailable')}
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
            <Text style={{ color: colors.onColor, fontSize: 14, fontWeight: '700' }}>
              {t('rounds:progress')}
            </Text>
            <Text style={{ color: colors.onColor, fontSize: 14, fontWeight: '700' }}>
              {t('rounds:confirmedCount', {
                confirmed: visibleConfirmedCount,
                total: expectedContributionsCount,
              })}
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
                  backgroundColor: colors.success,
                  borderRadius: 5,
                }}
              />
            </View>
            <Text style={{ color: colors.onColor, fontSize: 14, fontWeight: '800' }}>
              {formatPercentage(visibleProgress || 0, language)}
            </Text>
          </View>
        </View>
      </View>

      {/* Members only: report own payment. Organizers manage everyone below.
          Hidden when financial actions are lifecycle-locked or backend denies submit. */}
      {!financialActionsLocked &&
      !canReviewContributions &&
      memberContributionCard.hands.length > 0 ? (
        <MemberContributionCard
          card={memberContributionCard}
          currentRoundNumber={currentRoundNumber}
          language={language}
          memberCanSubmitContribution={memberCanSubmitContribution}
          contributionPaymentsEnabled={contributionPaymentsEnabled}
          onMarkAsSent={onMarkContributionSent}
          onPayInApp={(handId) =>
            router.push(contributionHref(circle.id, handId))
          }
          payoutPosition={viewerPayoutPosition}
          submittingHandId={processingMemberId}
        />
      ) : null}

      {/* Core payout release is free - gated only on backend permission/readiness. */}
      {!financialActionsLocked && canReleasePayout ? (
        <View style={{ width: '100%' }}>
          <Pressable
            style={styles.payoutButton}
            onPress={() => onReleasePayout(false)}
            accessibilityRole="button"
            accessibilityLabel={t('rounds:payout.release')}
          >
            <FontAwesome name="money" size={18} color={colors.onColor} />
            <Text style={styles.payoutButtonText}>
              {t('rounds:payout.release')}
            </Text>
          </Pressable>
          <Pressable
            style={{ marginTop: 16, paddingVertical: 12, alignItems: 'center' }}
            onPress={() => onReleasePayout(true)}
            accessibilityRole="button"
            accessibilityLabel={t('rounds:payout.markPaidManually')}
          >
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
              {t('rounds:payout.markPaidManually')}
            </Text>
          </Pressable>
        </View>
      ) : !financialActionsLocked && displayPayoutReady && !payoutReleased ? (
        <Text style={[styles.helperText, { marginTop: 8, textAlign: 'center' }]}>
          {t('rounds:payout.waitingPermission')}
        </Text>
      ) : null}

      <View style={styles.paymentRosterCard}>
        <View style={styles.paymentRosterHeader}>
          <View style={styles.paymentRosterHeading}>
            <View style={styles.paymentRosterIcon}>
              <FontAwesome name="check" size={15} color={colors.successText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentRosterTitle}>
                {t('contributions:workspace.whoPaid')}
              </Text>
              <Text style={styles.paymentRosterSummary}>
                {t('rounds:confirmedCount', {
                  confirmed: visibleConfirmedCount,
                  total: expectedContributionsCount,
                })}
              </Text>
            </View>
          </View>
          {currentRoundMembers.length > 4 ? (
            <Pressable
              style={styles.paymentRosterToggle}
              onPress={() => setShowAllPaid(!showAllPaid)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAllPaid }}
            >
              <Text style={styles.paymentRosterToggleText}>
                {showAllPaid
                  ? t('contributions:workspace.showLess')
                  : t('contributions:workspace.viewAll')}
              </Text>
              <FontAwesome
                name={showAllPaid ? 'chevron-up' : 'chevron-down'}
                size={11}
                color={colors.primary}
              />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.paymentRosterList}>
          {[...currentRoundMembers]
          .sort((a, b) => {
            const aConfirmed = a.status.raw === 'confirmed';
            const bConfirmed = b.status.raw === 'confirmed';
            if (aConfirmed && !bConfirmed) return 1;
            if (!aConfirmed && bConfirmed) return -1;
            return 0;
          })
          .slice(0, showAllPaid ? undefined : 4)
          .map(({ member, status, contribution }, index) => {
          const reviewRow = buildOrganizerReviewRowModel({
            member,
            contribution,
            statusRaw: status.raw,
            amount: circle.contributionAmount,
            showHandLabel: showOrganizerHandLabel,
            t,
          });
          let badgeColor = colors.surfaceMuted;
          let textColor = colors.muted;
          let statusIcon: ComponentProps<typeof FontAwesome>['name'] = 'clock-o';

          if (status.raw === 'confirmed') {
            badgeColor = colors.successSoft;
            textColor = colors.successText;
            statusIcon = 'check-circle';
          } else if (status.raw === 'submitted' || status.raw === 'late') {
            badgeColor = colors.warningSoft;
            textColor = colors.warningText;
            statusIcon = 'hourglass-half';
          } else {
            badgeColor = colors.surfaceMuted;
            textColor = colors.muted;
          }

          const reportedAt = formatContributionReportedAt(
            reviewRow.submittedAt,
            language,
          );
          const isProcessing = processingMemberId === member.id;
          const canMarkPaid =
            !financialActionsLocked &&
            canReviewContributions &&
            ['due', 'missed', 'rejected'].includes(status.raw);
          const canApprove =
            !financialActionsLocked &&
            canReviewContributions &&
            ['submitted', 'late'].includes(status.raw);
          const canReject =
            !financialActionsLocked &&
            canRejectContributions &&
            ['submitted', 'late'].includes(status.raw);
          const showActions =
            !financialActionsLocked &&
            (canMarkPaid || canApprove || canReject);
          const methodLabelKey = claimedPaymentMethodLabelKey(
            reviewRow.paymentMethod,
          );
          const methodLabel = methodLabelKey
            ? contributionCopy(t, methodLabelKey)
            : reviewRow.paymentMethod;
          const hasPaymentDetails = Boolean(
            reportedAt ||
              reviewRow.paymentMethod ||
              reviewRow.claimedDestination ||
              reviewRow.paymentReference ||
              reviewRow.note,
          );

          return (
            <View
              key={member.id}
              style={[
                styles.paymentRosterRow,
                index > 0 && styles.paymentRosterRowSeparated,
              ]}
            >
              <View style={styles.paymentRosterMemberLine}>
                <Avatar name={reviewRow.displayName} size={42} />
                <View style={styles.paymentRosterMember}>
                  <Text style={styles.paymentRosterMemberName}>
                    {reviewRow.displayName}
                  </Text>
                  <View
                    style={[
                      styles.paymentRosterStatus,
                      { backgroundColor: badgeColor },
                    ]}
                  >
                    <FontAwesome
                      name={statusIcon}
                      size={11}
                      color={textColor}
                    />
                    <Text
                      style={[
                        styles.paymentRosterStatusText,
                        { color: textColor },
                      ]}
                    >
                      {reviewRow.statusLabel}
                    </Text>
                  </View>
                </View>
                <Text style={styles.paymentRosterAmount}>
                  {formatCurrency(reviewRow.amount, language)}
                </Text>
              </View>

              {hasPaymentDetails ? (
                <View style={styles.paymentRosterDetails}>
                  {reportedAt ? (
                    <Text style={styles.paymentRosterDetailText}>
                      {contributionCopy(t, 'workspace.review.reportedAt', {
                        when: reportedAt,
                      })}
                    </Text>
                  ) : null}
                  {reviewRow.paymentMethod ? (
                    <Text style={styles.paymentRosterDetailText}>
                      {contributionCopy(t, 'workspace.review.paymentMethod', {
                        method: methodLabel,
                      })}
                    </Text>
                  ) : null}
                  {reviewRow.claimedDestination ? (
                    <Text style={styles.paymentRosterDetailText}>
                      {contributionCopy(t, 'workspace.review.claimedDestination', {
                        destination: reviewRow.claimedDestination,
                      })}
                    </Text>
                  ) : null}
                  {reviewRow.paymentReference ? (
                    <Text style={styles.paymentRosterDetailText}>
                      {contributionCopy(t, 'workspace.review.paymentReference', {
                        reference: reviewRow.paymentReference,
                      })}
                    </Text>
                  ) : null}
                  {reviewRow.note ? (
                    <Text style={styles.paymentRosterDetailText}>
                      {reviewRow.note}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {showActions && (
                <View style={styles.paymentRosterActions}>
                  {canApprove || canReject ? (
                    <>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {canApprove ? (
                          <Pressable
                            style={{ flex: 1, backgroundColor: colors.success, paddingVertical: 8, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                            disabled={isProcessing}
                            onPress={() => onApprove(member)}
                          >
                            <FontAwesome name="check-circle-o" size={14} color={colors.onColor} />
                            <Text style={{ color: colors.onColor, fontSize: 13, fontWeight: '800' }}>
                              {contributionCopy(t, 'workspace.review.confirmAction')}
                            </Text>
                          </Pressable>
                        ) : null}
                        {canReject ? (
                          <Pressable
                            style={{ flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger, paddingVertical: 8, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                            disabled={isProcessing}
                            onPress={() => {
                              setRejectReasonCode('not_received');
                              setRejectOtherText('');
                              setRejectTarget(member);
                            }}
                          >
                            <FontAwesome name="times-circle-o" size={14} color={colors.danger} />
                            <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '800' }}>
                              {contributionCopy(t, 'workspace.review.didntReceiveAction')}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {canApprove ? (
                        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 16 }}>
                          {contributionCopy(t, 'workspace.review.confirmBody')}
                        </Text>
                      ) : null}
                    </>
                  ) : canMarkPaid ? (
                    <>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                          style={{ flex: 1, backgroundColor: colors.info, paddingVertical: 8, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                          disabled={isProcessing}
                          onPress={() => onMarkPaid(member)}
                        >
                          <FontAwesome name="check-circle-o" size={14} color={colors.onColor} />
                          <Text style={{ color: colors.onColor, fontSize: 13, fontWeight: '800' }}>
                            {contributionCopy(t, 'workspace.recordPaid')}
                          </Text>
                        </Pressable>
                        {canRemindMembers ? (
                          <Pressable
                            style={{ flex: 1, backgroundColor: colors.surfaceMuted, paddingVertical: 8, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                            disabled={isProcessing}
                            onPress={() => onRemind(member)}
                          >
                            <FontAwesome name="bell-o" size={14} color={colors.muted} />
                            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '800' }}>
                              {contributionCopy(t, 'workspace.remind')}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 16 }}>
                        {contributionCopy(t, 'workspace.review.recordPaidHelper')}
                      </Text>
                    </>
                  ) : null}
                </View>
              )}

            </View>
          );
        })}
        </View>
      </View>

      {/* Reference-only details: no fields already shown in the hero */}
      <View
        style={[
          styles.sectionCard,
          {
            padding: 0,
            overflow: 'hidden',
            backgroundColor: colors.card,
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
              ? t('rounds:collapseDetails')
              : t('rounds:expandDetails')
          }
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.roundDetailsTitle}>{t('rounds:details')}</Text>
            <Text style={styles.roundDetailsSummary} numberOfLines={2}>
              {roundDetailsExpanded
                ? t('rounds:hideDetails')
                : t('rounds:showDetails')}
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
              label={t('rounds:frequency')}
              value={frequencyDisplayLabel(circle.frequency, t)}
            />
            <RoundDetailRow
              icon="dollar"
              label={t('rounds:contributionPerHand')}
              value={t('rounds:contributionFrequency', {
                amount: formatCurrency(circle.contributionAmount, language),
                frequency: frequencyDisplayLabel(circle.frequency, t),
              })}
            />
            <RoundDetailRow
              icon="users"
              label={t('people:hands.title')}
              value={
                expectedContributionsCount > 0
                  ? t('rounds:participatingHands', {
                      count: expectedContributionsCount,
                    })
                  : t('rounds:unknown')
              }
            />
            <RoundDetailRow
              icon="money"
              label={t('rounds:fullPot')}
              value={
                potTarget != null ? formatCurrency(potTarget, language) : '-'
              }
            />
            {viewerPayoutPosition ? (
              <RoundDetailRow
                icon="list-ol"
                label={t('rounds:yourPayoutTurn')}
                value={t('rounds:positionOf', {
                  position: formatOrdinal(viewerPayoutPosition, language),
                  total:
                    visibleTotalRounds || expectedContributionsCount || '-',
                })}
                last
              />
            ) : (
              <RoundDetailRow
                icon="info-circle"
                label={t('rounds:cycleLength')}
                value={
                  visibleTotalRounds > 0
                    ? t('rounds:roundCount', { count: visibleTotalRounds })
                    : t('rounds:setByHands')
                }
                last
              />
            )}
          </View>
        ) : null}
      </View>

      <View
        style={[
          styles.sectionCard,
          {
            padding: 0,
            overflow: 'hidden',
            backgroundColor: colors.card,
            borderRadius: 20,
          },
        ]}
      >
        <Pressable
          style={styles.roundDetailsHeader}
          onPress={() => setScheduleExpanded((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: scheduleExpanded }}
          accessibilityLabel={
            scheduleExpanded
              ? t('schedule:collapse')
              : t('schedule:expand')
          }
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.roundDetailsTitle}>{t('schedule:title')}</Text>
            <Text style={styles.roundDetailsSummary} numberOfLines={2}>
              {scheduleExpanded
                ? t('schedule:hide')
                : schedule.length === 0
                  ? t('schedule:empty')
                  : t('schedule:show', { count: schedule.length })}
            </Text>
          </View>
          <FontAwesome
            name={scheduleExpanded ? 'chevron-up' : 'chevron-down'}
            size={13}
            color={colors.subtle}
            style={{ marginLeft: 10 }}
          />
        </Pressable>

        {scheduleExpanded ? (
          <View style={{ paddingBottom: 8 }}>
            {schedule.length === 0 ? (
              <Text
                style={[
                  styles.sectionSubtitle,
                  { paddingHorizontal: 16, paddingBottom: 12 },
                ]}
              >
                {t('schedule:empty')}
              </Text>
            ) : (
              schedule.map((round, index) => {
                const payoutDate = round.payoutDate || round.payout_date;
                const isCompletedRound = round.round < currentRoundNumber;
                const isCurrentRound = round.round === currentRoundNumber;
                const status = isCompletedRound
                  ? t('schedule:completed')
                  : isCurrentRound
                    ? t('schedule:current')
                    : t('schedule:upcoming');
                const statusIcon = isCompletedRound
                  ? 'check-circle'
                  : isCurrentRound
                    ? 'circle'
                    : 'clock-o';
                const statusColor = isCompletedRound
                  ? colors.success
                  : isCurrentRound
                    ? colors.primary
                    : colors.muted;
                const recipientName =
                  round.recipientName ||
                  round.recipient_name ||
                  t('contributions:statusLabels.unavailable');
                return (
                  <View
                    key={round.id || `round-${round.round}`}
                    style={[
                      styles.scheduleRow,
                      isCompletedRound
                        ? styles.scheduleRowCompleted
                        : isCurrentRound
                          ? styles.scheduleRowCurrent
                          : styles.scheduleRowUpcoming,
                      index === schedule.length - 1 && { borderBottomWidth: 0 },
                    ]}
                    accessibilityLabel={t('schedule:rowA11y', {
                      round: round.round,
                      status,
                      recipient: recipientName,
                      date: payoutDate
                        ? formatLocalizedDate(payoutDate, language)
                        : t('schedule:notFinalized'),
                    })}
                  >
                    <View style={styles.scheduleRowHeader}>
                      <View style={styles.scheduleRoundBadge}>
                        <Text style={styles.scheduleRoundBadgeText}>
                          {t('rounds:numberOnly', { current: round.round })}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.scheduleStatusPill,
                          isCompletedRound
                            ? styles.scheduleStatusCompleted
                            : isCurrentRound
                              ? styles.scheduleStatusCurrent
                              : styles.scheduleStatusUpcoming,
                        ]}
                      >
                        <FontAwesome
                          name={statusIcon}
                          size={12}
                          color={statusColor}
                        />
                        <Text
                          style={[
                            styles.scheduleStatusText,
                            { color: statusColor },
                          ]}
                        >
                          {status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.schedulePrimaryRow}>
                      <View style={styles.scheduleRecipient}>
                        <Text style={styles.scheduleFieldLabel}>
                          {t('schedule:recipient')}
                        </Text>
                        <Text
                          style={[
                            styles.scheduleRecipientName,
                            isCompletedRound &&
                              styles.scheduleRecipientNameCompleted,
                          ]}
                          numberOfLines={2}
                        >
                          {recipientName}
                        </Text>
                      </View>
                      <View style={styles.scheduleDate}>
                        <Text style={styles.scheduleFieldLabel}>
                          {t('schedule:payoutDate')}
                        </Text>
                        <Text
                          style={[
                            styles.scheduleDateValue,
                            isCurrentRound && styles.scheduleDateValueCurrent,
                          ]}
                        >
                          {payoutDate
                            ? formatLocalizedDate(payoutDate, language)
                            : t('schedule:notFinalized')}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : null}
      </View>
    </View>
    <DecisionSheet
      visible={rejectTarget != null}
      onClose={() => setRejectTarget(null)}
      icon="times-circle-o"
      iconTone="warning"
      title={contributionCopy(t, 'workspace.review.didntReceiveTitle')}
      body={contributionCopy(t, 'workspace.review.didntReceiveBody')}
      primaryLabel={contributionCopy(t, 'workspace.review.didntReceiveAction')}
      secondaryLabel={t('contributions:alerts.cancel')}
      onPrimary={() => {
        if (!rejectTarget) {
          return;
        }
        const { reason, reasonCode } = organizerRejectReasonPayload(
          rejectReasonCode,
          t,
          rejectOtherText,
        );
        const member = rejectTarget;
        setRejectTarget(null);
        onReject(member, reason, reasonCode);
      }}
    >
      <View style={{ gap: 8, paddingTop: 8 }}>
        {ORGANIZER_REJECT_REASON_CODES.map((code) => {
          const selected = rejectReasonCode === code;
          return (
            <Pressable
              key={code}
              onPress={() => setRejectReasonCode(code)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                borderColor: selected ? colors.primary : colors.cardBorder,
                backgroundColor: selected ? colors.primarySoft : colors.card,
                borderRadius: 14,
                borderWidth: 1,
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text
                style={{
                  color: colors.textStrong,
                  fontSize: 15,
                  fontWeight: '800',
                }}
              >
                {organizerRejectReasonLabel(code, t)}
              </Text>
            </Pressable>
          );
        })}
        {rejectReasonCode === 'other' ? (
          <TextInput
            value={rejectOtherText}
            onChangeText={setRejectOtherText}
            placeholder={contributionCopy(
              t,
              'workspace.review.otherPlaceholder',
            )}
            placeholderTextColor={colors.muted}
            style={{
              borderColor: colors.cardBorder,
              borderRadius: 14,
              borderWidth: 1,
              color: colors.textStrong,
              fontSize: 15,
              minHeight: 44,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
        ) : null}
      </View>
    </DecisionSheet>
    </>
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
  agreementSnapshot,
  agreementSnapshotLoaded,
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
  agreementSnapshot: CircleAgreementSnapshot | null;
  agreementSnapshotLoaded: boolean;
}) {
  const { t, i18n: translation } = useTranslation(['people', 'payoutOrder']);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [addingHand, setAddingHand] = useState(false);
  const [showHandModal, setShowHandModal] = useState(false);
  const [startingCircle, setStartingCircle] = useState(false);
  const [sharingClaimId, setSharingClaimId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  /** Mirrors start contract confirmPayoutOrder - not a DB field. */
  const [payoutOrderReviewed, setPayoutOrderReviewed] = useState(false);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [expandedMemberKey, setExpandedMemberKey] = useState<string | null>(null);
  const [inviteSectionExpanded, setInviteSectionExpanded] = useState(false);
  const [showPayoutReview, setShowPayoutReview] = useState(false);
  const [declineTarget, setDeclineTarget] = useState<BackendJoinRequest | null>(null);
  const [showRequestSent, setShowRequestSent] = useState(false);
  const [showUnclaimedReview, setShowUnclaimedReview] = useState(false);
  const [pendingStartConfirmations, setPendingStartConfirmations] = useState<StartCircleConfirmations | null>(null);
  const [peopleNotice, setPeopleNotice] = useState<PeopleNotice | null>(null);
  const language = translation.resolvedLanguage || translation.language;
  const formatMoney = useCallback(
    (value: number) => formatCurrency(value, language),
    [language],
  );
  const structureMutationBusy =
    Boolean(approvingId) ||
    Boolean(decliningId) ||
    addingHand ||
    startingCircle ||
    Boolean(reorderingId);
  const shortCode = circle.circleCode;
  const waitlist: BackendJoinRequest[] = Array.isArray(circle.waitlist)
    ? circle.waitlist.filter(
        (entry): entry is BackendJoinRequest =>
          Boolean(entry && typeof entry === 'object'),
      )
    : [];
  const turnOrder = Array.isArray(circle.turnOrder)
    ? circle.turnOrder.filter((id): id is string => typeof id === 'string')
    : [];
  // People tab structural controls: lifecycle from status/startedAt/isStarted only.
  const lifecyclePhase = getCircleLifecyclePhase(circle);
  const circleNotStarted = lifecyclePhase === 'setup';
  const isParticipatingMember = useMemo(
    () =>
      members.some(
        (member) =>
          String(member.userId || '').trim() === userId &&
          member.isParticipating !== false,
      ),
    [members, userId],
  );

  const memberAgreementPrompt: MemberAgreementPrompt = useMemo(() => {
    if (!agreementSnapshotLoaded) {
      return { kind: 'none' };
    }
    return getMemberAgreementPrompt({
      circleStarted: !circleNotStarted,
      userId,
      isParticipatingMember,
      snapshot: agreementSnapshot,
    });
  }, [
    agreementSnapshot,
    agreementSnapshotLoaded,
    circleNotStarted,
    isParticipatingMember,
    userId,
  ]);

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
        turnOrder,
      }),
    [members, turnOrder],
  );
  const memberGroups = useMemo(
    () => groupCurrentApiHandsForDisplay(members),
    [members],
  );

  const toggleMemberExpanded = useCallback((groupKey: string) => {
    setExpandedMemberKey((prev) => (prev === groupKey ? null : groupKey));
  }, []);
  const payoutOrderValidation = useMemo(
    () => validateCurrentPayoutOrder(members, turnOrder),
    [members, turnOrder],
  );
  async function handleApprove(requestId: string) {
    if (!circleNotStarted || structureMutationBusy) {
      Alert.alert(
        t('requests.structureLockedTitle'),
        t('requests.structureLockedBody'),
      );
      return;
    }
    setApprovingId(requestId);
    try {
      await approveJoinRequest(token, circle.id, requestId);
      await onRefresh();
      Alert.alert(t('requests.approvedTitle'), t('requests.approvedBody'));
    } catch (e) {
      logClientError('Unable to approve circle request', e, {
        circleId: circle.id,
        requestId,
      });
      setPeopleNotice({
        title: t('requests.approveErrorTitle'),
        body: t('errors.generic'),
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
      logClientError('Unable to decline circle request', error, {
        circleId: circle.id,
        requestId: declineTarget.requestId,
      });
      Alert.alert(
        t('requests.declineErrorTitle'),
        t('errors.generic'),
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
          formatMessage: (values) => t('invite.claimShareMessage', values),
        }),
      });
    } catch (error) {
      logClientError('Unable to share claim invite', error, {
        circleId: circle.id,
        memberId: member.id,
      });
      Alert.alert(
        t('errors.claimShareTitle'),
        t('errors.generic'),
      );
    } finally {
      setSharingClaimId(null);
    }
  }

  async function handleCopyCircleCode() {
    if (!shortCode) {
      Alert.alert(t('invite.codeUnavailableTitle'), t('invite.codeUnavailable'));
      return;
    }
    try {
      // Uses expo-clipboard when the native binary includes it; otherwise Share
      // (or an on-screen code) so older dev builds do not hard-crash.
      const result = await copyText(shortCode);
      if (result === 'clipboard') {
        Alert.alert(t('invite.codeCopiedTitle'), t('invite.codeCopied', { code: shortCode }));
        return;
      }
      if (result === 'share') {
        return;
      }
      Alert.alert(t('invite.codeTitle'), shortCode);
    } catch (error) {
      logClientError('Unable to copy circle code', error, { circleId: circle.id });
      Alert.alert(
        t('invite.copyErrorTitle'),
        t('errors.generic'),
      );
    }
  }

  function promptStartCircle() {
    if (structureMutationBusy) {
      return;
    }
    if (startBlockReason) {
      setPeopleNotice({
        title: t('start.notReady'),
        body: localizeStartBlockReason(t, startBlockReason),
        tone: 'warning',
      });
      return;
    }
    router.push(circleAgreementReviewHref(circle.id));
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
      setPeopleNotice({
        title: t('start.notReady'),
        body: localizeStartBlockReason(t, blockReason),
        tone: 'warning',
      });
      return;
    }
    if (!confirmations.confirmPayoutOrder) {
      setPendingStartConfirmations(null);
      setPeopleNotice({ title: t('start.notReady'), body: t('start.confirmPayout'), tone: 'warning' });
      return;
    }
    if (needsUnclaimedConfirm && !confirmations.confirmUnclaimedHands) {
      setPendingStartConfirmations(null);
      setPeopleNotice({ title: t('start.notReady'), body: t('start.confirmUnclaimed'), tone: 'warning' });
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
      setPeopleNotice({ title: t('start.startedTitle'), body: t('start.startedBody'), tone: 'success' });
    } catch (error) {
      logClientError('Unable to start circle', error, { circleId: circle.id });
      setPendingStartConfirmations(null);
      setPeopleNotice({
        title: t('start.errorTitle'),
        body: t('errors.generic'),
        tone: 'warning',
      });
    } finally {
      setStartingCircle(false);
    }
  }

  function handleAddHand() {
    if (structureMutationBusy) {
      return;
    }
    setShowHandModal(false);
    router.push(additionalHandConsentHref(circle.id));
  }

  async function handleReorderHand(memberId: string, move: 'up' | 'down') {
    if (!token || structureMutationBusy) {
      return;
    }
    setReorderingId(memberId);
    try {
      await reorderPayoutTurn(token, circle.id, memberId, move);
      // Structure changed - organizer must re-confirm at Start.
      setPayoutOrderReviewed(false);
      await onRefresh();
    } catch (error) {
      logClientError('Unable to reorder payout hand', error, {
        circleId: circle.id,
        memberId,
      });
      Alert.alert(
        t('payoutOrder:errors.reorderTitle'),
        t('errors.generic'),
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
    turnOrder,
  });
  const payoutReviewSheet = (
    <DecisionSheet
      visible={showPayoutReview}
      onClose={() => setShowPayoutReview(false)}
      icon="list-ol"
      title={t('payoutOrder:review.title')}
      body={t('payoutOrder:review.body')}
      primaryLabel={t('payoutOrder:review.confirm')}
      onPrimary={() => {
        setShowPayoutReview(false);
        setPayoutOrderReviewed(true);
        promptUnclaimedHandsReview();
      }}
    >
      <View style={styles.payoutReviewList}>
        {payoutReviewLines.length > 0 ? payoutReviewLines.map((line, index) => (
          <View key={`${line}-${index}`} style={styles.payoutReviewRow}>
            <View style={styles.payoutReviewPosition}>
              <Text style={styles.payoutReviewPositionText}>
                {formatOrdinal(index + 1, language)}
              </Text>
            </View>
            <Text style={styles.payoutReviewName}>{line.replace(/^\d+\.\s*/, '').replace(/^-\s*/, '')}</Text>
          </View>
        )) : <Text style={styles.helperText}>{t('payoutOrder:review.empty')}</Text>}
      </View>
    </DecisionSheet>
  );
  const unclaimedHandsForReview = members.filter(
    (member) => member.isParticipating !== false && isUnclaimedHand(member),
  );

  function openAgreementReview() {
    router.push(circleAgreementReviewHref(circle.id));
  }

  function memberAgreementBannerBody(prompt: MemberAgreementPrompt): string {
    switch (prompt.kind) {
      case 'waiting_for_snapshot':
        return t('agreements.bannerWaitingBody');
      case 'stale_structure':
        return t('agreements.bannerStaleBody');
      case 'accepted':
        return t('agreements.bannerAcceptedBody');
      case 'action_required':
      default:
        return t('agreements.bannerBody');
    }
  }

  const memberAgreementCard =
    circleNotStarted &&
    isParticipatingMember &&
    memberCanOpenAgreementReview(memberAgreementPrompt) ? (
      <View
        style={[
          styles.peopleCard,
          shouldShowMemberAgreementBanner(memberAgreementPrompt)
            ? { borderColor: colors.warning, backgroundColor: colors.warningSoft }
            : null,
        ]}
        accessibilityRole="summary"
      >
        <View style={styles.peopleCardHeader}>
          <View
            style={[
              styles.peopleIconBubble,
              {
                backgroundColor:
                  memberAgreementPrompt.kind === 'accepted'
                    ? colors.primarySoft
                    : colors.warningSoft,
              },
            ]}
          >
            <FontAwesome
              name={
                memberAgreementPrompt.kind === 'accepted'
                  ? 'check'
                  : 'exclamation-triangle'
              }
              size={14}
              color={
                memberAgreementPrompt.kind === 'accepted' ? colors.primary : colors.warningText
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.peopleCardTitle}>
              {memberAgreementPrompt.kind === 'accepted'
                ? t('agreements.viewAccepted')
                : t('agreements.bannerTitle')}
            </Text>
            <Text style={styles.peopleCardSub}>
              {memberAgreementBannerBody(memberAgreementPrompt)}
            </Text>
          </View>
        </View>
        <Pressable
          style={[
            styles.setupPrimaryBtn,
            {
              marginTop: 4,
              backgroundColor:
                memberAgreementPrompt.kind === 'action_required'
                  ? colors.primary
                  : colors.subtle,
            },
          ]}
          onPress={openAgreementReview}
          accessibilityRole="button"
          accessibilityLabel={t('agreements.ctaA11y')}
        >
          <FontAwesome name="file-text-o" size={14} color={colors.onColor} />
          <Text style={styles.setupPrimaryBtnText}>
            {memberAgreementPrompt.kind === 'accepted'
              ? t('agreements.viewAccepted')
              : t('agreements.cta')}
          </Text>
        </Pressable>
      </View>
    ) : null;

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
        title={t('requests.declineTitle')}
        body={declineTarget ? t('requests.declineBody', { name: memberName(declineTarget) }) : ''}
        primaryLabel={t('requests.declineAction')}
        onPrimary={() => void confirmDecline()}
        busy={Boolean(decliningId)}
      />
      <DecisionSheet
        visible={showRequestSent}
        onClose={() => setShowRequestSent(false)}
        icon="paper-plane"
        iconTone="success"
        title={t('hands.requestSentTitle')}
        body={t('hands.requestSentBody')}
        primaryLabel={t('common.done')}
        secondaryLabel={null}
        onPrimary={() => setShowRequestSent(false)}
      />
      <DecisionSheet
        visible={showUnclaimedReview}
        onClose={() => setShowUnclaimedReview(false)}
        icon="user-o"
        iconTone="warning"
        title={t('start.unclaimedTitle')}
        body={t('start.unclaimedBody', { count: unclaimedHandsForReview.length })}
        primaryLabel={t('start.manage')}
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
                <Text style={styles.handDetailMeta}>{t('start.managedMeta')}</Text>
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
        title={t('start.confirmTitle')}
        body={t('start.confirmBody')}
        primaryLabel={t('start.confirmAction')}
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
        primaryLabel={t('common.gotIt')}
        secondaryLabel={null}
        onPrimary={() => setPeopleNotice(null)}
      />
    </>
  );

  // ── Phase 1 setup (organizer + setup only) - single surface, accordion steps ─
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
          t('invite.codeUnavailableTitle'),
          t('invite.codeUnavailable'),
        );
        return;
      }
      try {
        await Share.share({
          message: t('invite.shareMessage', { code: shortCode }),
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
                <Text style={styles.setupMicroLabel}>{t('invite.code')}</Text>
                <View style={styles.setupCodeRow}>
                  <Text
                    selectable
                    style={styles.setupCodeValue}
                    accessibilityLabel={t('invite.codeA11y', {
                      code: shortCode || t('common.unavailable'),
                    })}
                  >
                    {shortCode || '-'}
                  </Text>
                  <View style={styles.setupCodeActions}>
                    <Pressable
                      style={styles.setupIconBtn}
                      disabled={!shortCode}
                      onPress={() => void handleCopyCircleCode()}
                      accessibilityRole="button"
                      accessibilityLabel={t('invite.copy')}
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
                      accessibilityLabel={t('invite.share')}
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
                accessibilityLabel={t('invite.inviteMembers')}
              >
                <FontAwesome name="user-plus" size={15} color={colors.onColor} />
                <Text style={styles.setupPrimaryBtnText}>{t('invite.inviteMembers')}</Text>
              </Pressable>
            </View>
          );

        case 'review_claims_joins':
          return (
            <View style={styles.setupBody}>
              {joinRequests.length === 0 ? (
                <Text style={styles.setupEmpty}>{t('requests.noneJoin')}</Text>
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
                            {t('requests.joinMeta', {
                              detail: m.phone || t('requests.pendingApproval'),
                            })}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable
                            style={({ pressed }) => [styles.setupGhostBtn, pressed && { opacity: 0.85 }]}
                            onPress={() => handleDecline(m)}
                            disabled={structureMutationBusy}
                            accessibilityRole="button"
                            accessibilityLabel={t('requests.declineA11y', { name: memberName(m) })}
                          >
                            <Text style={styles.setupGhostBtnText}>{t('common.decline')}</Text>
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
                            accessibilityLabel={t('requests.approveA11y', { name: memberName(m) })}
                          >
                            {approvingId === m.requestId ? (
                              <ActivityIndicator color={colors.onColor} size="small" />
                            ) : (
                              <Text style={styles.setupApproveBtnText}>{t('common.approve')}</Text>
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
                {t('setup.claimedHint')}
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
                            color: unclaimed ? colors.warningText : colors.successText,
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
                          {unclaimed ? t('hands.noAccess') : t('common.connected')}
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
                  {t('hands.nonePending')}
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
                            {t('hands.additionalMeta', { number: handNum })}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable
                            style={({ pressed }) => [styles.setupGhostBtn, pressed && { opacity: 0.85 }]}
                            onPress={() => handleDecline(m)}
                            disabled={structureMutationBusy}
                            accessibilityRole="button"
                            accessibilityLabel={t('requests.declineExtraA11y', { name: memberName(m) })}
                          >
                            <Text style={styles.setupGhostBtnText}>{t('common.decline')}</Text>
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
                            accessibilityLabel={t('requests.approveExtraA11y', { name: memberName(m) })}
                          >
                            {approvingId === m.requestId ? (
                              <ActivityIndicator color={colors.onColor} size="small" />
                            ) : (
                              <Text style={styles.setupApproveBtnText}>{t('common.approve')}</Text>
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
                  accessibilityLabel={t('hands.requestA11y')}
                >
                  <FontAwesome name="plus" size={12} color={colors.primary} />
                  <Text style={styles.setupGhostBtnText}>{t('hands.requestAnother')}</Text>
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
                    label: t('setup.people'),
                    value: String(progress.structure.peopleCount),
                  },
                  {
                    label: t('setup.hands'),
                    value: String(progress.structure.handCount),
                  },
                  {
                    label: t('setup.rounds'),
                    value: String(progress.structure.totalRounds),
                  },
                  {
                    label: t('setup.perHand'),
                    value: formatMoney(progress.structure.contributionPerHand),
                  },
                  {
                    label: t('setup.potPerRound'),
                    value: formatMoney(progress.structure.potPerRound),
                  },
                  {
                    label: t('setup.organizer'),
                    value: progress.structure.organizerParticipates
                      ? t('setup.in')
                      : t('setup.out'),
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
                {t('payoutOrder:review.hint')}
              </Text>
              {progress.payoutOrderComplete && !progress.payoutOrderReviewed ? (
                <Text style={styles.setupNotice}>
                  {t('payoutOrder:review.stillRequired')}
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
                          color: row.inOrder ? colors.primary : colors.warningText,
                        }}
                      >
                        {formatOrdinal(index + 1, language)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.setupListTitle}>
                        {(row as BackendCircleMember).displayLabel ||
                          memberName(row as BackendCircleMember)}
                      </Text>
                      {!row.inOrder ? (
                        <Text style={[styles.setupListSub, { color: colors.warningText }]}>
                          {t('payoutOrder:review.missing')}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      {index > 0 ? (
                        <Pressable
                          onPress={() => void handleReorderHand(row.id, 'up')}
                          disabled={structureMutationBusy}
                          accessibilityRole="button"
                          accessibilityLabel={t('payoutOrder:review.moveUp')}
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
                          accessibilityLabel={t('payoutOrder:review.moveDown')}
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
                <Text style={styles.setupNotice}>
                  {localizeStartBlockReason(t, startBlockReason)}
                </Text>
              ) : (
                <Text style={styles.setupListHint}>
                  {t('setup.reviewAgreementsHint')}
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
                accessibilityLabel={t('setup.reviewAgreements')}
                accessibilityState={{
                  busy: startingCircle,
                  disabled: structureMutationBusy || Boolean(startBlockReason),
                }}
              >
                {startingCircle ? (
                  <ActivityIndicator color={colors.onColor} />
                ) : (
                  <>
                    <FontAwesome name="file-text-o" size={14} color={colors.onColor} />
                    <Text style={styles.setupPrimaryBtnText}>
                      {t('setup.reviewAgreements')}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          );

        case 'set_contribution_instructions': {
          const hasInstructions = hasContributionPaymentInstructions(
            circle.paymentInstructions,
            circle.paymentDestinations,
          );
          return (
            <View style={styles.setupBody}>
              {hasInstructions ? (
                <>
                  <Text style={styles.setupListHint}>
                    {t('setup.paymentInstructions.previewLabel')}
                  </Text>
                  <PaymentDestinationList
                    destinations={circle.paymentDestinations}
                    fallbackText={String(circle.paymentInstructions ?? '').trim()}
                  />
                </>
              ) : (
                <Text style={styles.setupListHint}>
                  {t('setup.paymentInstructions.emptyHint')}
                </Text>
              )}
              <Pressable
                style={({ pressed }) => [
                  styles.setupPrimaryBtn,
                  pressed && { opacity: 0.88 },
                ]}
                onPress={() => openContributionPaymentSetup(circle.id)}
                accessibilityRole="button"
                accessibilityLabel={
                  hasInstructions
                    ? t('setup.paymentInstructions.editA11y')
                    : t('setup.paymentInstructions.setA11y')
                }
              >
                <FontAwesome
                  name={hasInstructions ? 'pencil' : 'plus'}
                  size={15}
                  color={colors.onColor}
                />
                <Text style={styles.setupPrimaryBtnText}>
                  {hasInstructions
                    ? t('setup.paymentInstructions.editAction')
                    : t('setup.paymentInstructions.setAction')}
                </Text>
              </Pressable>
            </View>
          );
        }

        default:
          return null;
      }
    }

    return (
      <View style={styles.section}>
        {peopleOverlays}
        {memberAgreementCard}

        {/* Invite people - expandable section at top */}
        <View style={styles.peopleCard}>
          <Pressable
            style={styles.peopleCardHeader}
            onPress={() => setInviteSectionExpanded((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: inviteSectionExpanded }}
            accessibilityLabel={
              inviteSectionExpanded
                ? t('invite.collapse')
                : t('invite.expand')
            }
          >
            <View style={[styles.peopleIconBubble, { backgroundColor: colors.primarySoft }]}>
              <FontAwesome name="user-plus" size={14} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.peopleCardTitle}>{t('invite.title')}</Text>
              {!inviteSectionExpanded ? (
                <Text style={styles.peopleCardSub}>
                  {t('invite.collapsedHint')}
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
                    <FontAwesome name="inbox" size={14} color={colors.warningText} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.peopleCardTitle}>{t('requests.joinTitle')}</Text>
                    <Text style={styles.peopleCardSub}>
                      {t('requests.waitingGrant', { count: joinRequests.length })}
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
                    <Text style={styles.peopleCardTitle}>{t('hands.extraTitle')}</Text>
                    <Text style={styles.peopleCardSub}>
                      {t('hands.extraHint')}
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
              <Text style={styles.peopleCardTitle}>{t('hands.membersTitle')}</Text>
              <Text style={styles.peopleCardSub}>
                {t('hands.membersHint')}
              </Text>
            </View>
          </View>

          {!payoutOrderValidation.valid ? (
            <View style={styles.validationNotice}>
              <Text style={styles.validationTitle}>{t('payoutOrder:review.needsAttention')}</Text>
              {payoutOrderValidation.missingHandIds.length ? (
                <Text style={styles.validationText}>
                  {t('payoutOrder:review.missingCount', {
                    count: payoutOrderValidation.missingHandIds.length,
                  })}
                </Text>
              ) : null}
              {payoutOrderValidation.duplicateHandIds.length ? (
                <Text style={styles.validationText}>
                  {t('payoutOrder:review.duplicateCount', {
                    count: payoutOrderValidation.duplicateHandIds.length,
                  })}
                </Text>
              ) : null}
              {payoutOrderValidation.unknownHandIds.length ? (
                <Text style={styles.validationText}>
                  {t('payoutOrder:review.unknownCount', {
                    count: payoutOrderValidation.unknownHandIds.length,
                  })}
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
                turnOrder={turnOrder}
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

        <View style={styles.peopleCard}>
          <View style={styles.peopleCardHeader}>
            <View style={[styles.peopleIconBubble, { backgroundColor: colors.primarySoft }]}>
              <FontAwesome name="money" size={14} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.peopleCardTitle}>
                {t('setup.paymentInstructions.title')}
              </Text>
              <Text style={styles.peopleCardSub}>
                {hasContributionPaymentInstructions(
                  circle.paymentInstructions,
                  circle.paymentDestinations,
                )
                  ? t('setup.paymentInstructions.membersSee')
                  : t('setup.paymentInstructions.emptyHint')}
              </Text>
            </View>
          </View>
          {renderSetupStepBody('set_contribution_instructions')}
        </View>

        {/* Finish setup + Start Circle */}
        <View style={[styles.peopleCard, styles.peopleStartCard]}>
          <Text style={styles.setupEyebrow}>{t('setup.finish')}</Text>
          <Text style={styles.peopleCardTitle}>{t('setup.startTitle')}</Text>
          <Text style={[styles.peopleCardSub, { marginBottom: 12 }]}>
            {localizeSetupNextAction(t, progress.nextAction) ||
              t('setup.nextAction.fallback')}
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
                <Text style={styles.setupModalTitle}>{t('hands.addAnother')}</Text>
                <Text style={styles.setupModalBody}>
                  {t('hands.modalBody')}
                </Text>
                <Pressable
                  style={styles.setupPrimaryBtn}
                  onPress={handleAddHand}
                  disabled={addingHand}
                  accessibilityRole="button"
                >
                  {addingHand ? (
                    <ActivityIndicator color={colors.onColor} />
                  ) : (
                    <Text style={styles.setupPrimaryBtnText}>
                      {t('hands.requestAnother')}
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.setupModalCancel}
                  onPress={() => setShowHandModal(false)}
                >
                  <Text style={styles.setupModalCancelText}>{t('common.cancel')}</Text>
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
      {memberAgreementCard}

      {/* Invite code */}
      <View style={styles.peopleCard}>
        <View style={styles.setupCodeBlock}>
          <Text style={styles.setupMicroLabel}>{t('invite.circleCode')}</Text>
          <View style={styles.setupCodeRow}>
            <Text
              selectable
              style={styles.setupCodeValue}
              accessibilityLabel={t('invite.codeA11y', {
                code: shortCode || t('common.unavailable'),
              })}
            >
              {shortCode || '-'}
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
                accessibilityLabel={t('invite.copy')}
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
                      t('invite.codeUnavailableTitle'),
                      t('invite.codeUnavailable'),
                    );
                    return;
                  }
                  try {
                    await Share.share({
                      message: t('invite.shareMessage', { code: shortCode }),
                    });
                  } catch {
                    /* cancelled */
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={t('invite.share')}
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
            accessibilityLabel={t('invite.inviteMember')}
          >
            <FontAwesome name="user-plus" size={15} color={colors.onColor} />
            <Text style={styles.setupPrimaryBtnText}>{t('invite.inviteMember')}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Pending requests */}
      {isOrganizer && waitlist.length > 0 ? (
        <View style={styles.peopleCard}>
          <View style={styles.peopleCardHeader}>
            <View style={[styles.peopleIconBubble, { backgroundColor: colors.warningSoft }]}>
              <FontAwesome name="clock-o" size={14} color={colors.warningText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.peopleCardTitle}>{t('requests.pendingTitle')}</Text>
              <Text style={styles.peopleCardSub}>
                {circleNotStarted
                  ? t('requests.waiting', { count: waitlist.length })
                  : t('requests.structureLocked')}
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
                    ? t('hands.extraMeta', {
                        number: m.handNumber ?? m.hand_number ?? 1,
                      })
                    : m.phone || t('requests.joinTitle')}
                </Text>
              </View>
              {circleNotStarted ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    style={styles.setupGhostBtn}
                    onPress={() => handleDecline(m)}
                    disabled={structureMutationBusy}
                    accessibilityRole="button"
                    accessibilityLabel={t('requests.declineA11y', { name: memberName(m) })}
                  >
                    <Text style={[styles.setupGhostBtnText, { color: colors.text }]}>
                      {t('common.decline')}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.setupApproveBtn}
                    onPress={() => handleApprove(m.requestId)}
                    disabled={structureMutationBusy}
                    accessibilityRole="button"
                    accessibilityLabel={t('requests.approveA11y', { name: memberName(m) })}
                  >
                    {approvingId === m.requestId ? (
                      <ActivityIndicator color={colors.onColor} size="small" />
                    ) : (
                      <Text style={styles.setupApproveBtnText}>{t('common.approve')}</Text>
                    )}
                  </Pressable>
                </View>
              ) : (
                <StatusBadge label={t('common.locked')} tone="muted" />
              )}
            </View>
          ))}
        </View>
      ) : null}

      {!isOrganizer && showPendingAdditionalHand ? (
        <View style={styles.peopleCard}>
          <View style={styles.validationNotice}>
            <Text style={styles.validationTitle}>{t('hands.pendingTitle')}</Text>
            <Text style={styles.validationText}>
              {t('hands.pendingBody', { number: pendingAdditionalHandNumber })}
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
            <Text style={styles.peopleCardTitle}>{t('hands.title')}</Text>
            <Text style={styles.peopleCardSub}>
              {formatLocalizedHandsPeople(t, {
                handCount: circle.handCount ?? members.length,
                uniqueMemberCount: circle.uniqueMemberCount,
                fallbackHandCount: members.length,
              })}
              {` · ${circleNotStarted ? t('hands.planned') : t('hands.live')}`}
            </Text>
          </View>
        </View>
        {circleNotStarted ? (
          <Text style={[styles.peopleCardSub, { marginBottom: 8 }]}>
            {t('hands.plannedHint')}
          </Text>
        ) : null}
        {!hasSchedule ? (
          <Text style={[styles.peopleCardSub, { marginBottom: 8 }]}>
            {t('payoutOrder:review.unavailable')}
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
              turnOrder={turnOrder}
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
              metaExtra={hasSchedule ? t('hands.seeRound') : ''}
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
                  <Text style={styles.setupModalTitle}>{t('hands.addAnother')}</Text>
                </View>
                <Text style={styles.setupModalBody}>
                  {t('hands.modalBody')}
                </Text>
                <Pressable
                  style={styles.setupPrimaryBtn}
                  onPress={handleAddHand}
                  disabled={addingHand}
                  accessibilityRole="button"
                >
                  {addingHand ? (
                    <ActivityIndicator color={colors.onColor} />
                  ) : (
                    <Text style={styles.setupPrimaryBtnText}>
                      {t('hands.requestAnother')}
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.setupModalCancel}
                  onPress={() => setShowHandModal(false)}
                >
                  <Text style={styles.setupModalCancelText}>{t('common.cancel')}</Text>
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
            accessibilityLabel={t('hands.requestCircleA11y')}
          >
            <FontAwesome name="plus" size={14} color={colors.primary} />
            <Text style={styles.peopleDashedBtnText}>{t('hands.addAnother')}</Text>
          </Pressable>
        </>
      ) : null}

      {showSetupOrganizerActions ? (
        <View style={[styles.peopleCard, styles.peopleStartCard]}>
          <Text style={styles.peopleCardTitle}>{t('setup.startTitle')}</Text>
          {startBlockReason ? (
            <Text style={[styles.peopleCardSub, { marginBottom: 12 }]}>
              {localizeStartBlockReason(t, startBlockReason)}
            </Text>
          ) : (
            <Text style={[styles.peopleCardSub, { marginBottom: 12 }]}>
              {needsUnclaimedConfirm
                ? t('setup.startBodyUnclaimed')
                : t('setup.startBody')}
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
            accessibilityLabel={t('setup.startTitle')}
            accessibilityState={{ busy: startingCircle, disabled: structureMutationBusy }}
          >
            {startingCircle ? (
              <ActivityIndicator color={colors.onColor} />
            ) : (
              <>
                <FontAwesome name="play" size={14} color={colors.onColor} />
                <Text style={styles.setupPrimaryBtnText}>{t('setup.startAction')}</Text>
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
  const { t, i18n: translation } = useTranslation(['people', 'payoutOrder']);
  const language = translation.resolvedLanguage || translation.language;
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
        accessibilityLabel={t(
          showDetails ? 'hands.collapseA11y' : 'hands.expandA11y',
          { name: display },
        )}
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
                <Text style={styles.peopleRolePillText}>{t('hands.organizerShort')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.compactMemberMeta}>
            {t('hands.count', { count: hands.length })}
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
            {connected ? t('common.connected') : t('common.unclaimed')}
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
                      color: orderIndex >= 0 ? colors.primary : colors.warningText,
                    }}
                  >
                    {orderIndex >= 0 ? formatOrdinal(orderIndex + 1, language) : '-'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.handDetailTitle}>
                    {hand.handLabel ||
                      t('hands.handLabel', {
                        number: hand.handNumber ?? hand.hand_number ?? handIndex + 1,
                      })}
                  </Text>
                  <Text style={styles.handDetailMeta}>
                    {isUnclaimedHand(hand) ? t('hands.awaitingClaim') : t('common.connected')}
                    {orderIndex >= 0
                      ? ` · ${t('payoutOrder:review.position', { position: orderIndex + 1 })}`
                      : ` · ${t('payoutOrder:review.notInOrder')}`}
                  </Text>
                </View>
                {share ? (
                  <Pressable
                    style={styles.handClaimBtn}
                    onPress={() => onShareClaim(hand)}
                    disabled={sharingClaimId === hand.id}
                    accessibilityRole="button"
                    accessibilityLabel={t('hands.claimA11y', { name: memberName(hand) })}
                  >
                    {sharingClaimId === hand.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.handClaimAction}>{t('hands.claim')}</Text>
                    )}
                  </Pressable>
                ) : null}
                {canReorder && payoutRowIndex >= 0 ? (
                  <View style={styles.reorderControls}>
                    <Pressable
                      onPress={() => onReorder(hand.id, 'up')}
                      disabled={Boolean(reorderingId) || payoutRowIndex === 0}
                      accessibilityRole="button"
                      accessibilityLabel={t('payoutOrder:review.moveMemberUp', {
                        name: memberName(hand),
                      })}
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
                      accessibilityLabel={t('payoutOrder:review.moveMemberDown', {
                        name: memberName(hand),
                      })}
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
  const { t } = useTranslation('circleWorkspace');
  const label =
    viewerRole === 'none'
      ? t('access.noMembership')
      : t('access.unavailable');

  return (
    <View style={styles.blockedCard}>
      <FontAwesome name="lock" size={34} color={colors.warning} />
      <Text style={styles.blockedTitle}>{label}</Text>
      <Text style={styles.blockedText}>
        {t('access.message', { circleName })}
      </Text>
      <Pressable
        style={styles.retryButton}
        onPress={() => router.replace(myCirclesHref)}
        accessibilityRole="button"
        accessibilityLabel={t('accessibility.backToCircles')}
      >
        <Text style={styles.retryButtonText}>{t('access.back')}</Text>
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
      return { bg: colors.successSoft, fg: colors.successText };
    case 'action_required':
      return { bg: colors.warningSoft, fg: colors.warningText };
    case 'waiting':
      return { bg: colors.infoSoft, fg: colors.infoText };
    case 'blocked':
      return { bg: colors.surfaceMuted, fg: colors.muted };
    default:
      return { bg: colors.surfaceMuted, fg: colors.muted };
  }
}

function SetupStatusBadge({
  status,
  compact,
}: {
  status: SetupStepStatus;
  compact?: boolean;
}) {
  const { t } = useTranslation('people');
  const tone = setupStatusTone(status);
  const label = compact
    ? status === 'action_required'
      ? t('setup.status.action')
      : status === 'waiting'
        ? t('setup.status.waiting')
        : status === 'complete'
          ? t('setup.status.done')
          : t('setup.status.blocked')
    : status === 'action_required'
      ? t('setup.status.actionRequired')
      : status === 'waiting'
        ? t('setup.status.waiting')
        : status === 'complete'
          ? t('setup.status.complete')
          : t('setup.status.blocked');
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
  const members = Array.isArray(circle.members)
    ? circle.members.filter(
        (member): member is BackendCircleMember =>
          Boolean(member && typeof member === 'object' && typeof member.id === 'string'),
      )
    : [];
  const turnOrder = Array.isArray(circle.turnOrder)
    ? circle.turnOrder.filter((id): id is string => typeof id === 'string')
    : [];
  return [...members].sort((a, b) => {
    const posA = turnOrder.indexOf(a.id);
    const posB = turnOrder.indexOf(b.id);
    return normalizeSortPosition(posA) - normalizeSortPosition(posB);
  });
}

function localizedFrequency(t: TFunction, value: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'weekly' || normalized === 'biweekly' || normalized === 'monthly') {
    return t(`frequency.${normalized}`);
  }
  return capitalizeFrequency(value);
}

function localizeStartBlockReason(t: TFunction, reason: string): string {
  const keys: Record<string, string> = {
    'This circle has already been started or completed.': 'start.block.alreadyStarted',
    'Approve or decline all pending join requests before starting.': 'start.block.pendingJoin',
    'Approve or decline all pending additional-hand requests before starting.':
      'start.block.pendingExtra',
    'A circle needs at least 2 participating hands before it can start.':
      'start.block.minimumHands',
    'The payout order must include every participating hand.': 'start.block.payoutOrder',
  };
  return keys[reason] ? t(keys[reason]) : t('errors.generic');
}

function localizeSetupNextAction(t: TFunction, action: string | null): string | null {
  if (!action) return null;
  const keys: Record<string, string> = {
    'Add planned members so the circle has 2 or more hands.':
      'setup.nextAction.addPlannedMembers',
    'Refresh the circle and share the invite code when it appears.':
      'setup.nextAction.refreshInvite',
    'Approve or decline pending join requests.': 'setup.nextAction.reviewJoins',
    'Add planned members first.': 'setup.nextAction.addMembersFirst',
    'Share claim invites for unclaimed hands, or keep them unclaimed for cash management at Start.':
      'setup.nextAction.shareClaims',
    'Approve or decline Hand 2 / Hand 3 requests.': 'setup.nextAction.reviewExtraHands',
    'Add planned members until there are 2 or more hands.': 'setup.nextAction.addTwoHands',
    'Confirm contribution amount on the circle detail.': 'setup.nextAction.confirmAmount',
    'Add planned hands before ordering payouts.': 'setup.nextAction.addBeforeOrdering',
    'Reorder hands so every participating hand appears exactly once.':
      'setup.nextAction.reorderEveryHand',
    'Review positions, then confirm the payout order in the Start Circle flow.':
      'setup.nextAction.confirmPayout',
    'Complete the payout order structure first.': 'setup.nextAction.completePayout',
    'Review and confirm payout order, then start the circle.':
      'setup.nextAction.reviewThenStart',
    'Start the circle when ready.': 'setup.nextAction.startWhenReady',
    'Set contribution payment instructions so members know where to send money.':
      'setup.nextAction.setContributionInstructions',
  };
  return keys[action] ? t(keys[action]) : t('setup.nextAction.fallback');
}

function formatLocalizedHandsPeople(
  t: TFunction,
  input: {
    handCount?: number | null;
    memberCount?: number | null;
    uniqueMemberCount?: number | null;
    fallbackHandCount?: number;
  },
): string {
  const hands =
    typeof input.handCount === 'number'
      ? input.handCount
      : typeof input.memberCount === 'number'
        ? input.memberCount
        : Number(input.fallbackHandCount || 0);
  const people =
    typeof input.uniqueMemberCount === 'number' ? input.uniqueMemberCount : null;
  const handLabel = t('hands.count', { count: hands });
  return people === null
    ? handLabel
    : t('hands.metrics', {
        hands: handLabel,
        people: t('hands.peopleCount', { count: people }),
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
  t?: TFunction,
): ContributionStatusView {
  const raw = String(contribution?.status || 'due').toLowerCase();
  if (
    raw !== 'confirmed' &&
    hasConfirmedFundingRecord(wallet, ledgerEntries, memberId, roundNumber)
  ) {
    return {
      label: t
        ? contributionStatusLabel('confirmed', t)
        : 'Confirmed',
      raw: 'confirmed',
    };
  }
  const canonical = [
    'confirmed',
    'submitted',
    'late',
    'missed',
    'rejected',
    'pending',
  ].includes(raw)
    ? raw
    : 'due';
  return {
    label: t
      ? contributionStatusLabel(canonical, t)
      : capitalizeFrequency(canonical),
    raw: canonical,
  };
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

/**
 * Prefer backend lifecycle / SusuRule messages (e.g. 409) over generic copy.
 */
function financialActionErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message && message.toLowerCase() !== 'something went wrong') {
      return message;
    }
  }
  return fallback;
}

function formatProgress(progress: number | null) {
  return typeof progress === 'number' && Number.isFinite(progress)
    ? `${Math.max(0, Math.min(100, progress))}%`
    : '-';
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
  if (!value) return '-';
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

function frequencyDisplayLabel(value: string, t: TFunction) {
  const normalized = value.toLowerCase().replace(/[-_\s]/g, '');
  const key =
    normalized === 'biweekly'
      ? 'biweekly'
      : normalized === 'monthly'
        ? 'monthly'
        : 'weekly';
  return t(`createCircle:frequency.options.${key}`);
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
    backgroundColor: colors.primarySoft,
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
    color: colors.successText,
  },
  peopleAccessPillTextOff: {
    color: colors.warningText,
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
    borderColor: colors.warningBorder,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  validationTitle: {
    color: colors.warningText,
    fontSize: 13,
    fontWeight: '900',
  },
  validationText: {
    color: colors.warningText,
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
  screen: { flex: 1, backgroundColor: colors.background },
  workspaceShell: {
    flex: 1,
    minHeight: 0,
  },
  workspaceHeaderPad: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 18,
  },
  workspaceLoadError: {
    marginHorizontal: spacing.screenX,
    marginTop: 8,
  },
  workspaceBody: {
    flex: 1,
    minHeight: 0,
  },
  chatChrome: {
    paddingHorizontal: spacing.screenX,
  },
  chatPanel: {
    flex: 1,
    minHeight: 0,
    marginTop: 12,
    paddingHorizontal: spacing.screenX,
    paddingBottom: 4,
  },
  chatPanelKeyboardOpen: {
    marginTop: 0,
    paddingBottom: 0,
  },
  chatHidden: {
    display: 'none',
  },
  content: {
    paddingBottom: 100,
    paddingHorizontal: spacing.screenX,
    paddingTop: 18,
  },
  contentUnderShell: {
    paddingBottom: 100,
    paddingHorizontal: spacing.screenX,
    paddingTop: 8,
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
    color: colors.onColor,
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
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorderMuted,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inlineErrorText: {
    color: colors.warningText,
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
  organizerTools: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  organizerTool: {
    flex: 1,
    minHeight: 70,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    ...shadows.small,
  },
  assistantTool: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  organizerToolPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  organizerToolIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantToolIcon: {
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  organizerToolText: { flex: 1 },
  organizerToolTitle: {
    color: colors.textStrong,
    fontSize: 12,
    fontWeight: '900',
  },
  assistantToolTitle: { color: colors.onColor },
  organizerToolCopy: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 3,
  },
  assistantToolCopy: { color: 'rgba(255,255,255,0.62)' },
  tab: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  tabIcon: {
    position: 'relative',
  },
  chatUnreadBadge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderColor: colors.onColor,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    minHeight: 16,
    minWidth: 16,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -11,
    top: -8,
  },
  chatUnreadBadgeText: {
    color: colors.onColor,
    fontSize: 8,
    fontWeight: '900',
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
    color: colors.onColor,
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
  paymentRosterCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  paymentRosterHeader: {
    alignItems: 'center',
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  paymentRosterHeading: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 11,
  },
  paymentRosterIcon: {
    alignItems: 'center',
    backgroundColor: colors.successSoft,
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  paymentRosterTitle: {
    color: colors.textStrong,
    fontSize: 17,
    fontWeight: '900',
  },
  paymentRosterSummary: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  paymentRosterToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginLeft: 10,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  paymentRosterToggleText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  paymentRosterList: {
    paddingHorizontal: 14,
  },
  paymentRosterRow: {
    paddingVertical: 14,
  },
  paymentRosterRowSeparated: {
    borderTopColor: colors.cardBorder,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  paymentRosterMemberLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
  },
  paymentRosterMember: {
    alignItems: 'flex-start',
    flex: 1,
  },
  paymentRosterMemberName: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: '800',
  },
  paymentRosterStatus: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  paymentRosterStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  paymentRosterAmount: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: '900',
  },
  paymentRosterDetails: {
    backgroundColor: colors.background,
    borderRadius: 12,
    gap: 3,
    marginLeft: 53,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  paymentRosterDetailText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  paymentRosterActions: {
    gap: 8,
    marginLeft: 53,
    marginTop: 11,
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
    backgroundColor: colors.surfaceMuted,
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
  scheduleRow: {
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  scheduleRowCompleted: {
    backgroundColor: colors.background,
  },
  scheduleRowCurrent: {
    backgroundColor: colors.primarySoft,
    borderLeftColor: colors.primary,
    borderLeftWidth: 4,
    paddingLeft: 12,
  },
  scheduleRowUpcoming: {
    backgroundColor: colors.card,
  },
  scheduleRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scheduleRoundBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  scheduleRoundBadgeText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  scheduleStatusPill: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  scheduleStatusCompleted: {
    backgroundColor: colors.successSoft,
  },
  scheduleStatusCurrent: {
    backgroundColor: colors.primarySoft,
  },
  scheduleStatusUpcoming: {
    backgroundColor: colors.surfaceMuted,
  },
  scheduleStatusText: {
    fontSize: 10,
    fontWeight: '900',
  },
  schedulePrimaryRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
  },
  scheduleRecipient: {
    flex: 1,
    minWidth: 0,
  },
  scheduleDate: {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: '44%',
  },
  scheduleFieldLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  scheduleRecipientName: {
    color: colors.textStrong,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 21,
  },
  scheduleRecipientNameCompleted: {
    color: colors.text,
  },
  scheduleDateValue: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
    textAlign: 'right',
  },
  scheduleDateValueCurrent: {
    color: colors.primaryDark,
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
    backgroundColor: colors.surfaceMuted,
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
    color: colors.onColor,
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
    color: colors.onColor,
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
    color: colors.onColor,
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
    backgroundColor: colors.warningSoft,
  },
  statusBadge_success: {
    backgroundColor: colors.successSoft,
  },
  statusBadge_warning: {
    backgroundColor: colors.dangerSoft,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '900',
  },
  statusBadgeText_muted: {
    color: colors.primaryDark,
  },
  statusBadgeText_soft: {
    color: colors.onColor,
  },
  statusBadgeText_ready: {
    color: colors.warningText,
  },
  statusBadgeText_success: {
    color: colors.successText,
  },
  statusBadgeText_warning: {
    color: colors.dangerText,
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
    color: colors.onColor,
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
    color: colors.onColor,
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
    color: colors.onColor,
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
    color: colors.onColor,
    fontSize: 15,
    fontWeight: '900',
  },
  actionList: {
    gap: 10,
    marginTop: 12,
  },
  actionRow: {
    backgroundColor: colors.background,
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
    color: colors.onColor,
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
  memberDueAmount: {
    color: colors.textStrong,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },
  memberHandRow: {
    paddingVertical: 10,
  },
  memberHandRowDivider: {
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
  },
  memberHandCopy: {
    gap: 4,
  },
  memberHandTitleRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  memberHandTitle: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  memberHandAmount: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: '800',
  },
  memberHandStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 44,
  },
  memberHandStatusCopy: {
    flex: 1,
  },
  memberHandMeta: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  memberHandSecondary: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  memberDisclosure: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  memberEducation: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 4,
  },
  memberHandInlineButton: {
    alignItems: 'center',
    borderColor: colors.primary,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
  },
  memberHandInlineButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  memberHandTextAction: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
    paddingRight: 8,
  },
  memberHandTextActionLabel: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  saveButtonDisabled: {
    opacity: 0.6,
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
    backgroundColor: colors.card,
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
    color: colors.onColor,
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
    color: colors.onColor,
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
    color: colors.warningText,
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
