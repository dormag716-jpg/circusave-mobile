import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';

const isStripeSupported = Platform.OS !== 'web' && Constants.appOwnership !== 'expo';

import {
  createPaymentIntent,
  getCircleDetail,
  getCircleSchedule,
  submitContribution,
  type BackendCircleDetail,
  type BackendCircleMember,
  type BackendRoundContribution,
  type BackendRoundSnapshot,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { circleWorkspaceHref } from '@/lib/navigation';
import { colors, radii, spacing } from '@/lib/theme';

export default function ContributionPaymentScreen() {
  const { session } = useAuthSession();
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;
  const token = session?.session.token;
  const userId = session?.user.id;

  const [circle, setCircle] = useState<BackendCircleDetail | null>(null);
  const [snapshot, setSnapshot] = useState<BackendRoundSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [payingStripe, setPayingStripe] = useState(false);
  const stripe = useStripe();

  async function loadContribution() {
    if (!token || !circleId) {
      setError('Missing token or circle ID.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [circleResponse, scheduleResponse] = await Promise.all([
        getCircleDetail(token, circleId),
        getCircleSchedule(token, circleId),
      ]);
      setCircle(circleResponse);
      setSnapshot(scheduleResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load contribution details.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadContribution();
  }, [circleId, token]);

  const viewerHands = findViewerHands(circle, userId, snapshot);
  const amountPerHand = circle?.contributionAmount ?? 0;
  const totalOwedPerRound =
    circle?.viewerContributionSummary?.totalOwedPerRound ??
    amountPerHand * viewerHands.length;
  const recipient = findRecipient(circle, snapshot);
  const currentRound =
    snapshot?.currentRoundSummary?.roundNumber ??
    snapshot?.roundWorkspace?.currentRoundNumber ??
    snapshot?.currentRound ??
    circle?.currentRound;

  const dueHands = viewerHands.filter((hand) =>
    ['due', 'missed', 'rejected'].includes(hand.status),
  );
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);
  const activeHandId =
    selectedHandId && dueHands.some((h) => h.id === selectedHandId)
      ? selectedHandId
      : dueHands[0]?.id ?? viewerHands[0]?.id ?? null;
  const activeHand = viewerHands.find((h) => h.id === activeHandId);
  const statusLabel = contributionStatusLabel(
    activeHand
      ? { memberId: activeHand.id, round: currentRound ?? 0, status: activeHand.status }
      : undefined,
  );
  const canSubmit = Boolean(
    activeHand && ['due', 'missed', 'rejected'].includes(activeHand.status),
  );

  async function handleSubmitContribution() {
    if (!token || !circle || !activeHand) {
      Alert.alert('Contribution unavailable', 'Unable to identify your hand.');
      return;
    }

    setSubmitting(true);
    try {
      await submitContribution(token, circle.id, activeHand.id);
      Alert.alert(
        'Contribution submitted',
        `${activeHand.label}: payment is waiting for organizer confirmation.`,
        [
          {
            text: 'OK',
            onPress: () => void loadContribution(),
          },
        ],
      );
    } catch (submitError) {
      Alert.alert(
        'Unable to submit contribution',
        submitError instanceof Error
          ? submitError.message
          : 'The backend rejected the contribution.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStripePayment() {
    if (!token || !circle || !activeHand || currentRound == null) return;
    setPayingStripe(true);
    try {
      const { clientSecret } = await createPaymentIntent(
        token,
        circle.id,
        currentRound,
        circle.contributionAmount,
        activeHand.id,
      );

      const { error: initError } = await stripe.initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'CircuSave',
        returnURL: 'circusave://stripe-redirect',
      });

      if (initError) throw initError;

      const { error: presentError } = await stripe.presentPaymentSheet();
      if (presentError) {
        if (presentError.code === 'Canceled') {
          return;
        }
        throw presentError;
      }

      Alert.alert(
        'Payment successful',
        `${activeHand.label}: payment processed and awaits server confirmation.`,
        [{ text: 'OK', onPress: () => void loadContribution() }],
      );
    } catch (err: any) {
      Alert.alert('Payment Failed', err.message || 'Unable to complete Stripe payment.');
    } finally {
      setPayingStripe(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.statusCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.statusText}>Loading contribution details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !circle) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.statusCard}>
          <FontAwesome name="warning" size={32} color={colors.warning} />
          <Text style={styles.statusTitle}>Contribution unavailable</Text>
          <Text style={styles.statusText}>
            {error ?? 'The backend did not return this circle.'}
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => void loadContribution()}
            accessibilityRole="button"
            accessibilityLabel="Retry contribution"
          >
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
          {circleId ? (
            <Pressable
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primarySoft, marginTop: 12 },
              ]}
              onPress={() => router.replace(circleWorkspaceHref(circleId))}
              accessibilityRole="button"
              accessibilityLabel="Back to workspace"
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: colors.primaryDark },
                ]}
              >
                Back to workspace
              </Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.replace(circleWorkspaceHref(circle.id))}
            accessibilityRole="button"
            accessibilityLabel="Back to circle workspace"
          >
            <FontAwesome name="angle-left" size={24} color={colors.primaryDark} />
          </Pressable>
          <View>
            <Text style={styles.kicker}>Pay Contribution</Text>
            <Text style={styles.title}>{circle.name}</Text>
          </View>
        </View>

        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>
            {viewerHands.length > 1 ? 'Total Due This Round' : 'Contribution Due'}
          </Text>
          <Text style={styles.amountText}>
            {formatMoney(
              dueHands.length > 0
                ? amountPerHand * dueHands.length
                : totalOwedPerRound,
            )}
          </Text>
          <Text style={styles.amountBody}>
            {viewerHands.length > 1
              ? `${formatMoney(amountPerHand)} per hand · ${viewerHands.length} hands · Round ${formatRound(currentRound)}`
              : `${capitalize(circle.frequency)} contribution for Round ${formatRound(currentRound)}`}
          </Text>
        </View>

        {viewerHands.length > 0 ? (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>Your hands</Text>
            {viewerHands.map((hand) => {
              const selected = hand.id === activeHandId;
              const due = ['due', 'missed', 'rejected'].includes(hand.status);
              return (
                <Pressable
                  key={hand.id}
                  style={[
                    styles.handRow,
                    selected && styles.handRowSelected,
                    !due && styles.handRowSettled,
                  ]}
                  onPress={() => setSelectedHandId(hand.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${hand.label}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.handTitle}>{hand.label}</Text>
                    <Text style={styles.handMeta}>
                      {formatMoney(amountPerHand)} · {contributionStatusLabel({
                        memberId: hand.id,
                        round: currentRound ?? 0,
                        status: hand.status,
                      })}
                    </Text>
                  </View>
                  {selected ? (
                    <FontAwesome name="check-circle" size={18} color={colors.primary} />
                  ) : null}
                </Pressable>
              );
            })}
            <Text style={styles.handHint}>
              Pay one hand at a time. Paying one hand never covers another.
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.iconBox}>
            <FontAwesome name="user" size={18} color={colors.primary} />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardLabel}>Recipient</Text>
            <Text style={styles.cardTitle}>{memberName(recipient)}</Text>
            <Text style={styles.cardBody}>
              Round {formatRound(currentRound)} payout recipient
            </Text>
          </View>
        </View>

        <View style={styles.reviewCard}>
          <Text style={styles.reviewTitle}>Review</Text>
          <ReviewRow label="Circle" value={circle.name} />
          <ReviewRow label="Round" value={formatRound(currentRound)} />
          <ReviewRow
            label="Selected hand"
            value={activeHand?.label ?? '—'}
          />
          <ReviewRow
            label="Amount for hand"
            value={formatMoney(amountPerHand)}
          />
          <ReviewRow label="Status" value={statusLabel} />
        </View>

        {viewerHands.length === 0 ? (
          <Text style={styles.unavailableText}>
            Your active hands were not found for this circle.
          </Text>
        ) : null}

        {isStripeSupported ? (
          <Pressable
            style={[
              styles.primaryButton,
              (!canSubmit || payingStripe || submitting) && styles.disabledButton,
            ]}
            disabled={!canSubmit || payingStripe || submitting}
            onPress={() => void handleStripePayment()}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>
              {payingStripe ? 'Processing...' : 'Pay with Stripe'}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[
            isStripeSupported ? styles.secondaryButton : styles.primaryButton,
            (!canSubmit || payingStripe || submitting) && styles.disabledButton,
          ]}
          disabled={!canSubmit || payingStripe || submitting}
          onPress={() => void handleSubmitContribution()}
          accessibilityRole="button"
          accessibilityLabel="Submit contribution"
        >
          <Text style={isStripeSupported ? styles.secondaryButtonText : styles.primaryButtonText}>
            {submitting ? 'Submitting...' : isStripeSupported ? 'Confirm Manual Payment' : (canSubmit ? 'Submit Contribution' : statusLabel)}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

type ViewerHandRow = {
  id: string;
  label: string;
  handNumber: number;
  status: string;
};

function findViewerHands(
  circle: BackendCircleDetail | null,
  userId?: string,
  snapshot?: BackendRoundSnapshot | null,
): ViewerHandRow[] {
  if (!circle || !userId) {
    return [];
  }

  const fromDetail =
    circle.viewerHands && circle.viewerHands.length > 0
      ? circle.viewerHands
      : circle.members.filter((member) => member.userId === userId);

  const multi = fromDetail.length > 1;
  return fromDetail
    .map((member) => {
      const handNumber = Number(member.handNumber ?? member.hand_number ?? 1);
      const base =
        member.displayLabel ||
        member.full_name ||
        member.name ||
        'Your hand';
      const label =
        multi && !String(base).includes('Hand')
          ? `${base} · Hand ${handNumber}`
          : base;
      const contribution = snapshot?.contributions?.find(
        (entry) => entry.memberId === member.id,
      );
      return {
        id: member.id,
        label,
        handNumber,
        status: String(contribution?.status || 'due').toLowerCase(),
      };
    })
    .sort((a, b) => a.handNumber - b.handNumber);
}

function findRecipient(
  circle: BackendCircleDetail | null,
  snapshot: BackendRoundSnapshot | null,
) {
  const recipientId =
    snapshot?.currentRoundSummary?.recipientMemberId ??
    snapshot?.roundWorkspace?.currentRecipientMemberId ??
    circle?.currentRoundSummary?.recipientMemberId;
  return circle?.members.find((member) => member.id === recipientId);
}

function contributionStatusLabel(contribution?: BackendRoundContribution) {
  const status = String(contribution?.status || 'unavailable').toLowerCase();
  if (status === 'due') return 'Due';
  if (status === 'submitted') return 'Pending organizer confirmation';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'late') return 'Submitted late';
  if (status === 'missed') return 'Missed';
  if (status === 'rejected') return 'Rejected';
  return 'Unavailable';
}

function memberName(member: BackendCircleMember | undefined) {
  return member?.full_name || member?.name || 'Unavailable';
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatRound(round?: number) {
  return typeof round === 'number' && Number.isFinite(round) ? String(round) : '-';
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  handRow: {
    borderColor: colors.cardBorder,
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  handRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  handRowSettled: {
    opacity: 0.72,
  },
  handTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  handMeta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  handHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
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
  amountCard: {
    backgroundColor: colors.primary,
    borderRadius: 30,
    padding: 22,
  },
  cardLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  amountLabel: {
    color: '#ddd6fe',
    fontSize: 13,
    fontWeight: '900',
  },
  amountText: {
    color: '#ffffff',
    fontSize: 46,
    fontWeight: '900',
    marginTop: 8,
  },
  amountBody: {
    color: '#ede9fe',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 5,
  },
  cardBody: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 5,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    padding: spacing.card,
  },
  iconBox: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  reviewCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 16,
    padding: spacing.card,
  },
  reviewTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  reviewRow: {
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
    paddingVertical: 13,
  },
  reviewLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  reviewValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    height: 56,
    justifyContent: 'center',
    marginTop: 32,
    width: '100%',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: colors.primary,
    borderRadius: radii.control,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    marginTop: 16,
    width: '100%',
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.55,
  },
  unavailableText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 14,
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
