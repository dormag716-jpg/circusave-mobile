import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getPublicInvitePreview,
  requestJoin,
  type BackendInvitePreview,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { logClientError } from '@/lib/errorLogging';
import { formatCurrency } from '@/lib/i18n/formatters';
import {
  shouldShowInvitePreviewSkeleton,
  shouldShowInviteUnavailable,
} from '@/lib/invitePaint';
import { resolveJoinOutcome } from '@/lib/joinOutcome';
import { circleWorkspaceHref, inviteJoinHref } from '@/lib/navigation';
import {
  buildPlannedHandClaimAcknowledgment,
  canSubmitPlannedHandClaim,
} from '@/lib/plannedHandClaim';
import {
  createRequestGeneration,
  shouldReplaceFinancialStateOnError,
} from '@/lib/requestGeneration';
import { colors, radii, spacing } from '@/lib/theme';

export default function JoinInviteScreen() {
  const { t, i18n } = useTranslation(['invite', 'joinCircle']);
  const { session, setPostAuthTarget } = useAuthSession();
  const params = useLocalSearchParams<{ id?: string | string[], claimToken?: string | string[] }>();
  const circleId = Array.isArray(params.id) ? params.id[0] : params.id;
  const claimToken = Array.isArray(params.claimToken) ? params.claimToken[0] : params.claimToken;
  const token = session?.session.token;
  const [claimAckChecked, setClaimAckChecked] = useState(false);

  function continueAuth(path: '/login' | '/create-account') {
    if (circleId) {
      setPostAuthTarget(inviteJoinHref(circleId, claimToken));
    }
    router.push(path);
  }

  const [preview, setPreview] = useState<BackendInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const requestGeneration = useRef(createRequestGeneration());
  const hasPreviewRef = useRef(false);

  const loadPreview = useCallback(async () => {
    const generation = requestGeneration.current.next();
    if (!circleId) {
      if (requestGeneration.current.isCurrent(generation)) {
        setError(t('invite:unavailableMessage'));
        setLoading(false);
      }
      return;
    }

    if (!hasPreviewRef.current) {
      setLoading(true);
    }
    if (requestGeneration.current.isCurrent(generation)) {
      setError(null);
    }

    try {
      const data = await getPublicInvitePreview(circleId);
      if (!requestGeneration.current.isCurrent(generation)) {
        return;
      }
      hasPreviewRef.current = true;
      setPreview(data);
    } catch (loadError) {
      logClientError('Unable to load public invite preview', loadError, { circleId });
      if (!requestGeneration.current.isCurrent(generation)) {
        return;
      }
      setError(t('invite:unavailableMessage'));
      if (shouldReplaceFinancialStateOnError(hasPreviewRef.current)) {
        setPreview(null);
      }
    } finally {
      if (requestGeneration.current.isCurrent(generation)) {
        setLoading(false);
      }
    }
  }, [circleId, t]);

  useEffect(() => {
    requestGeneration.current.next();
    hasPreviewRef.current = false;
    setPreview(null);
    setError(null);
    setLoading(true);
  }, [circleId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  async function handleJoin() {
    if (!token || !circleId || !preview) return;
    if (!canSubmitPlannedHandClaim({ checked: claimAckChecked, busy: joining })) {
      return;
    }
    const ack = buildPlannedHandClaimAcknowledgment({
      language: i18n.resolvedLanguage || i18n.language,
      checked: claimAckChecked,
    });
    if (!ack) return;

    setJoining(true);
    try {
      const result = await requestJoin(token, circleId, {
        claimToken,
        ...ack,
      });
      const outcome = resolveJoinOutcome(result, session?.user?.id);
      const goWorkspace = outcome === 'claimed';
      Alert.alert(
        t(`joinCircle:outcome.${outcome}Title`),
        t(`joinCircle:outcome.${outcome}Message`, {
          circleName:
            preview.name || t('joinCircle:outcome.circleFallback'),
        }),
        [
          {
            text: t('invite:ok'),
            onPress: () =>
              router.replace(
                goWorkspace
                  ? circleWorkspaceHref(circleId)
                  : '/(tabs)/dashboard',
              ),
          },
        ],
      );
    } catch (joinError) {
      logClientError('Unable to accept circle invitation', joinError, { circleId });
      Alert.alert(t('invite:joinErrorTitle'), t('invite:genericError'));
    } finally {
      setJoining(false);
    }
  }

  const hasPreview = preview != null;
  const showPreviewSkeleton = shouldShowInvitePreviewSkeleton({
    loading,
    hasPreview,
  });
  const showUnavailable = shouldShowInviteUnavailable({
    loading,
    hasPreview,
    error,
  });
  const acceptDisabled =
    !preview ||
    !canSubmitPlannedHandClaim({ checked: claimAckChecked, busy: joining });

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.replace('/(tabs)/dashboard')}
            accessibilityRole="button"
            accessibilityLabel={t('invite:backDashboard')}
          >
            <FontAwesome name="angle-left" size={24} color={colors.primaryDark} />
          </Pressable>
        </View>

        <View style={styles.inviteHeroCard}>
          <View style={styles.iconCircle}>
            <FontAwesome name="group" size={32} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>{t('invite:invitedTitle')}</Text>
          {preview ? (
            <Text style={styles.heroSubtitle}>
              {t('invite:invitedBy', {
                organizerName:
                  preview.organizerName ||
                  t('joinCircle:organizerFallback'),
              })}
            </Text>
          ) : showPreviewSkeleton ? (
            <View style={styles.skeletonLine} />
          ) : null}
        </View>

        {showUnavailable ? (
          <View style={styles.unavailableCard}>
            <FontAwesome name="warning" size={32} color={colors.warning} />
            <Text style={styles.statusTitle}>{t('invite:unavailableTitle')}</Text>
            <Text style={styles.statusText}>
              {error ?? t('invite:unavailableMessage')}
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => void loadPreview()}
              accessibilityRole="button"
              accessibilityLabel={t('invite:retryAccessibility')}
            >
              <Text style={styles.primaryButtonText}>{t('invite:retry')}</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, styles.secondaryAuthButton]}
              onPress={() => router.replace('/(tabs)/dashboard')}
              accessibilityRole="button"
              accessibilityLabel={t('invite:goHome')}
            >
              <Text style={styles.secondaryAuthButtonText}>
                {t('invite:goHome')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.detailsCard}>
            {preview ? (
              <Text style={styles.circleName}>{preview.name}</Text>
            ) : (
              <View style={[styles.skeletonLine, styles.skeletonTitle]} />
            )}

            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>{t('invite:contribution')}</Text>
                {preview ? (
                  <Text style={styles.detailValue}>
                    {formatInviteAmount(
                      preview.contributionAmount,
                      i18n.resolvedLanguage || i18n.language,
                    )}
                  </Text>
                ) : (
                  <View style={styles.skeletonValue} />
                )}
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>{t('invite:frequency')}</Text>
                {preview ? (
                  <Text style={styles.detailValue}>
                    {t(`invite:frequencyValue.${String(preview.frequency).toLowerCase()}`, {
                      defaultValue: preview.frequency,
                    })}
                  </Text>
                ) : (
                  <View style={styles.skeletonValue} />
                )}
              </View>
            </View>
          </View>
        )}

        <View style={styles.actionContainer}>
          {token ? (
            <>
              <Text style={styles.disclosureBody}>{t('invite:claimDisclosureBody')}</Text>
              {claimToken ? null : (
                <Text style={styles.disclosureHint}>{t('invite:claimDisclosureConditional')}</Text>
              )}
              <Pressable
                style={styles.ackRow}
                onPress={() => setClaimAckChecked((value) => !value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: claimAckChecked }}
                accessibilityLabel={t('invite:claimAckLabel')}
              >
                <View style={[styles.checkbox, claimAckChecked && styles.checkboxChecked]}>
                  {claimAckChecked ? (
                    <FontAwesome name="check" size={12} color={colors.onColor} />
                  ) : null}
                </View>
                <Text style={styles.ackLabel}>{t('invite:claimAckLabel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.primaryButton,
                  acceptDisabled && styles.disabledButton,
                ]}
                disabled={acceptDisabled}
                onPress={() => void handleJoin()}
                accessibilityRole="button"
                accessibilityLabel={t('invite:acceptAccessibility', {
                  circleName: preview?.name || t('joinCircle:outcome.circleFallback'),
                })}
              >
                <Text style={styles.primaryButtonText}>
                  {joining ? t('invite:accepting') : t('invite:accept')}
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.loginCard}>
              <Text style={styles.loginText}>
                {t('invite:loginPrompt')}
              </Text>
              <Pressable
                style={styles.primaryButton}
                onPress={() => continueAuth('/login')}
                accessibilityRole="button"
                accessibilityLabel={t('invite:loginAccessibility')}
              >
                <Text style={styles.primaryButtonText}>{t('invite:login')}</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, styles.secondaryAuthButton]}
                onPress={() => continueAuth('/create-account')}
                accessibilityRole="button"
                accessibilityLabel={t('invite:createAccessibility')}
              >
                <Text style={styles.secondaryAuthButtonText}>
                  {t('invite:createAccount')}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatInviteAmount(
  value: number | string | null | undefined,
  language: string,
): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? formatCurrency(amount, language) : '\u2014';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    padding: spacing.screenX,
    paddingBottom: spacing.screenX * 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  unavailableCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 4,
    marginBottom: 32,
    padding: 24,
  },
  skeletonLine: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    height: 16,
    marginTop: 8,
    width: 180,
  },
  skeletonTitle: {
    alignSelf: 'center',
    height: 22,
    marginBottom: 24,
    width: 160,
  },
  skeletonValue: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    height: 20,
    marginTop: 4,
    width: 88,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textStrong,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  inviteHeroCard: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.textStrong,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  detailsCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 24,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 32,
  },
  circleName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textStrong,
    marginBottom: 24,
    textAlign: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.subtle,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textStrong,
  },
  actionContainer: {
    marginTop: 'auto',
    gap: 12,
  },
  disclosureBody: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 21,
  },
  disclosureHint: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
  },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.primary },
  ackLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.textStrong,
    lineHeight: 20,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.control || 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  primaryButtonText: {
    color: colors.onColor,
    fontSize: 17,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.55,
  },
  loginCard: {
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  loginText: {
    fontSize: 15,
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  secondaryAuthButton: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.cardBorder,
    borderWidth: 1,
  },
  secondaryAuthButtonText: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '800',
  },
});
