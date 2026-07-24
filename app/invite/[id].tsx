import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

import {
  getPublicInvitePreview,
  requestJoin,
  type BackendInvitePreview,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { formatCurrency } from '@/lib/i18n/formatters';
import { resolveJoinOutcome } from '@/lib/joinOutcome';
import { circleWorkspaceHref, inviteJoinHref } from '@/lib/navigation';
import { colors, radii, spacing } from '@/lib/theme';

export default function JoinInviteScreen() {
  const { t, i18n } = useTranslation(['invite', 'joinCircle']);
  const { session, setPostAuthTarget } = useAuthSession();
  const params = useLocalSearchParams<{ id?: string | string[], claimToken?: string | string[] }>();
  const circleId = Array.isArray(params.id) ? params.id[0] : params.id;
  const claimToken = Array.isArray(params.claimToken) ? params.claimToken[0] : params.claimToken;
  const token = session?.session.token;

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

  async function loadPreview() {
    if (!circleId) {
      setError(t('invite:unavailableMessage'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getPublicInvitePreview(circleId);
      setPreview(data);
    } catch (loadError) {
      console.error('Unable to load public invite preview.', loadError);
      setError(t('invite:unavailableMessage'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPreview();
  }, [circleId]);

  async function handleJoin() {
    if (!token || !circleId || !preview) return;

    setJoining(true);
    try {
      const result = await requestJoin(token, circleId, claimToken);
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
      console.error('Unable to accept circle invitation.', joinError);
      Alert.alert(t('invite:joinErrorTitle'), t('invite:genericError'));
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.statusCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.statusText}>{t('invite:loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !preview) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.replace('/(tabs)/dashboard')}
          >
            <FontAwesome name="home" size={24} color={colors.primaryDark} />
          </Pressable>
        </View>
        <View style={styles.statusCard}>
          <FontAwesome name="warning" size={32} color={colors.warning} />
          <Text style={styles.statusTitle}>{t('invite:unavailableTitle')}</Text>
          <Text style={styles.statusText}>
            {error ?? t('invite:unavailableMessage')}
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.replace('/(tabs)/dashboard')}
          >
            <Text style={styles.primaryButtonText}>{t('invite:goHome')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
          <Text style={styles.heroSubtitle}>
            {t('invite:invitedBy', {
              organizerName:
                preview.organizerName ||
                t('joinCircle:organizerFallback'),
            })}
          </Text>
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.circleName}>{preview.name}</Text>
          
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>{t('invite:contribution')}</Text>
              <Text style={styles.detailValue}>
                {formatInviteAmount(
                  preview.contributionAmount,
                  i18n.resolvedLanguage || i18n.language,
                )}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>{t('invite:frequency')}</Text>
              <Text style={styles.detailValue}>
                {t(`invite:frequencyValue.${String(preview.frequency).toLowerCase()}`, {
                  defaultValue: preview.frequency,
                })}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actionContainer}>
          {token ? (
            <Pressable
              style={[styles.primaryButton, joining && styles.disabledButton]}
              disabled={joining}
              onPress={() => void handleJoin()}
              accessibilityRole="button"
              accessibilityLabel={t('invite:acceptAccessibility', {
                circleName: preview.name,
              })}
            >
              <Text style={styles.primaryButtonText}>
                {joining ? t('invite:accepting') : t('invite:accept')}
              </Text>
            </Pressable>
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
  statusCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
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
    backgroundColor: '#ffffff',
    borderRadius: radii.card,
    padding: 24,
    shadowColor: '#000',
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
    color: '#ffffff',
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
