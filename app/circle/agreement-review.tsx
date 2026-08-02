import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  acceptCircleAgreement,
  finalizeCircleAgreementSnapshot,
  getCircleAgreementReadiness,
  getCircleAgreementContent,
  getCircleAgreementSnapshot,
  getCircleDetail,
  startCircle,
  type BackendCircleDetail,
  type CircleAgreementReadiness,
  type CircleAgreementContent,
  type CircleAgreementSnapshot,
} from '@/lib/api';
import {
  canEnableOrganizerStart,
  canSubmitAgreementAcceptance,
  getAgreementReadinessStatusKeys,
  memberHasAcceptedCurrentSnapshot,
  normalizeAgreementLanguage,
  orderedSnapshotHands,
  ownedAgreementHands,
  shouldRefreshStaleSnapshot,
  snapshotServiceFeeCents,
} from '@/lib/circleAgreements';
import { useAuthSession } from '@/lib/authContext';
import { formatCurrency, formatDateTime } from '@/lib/i18n/formatters';
import { circleWorkspaceHref } from '@/lib/navigation';
import { colors, radii, shadows, spacing } from '@/lib/theme';

type DocumentType =
  | 'circle_participation_agreement'
  | 'final_circle_snapshot'
  | 'organizer_agreement';

export default function CircleAgreementReviewScreen() {
  const { t, i18n } = useTranslation('agreements');
  const { session } = useAuthSession();
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = Array.isArray(params.circleId) ? params.circleId[0] : params.circleId;
  const token = session?.session.token;
  const userId = session?.user.id ?? '';
  const language = normalizeAgreementLanguage(i18n.resolvedLanguage || i18n.language);
  const [circle, setCircle] = useState<BackendCircleDetail | null>(null);
  const [snapshot, setSnapshot] = useState<CircleAgreementSnapshot | null>(null);
  const [readiness, setReadiness] = useState<CircleAgreementReadiness | null>(null);
  const [content, setContent] = useState<CircleAgreementContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<DocumentType | 'finalize' | 'start' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [participantChecked, setParticipantChecked] = useState(false);
  const [snapshotChecked, setSnapshotChecked] = useState(false);
  const [organizerChecked, setOrganizerChecked] = useState(false);
  const [startPayoutChecked, setStartPayoutChecked] = useState(false);
  const [startUnclaimedChecked, setStartUnclaimedChecked] = useState(false);

  const load = useCallback(async () => {
    if (!token || !circleId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [detail, agreementContent] = await Promise.all([
        getCircleDetail(token, circleId),
        getCircleAgreementContent(token),
      ]);
      setCircle(detail);
      setContent(agreementContent);
      try {
        const [nextSnapshot, nextReadiness] = await Promise.all([
          getCircleAgreementSnapshot(token, circleId),
          getCircleAgreementReadiness(token, circleId),
        ]);
        setSnapshot(nextSnapshot);
        setReadiness(nextReadiness);
      } catch (requestError) {
        if (requestError && typeof requestError === 'object' && 'status' in requestError && requestError.status === 404) {
          setSnapshot(null);
          setReadiness(null);
        } else {
          throw requestError;
        }
      }
    } catch (requestError) {
      console.error('Unable to load circle agreement review', requestError);
      setError(t('genericError'));
    } finally {
      setLoading(false);
    }
  }, [circleId, t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOrganizer = Boolean(
    snapshot ? snapshot.organizerUserId === userId : circle?.userRole === 'organizer',
  );
  const ownedHands = useMemo(
    () => (snapshot ? ownedAgreementHands(snapshot, userId) : []),
    [snapshot, userId],
  );
  const payoutOrderHands = useMemo(
    () => (snapshot ? orderedSnapshotHands(snapshot) : []),
    [snapshot],
  );
  const isParticipant = ownedHands.length > 0;
  const memberAccepted = Boolean(
    snapshot && memberHasAcceptedCurrentSnapshot(snapshot, userId),
  );
  // Prefer backend-authoritative confirmation flag; fall back to snapshot hands.
  const requiresUnclaimedHandConfirmation = Boolean(
    readiness?.requiresUnclaimedHandConfirmation ??
      snapshot?.hands.some((hand) => !hand.userId),
  );
  const readinessStatusKeys = useMemo(
    () => getAgreementReadinessStatusKeys({ readiness, isOrganizer }),
    [isOrganizer, readiness],
  );
  const canStart = canEnableOrganizerStart({
    readiness,
    startPayoutChecked,
    startUnclaimedChecked,
    busy: Boolean(busy),
  });
  const memberFacing = isParticipant && !isOrganizer;

  async function finalize() {
    if (!token || !circleId || busy) return;
    setBusy('finalize');
    setError(null);
    try {
      await finalizeCircleAgreementSnapshot(token, circleId);
      await load();
    } catch (requestError) {
      console.error('Unable to finalize circle agreement snapshot', requestError);
      setError(t('genericError'));
    } finally {
      setBusy(null);
    }
  }

  async function accept(documentType: DocumentType) {
    if (!token || !circleId || !snapshot || busy) return;
    const documentVersion = snapshot.agreementVersions[documentType];
    if (!documentVersion) {
      setError(t('genericError'));
      return;
    }
    setBusy(documentType);
    setError(null);
    try {
      await acceptCircleAgreement(token, circleId, {
        snapshotId: snapshot.id,
        snapshotHash: snapshot.snapshotHash,
        documentType,
        documentVersion,
        accepted: true,
        language,
        clientIdentifier: 'circusave-expo-mobile-v1',
      });
      if (documentType === 'circle_participation_agreement') setParticipantChecked(false);
      if (documentType === 'final_circle_snapshot') setSnapshotChecked(false);
      if (documentType === 'organizer_agreement') setOrganizerChecked(false);
      await load();
    } catch (requestError) {
      console.error('Unable to accept circle agreement', requestError);
      setError(shouldRefreshStaleSnapshot(requestError) ? t('stale') : t('genericError'));
      if (shouldRefreshStaleSnapshot(requestError)) await load();
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    if (!token || !circleId || !snapshot || busy) return;
    setBusy('start');
    setError(null);
    try {
      await startCircle(token, circleId, {
        confirmPayoutOrder: startPayoutChecked,
        confirmUnclaimedHands: requiresUnclaimedHandConfirmation
          ? startUnclaimedChecked
          : false,
        snapshotId: snapshot.id,
        snapshotHash: snapshot.snapshotHash,
        language,
      });
      Alert.alert(t('started'));
      router.replace(circleWorkspaceHref(circleId));
    } catch (requestError) {
      console.error('Unable to start circle with agreement evidence', requestError);
      setError(shouldRefreshStaleSnapshot(requestError) ? t('stale') : t('genericError'));
      if (shouldRefreshStaleSnapshot(requestError)) await load();
    } finally {
      setBusy(null);
    }
  }

  const money = (cents: number) => formatCurrency(cents / 100, language, snapshot?.currency || 'USD', 2);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => (circleId ? router.replace(circleWorkspaceHref(circleId, 'people')) : router.back())} accessibilityRole="button">
            <FontAwesome name="chevron-left" size={24} color={colors.textStrong} />
          </Pressable>
          <Text style={styles.title}>{memberFacing ? t('titleMember') : t('title')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? <ActivityIndicator color={colors.primary} size="large" /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && !snapshot ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('missingTitle')}</Text>
            <Text style={styles.body}>{memberFacing || (!isOrganizer) ? t('missingBodyMember') : t('missingBody')}</Text>
            {isOrganizer ? (
              <ActionButton label={t('finalize')} disabled={Boolean(busy)} onPress={() => void finalize()} />
            ) : null}
          </View>
        ) : null}

        {snapshot ? (
          <>
            <View style={styles.card}>
              <Text style={styles.version}>{t('snapshotVersion', { version: snapshot.snapshotVersion })}</Text>
              <Text style={styles.version} selectable>
                {t('snapshotHash', { hash: snapshot.snapshotHash })}
              </Text>
              {!snapshot.structureCurrent ? <Text style={styles.blocker}>{t('stale')}</Text> : null}
              {memberAccepted ? <Text style={styles.success}>✓ {t('acceptedBoth')}</Text> : null}
            </View>

            <View style={styles.card}>
              <Metric label={t('contributionPerHand')} value={money(snapshot.memberReview.contributionPerHandCents)} />
              <Metric label={t('frequency')} value={snapshot.frequency} />
              <Metric label={t('totalRounds')} value={String(snapshot.totalRounds)} />
              <Metric label={t('recurringTotal')} value={money(snapshot.memberReview.currentRecurringObligationCents)} />
              <Metric label={t('estimatedTotal')} value={money(snapshot.memberReview.estimatedTotalObligationCents)} />
              <Metric label={t('serviceFee')} value={money(snapshotServiceFeeCents(snapshot))} />
              <Metric label={t('organizerParticipates')} value={snapshot.organizerParticipates ? t('yes') : t('no')} />
            </View>

            {isParticipant ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('yourHandsTitle')}</Text>
                <Text style={styles.body}>{t('yourHandsHint')}</Text>
                {ownedHands.map((hand) => (
                  <View style={styles.handBlock} key={hand.handId}>
                    <Text style={styles.handTitle}>{t('handTitle', { number: hand.handNumber })}</Text>
                    <Text style={styles.body}>{t('payoutPosition', { position: hand.payoutPosition })}</Text>
                    <Text style={styles.body}>
                      {t('expectedPayout', {
                        date: hand.expectedPayoutDate
                          ? formatDateTime(hand.expectedPayoutDate, language)
                          : '—',
                      })}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('finalOrderTitle')}</Text>
              {payoutOrderHands.map((hand) => (
                <Text style={styles.body} key={`order-${hand.handId}`}>
                  {t('finalOrderRow', {
                    position: hand.payoutPosition,
                    number: hand.handNumber,
                    suffix: hand.userId === userId ? t('finalOrderYours') : '',
                  })}
                  {hand.expectedPayoutDate
                    ? ` · ${formatDateTime(hand.expectedPayoutDate, language)}`
                    : ''}
                </Text>
              ))}
            </View>

            {isParticipant ? (
              <AgreementCard
                title={t('participantTitle')}
                body={`${content?.documents.circle_participation_agreement?.body[language] || ''}\n\n${t('participantBody')}`.trim()}
                checkLabel={t('participantCheck')} buttonLabel={t('participantAccept')}
                checked={participantChecked} setChecked={setParticipantChecked}
                accepted={snapshot.alreadyAccepted.circleParticipationAgreement}
                disabled={!canSubmitAgreementAcceptance({ checked: participantChecked, submitting: Boolean(busy), structureCurrent: snapshot.structureCurrent, alreadyAccepted: snapshot.alreadyAccepted.circleParticipationAgreement })}
                acceptedLabel={t('accepted')}
                onPress={() => void accept('circle_participation_agreement')}
              />
            ) : null}

            {(isParticipant || isOrganizer) ? (
              <AgreementCard
                title={t('snapshotTitle')} body={t('snapshotBody')}
                checkLabel={t('snapshotCheck')} buttonLabel={t('snapshotAccept')}
                checked={snapshotChecked} setChecked={setSnapshotChecked}
                accepted={snapshot.alreadyAccepted.finalCircleSnapshot}
                disabled={!canSubmitAgreementAcceptance({ checked: snapshotChecked, submitting: Boolean(busy), structureCurrent: snapshot.structureCurrent, alreadyAccepted: snapshot.alreadyAccepted.finalCircleSnapshot })}
                acceptedLabel={t('accepted')}
                onPress={() => void accept('final_circle_snapshot')}
              />
            ) : null}

            {isOrganizer ? (
              <AgreementCard
                title={t('organizerTitle')}
                body={`${content?.documents.organizer_agreement?.body[language] || ''}\n\n${t('organizerBody')}`.trim()}
                checkLabel={t('organizerCheck')} buttonLabel={t('organizerAccept')}
                checked={organizerChecked} setChecked={setOrganizerChecked}
                accepted={snapshot.alreadyAccepted.organizerAgreement}
                disabled={!canSubmitAgreementAcceptance({ checked: organizerChecked, submitting: Boolean(busy), structureCurrent: snapshot.structureCurrent, alreadyAccepted: snapshot.alreadyAccepted.organizerAgreement })}
                acceptedLabel={t('accepted')}
                onPress={() => void accept('organizer_agreement')}
              />
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('readinessTitle')}</Text>
              {readiness?.agreementsComplete ? (
                <Text style={styles.success}>
                  {memberFacing ? t('readyMember') : t('ready')}
                </Text>
              ) : (
                <Text style={styles.body}>{t('notReady')}</Text>
              )}
              {readinessStatusKeys.map((key) => {
                const isCompleteLine = key === 'statusAgreementsComplete';
                const isConfirmationLine =
                  key === 'blockerPayoutOrderConfirmation' ||
                  key === 'blockerUnclaimedHandConfirmation';
                // Members never see organizer-only confirmation copy.
                if (!isOrganizer && isConfirmationLine) return null;
                // When agreements are complete, the success line above covers it.
                if (readiness?.agreementsComplete && isCompleteLine) return null;
                return (
                  <Text
                    style={isCompleteLine ? styles.success : styles.blocker}
                    key={key}
                  >
                    • {t(key)}
                  </Text>
                );
              })}
            </View>

            {isOrganizer ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('startTitle')}</Text>
                {readiness?.canOpenStartFlow ? (
                  <>
                    <ConsentRow
                      checked={startPayoutChecked}
                      onPress={() => setStartPayoutChecked((value) => !value)}
                      label={t('startPayoutCheck')}
                    />
                    {requiresUnclaimedHandConfirmation ? (
                      <ConsentRow
                        checked={startUnclaimedChecked}
                        onPress={() => setStartUnclaimedChecked((value) => !value)}
                        label={t('startUnclaimedCheck')}
                      />
                    ) : null}
                    <ActionButton
                      label={t('start')}
                      disabled={!canStart}
                      onPress={() => void start()}
                    />
                  </>
                ) : (
                  <Text style={styles.body}>{t('startBlockedUntilAgreements')}</Text>
                )}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function ConsentRow({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable style={styles.consentRow} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked ? <FontAwesome name="check" size={13} color="#fff" /> : null}</View>
      <Text style={styles.consentLabel}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable style={[styles.button, disabled && styles.buttonDisabled]} disabled={disabled} onPress={onPress} accessibilityRole="button"><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

function AgreementCard(props: {
  title: string; body: string; checkLabel: string; buttonLabel: string; checked: boolean;
  setChecked: (value: boolean) => void; accepted: boolean; acceptedLabel: string;
  disabled: boolean; onPress: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{props.title}</Text>
      <Text style={styles.body}>{props.body}</Text>
      {props.accepted ? <Text style={styles.success}>✓ {props.acceptedLabel}</Text> : (
        <>
          <ConsentRow checked={props.checked} onPress={() => props.setChecked(!props.checked)} label={props.checkLabel} />
          <ActionButton label={props.buttonLabel} disabled={props.disabled} onPress={props.onPress} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenX, paddingBottom: 48, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  headerSpacer: { width: 24 },
  title: { fontSize: 23, fontWeight: '800', color: colors.textStrong },
  card: { backgroundColor: colors.card, borderRadius: radii.card, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing.card, gap: 12, ...shadows.small },
  version: { color: colors.muted, fontSize: 13 },
  cardTitle: { color: colors.textStrong, fontSize: 18, fontWeight: '800' },
  body: { color: colors.text, lineHeight: 21 },
  handBlock: { gap: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cardBorder },
  handTitle: { color: colors.textStrong, fontWeight: '800', fontSize: 16 },
  metric: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  metricLabel: { flex: 1, color: colors.muted },
  metricValue: { color: colors.textStrong, fontWeight: '700', textAlign: 'right' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 6 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.primary },
  consentLabel: { flex: 1, color: colors.text, lineHeight: 20 },
  button: { backgroundColor: colors.primary, borderRadius: radii.control, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  success: { color: colors.success, fontWeight: '700', lineHeight: 20 },
  blocker: { color: colors.danger, fontWeight: '600' },
  error: { color: colors.danger, backgroundColor: '#FEE2E2', padding: 12, borderRadius: 12 },
});
