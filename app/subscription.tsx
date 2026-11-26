import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { TierPlansSection } from '@/components/subscription/TierPlansSection';
import { useAuthSession } from '@/lib/auth/authContext';
import { useAppleBilling } from '@/lib/billing/useAppleBilling';
import { useEntitlements } from '@/lib/billing/entitlementsContext';
import {
  getAndroidApplicationPackage,
  openGooglePlaySubscriptionManagement,
} from '@/lib/billing/googlePlaySubscriptionManagement';
import { logClientWarning } from '@/lib/platform/errorLogging';
import { playFailureCopy } from '@/lib/billing/googlePlayStatusCopy';
import {
  GooglePlayBillingOperationError,
  type GooglePlayAnyPlanKey,
} from '@/lib/billing/googlePlayBillingMachine';
import { subscriptionDateLine } from '@/lib/billing/subscriptionDates';
import { formatLongDate } from '@/lib/i18n/formatters';
import { CONTENT_MAX_WIDTH } from '@/lib/shared/responsive';
import { colors, shadows } from '@/lib/shared/theme';
import { useLayoutMetrics } from '@/lib/shared/useLayoutMetrics';

const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

export default function SubscriptionScreen() {
  const { t, i18n } = useTranslation(['subscription', 'common']);
  const layout = useLayoutMetrics();
  const compact = layout.compact;
  const { session, status: authStatus } = useAuthSession();
  const {
    entitlements,
    isPremium,
    refreshEntitlements,
    googlePlayBillingState: playState,
    googlePlayPlans: playPlans,
    googlePlayTierPlans: tierPlans,
    initializeGooglePlayBilling,
    purchaseGooglePlaySubscription: runGooglePlayPurchase,
    restoreGooglePlayPurchases: runGooglePlayRestore,
    retryGooglePlayCompletion: runGooglePlayCompletionRetry,
  } = useEntitlements();
  const token = session?.session.token;
  const isAndroid = Platform.OS === 'android';
  const isIos = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const apple = useAppleBilling({
    enabled: isIos && authStatus === 'authenticated',
    token,
    refreshEntitlements,
  });
  const appleState = apple.state;
  const appleBusy = [
    'loading',
    'purchasing',
    'pending',
    'verifying',
    'restoring',
  ].includes(appleState.status);
  const appleReady =
    appleState.status === 'ready' ||
    appleState.status === 'succeeded' ||
    (appleState.status === 'failed' && appleState.operation !== 'initialize');
  const [action, setAction] = useState<'manage' | null>(null);
  const playOperationLocked = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!isAndroid || authStatus !== 'authenticated' || !token) {
        return undefined;
      }
      void initializeGooglePlayBilling().catch(() => {
        logClientWarning(
          'Google Play billing initialization failed.',
          new Error('Google Play billing initialization failed.'),
        );
      });
      return undefined;
    }, [
      authStatus,
      initializeGooglePlayBilling,
      isAndroid,
      token,
    ]),
  );

  useEffect(() => {
    if (
      playState.status === 'ready' ||
      playState.status === 'disabled' ||
      playState.status === 'unsupported' ||
      playState.status === 'succeeded' ||
      playState.status === 'failed'
    ) {
      playOperationLocked.current = false;
    }
  }, [playState.status]);

  const playBusy = [
    'connecting',
    'loading_products',
    'purchasing',
    'pending',
    'verifying',
    'restoring',
  ].includes(playState.status);
  const playCanRestore =
    playPlans !== null &&
    !playBusy &&
    (playState.status === 'ready' ||
      playState.status === 'succeeded' ||
      playState.status === 'failed');
  const dateLine = isPremium ? subscriptionDateLine(entitlements) : null;
  // Only a Google Play subscription can be managed in Google Play. Stripe and
  // admin-granted access get no provider-management control.
  const isGooglePlayEntitlement =
    isAndroid && entitlements.source === 'google_play';

  function formatPlayPeriod(period: string | null): string {
    if (!period) return '';
    const match = /^P(\d+)([DWMY])$/.exec(period);
    if (!match) return period;
    const count = Number(match[1]);
    const units = {
      D: count === 1 ? 'periodDay' : 'periodDays',
      W: count === 1 ? 'periodWeek' : 'periodWeeks',
      M: count === 1 ? 'periodMonth' : 'periodMonths',
      Y: count === 1 ? 'periodYear' : 'periodYears',
    } as const;
    return t(units[match[2] as keyof typeof units], { count });
  }

  async function startTierPurchase(plan: GooglePlayAnyPlanKey) {
    if (playState.status !== 'ready' || playOperationLocked.current) {
      return;
    }
    playOperationLocked.current = true;
    try {
      await runGooglePlayPurchase(plan);
    } catch (error) {
      playOperationLocked.current = false;
      if (
        error instanceof GooglePlayBillingOperationError &&
        error.code === 'google_play_plan_change_unavailable'
      ) {
        Alert.alert(t('tierPeriodChangeTitle'), t('tierPeriodChangeBody'));
        return;
      }
      Alert.alert(t('billingUnavailable'), t('playUnavailableBody'));
    }
  }

  async function restoreGooglePlayPurchases() {
    if (!playCanRestore || playOperationLocked.current) {
      return;
    }
    playOperationLocked.current = true;
    try {
      await runGooglePlayRestore();
    } catch {
      playOperationLocked.current = false;
      Alert.alert(t('billingUnavailable'), t('playUnavailableBody'));
    }
  }

  async function reloadGooglePlay() {
    if (playOperationLocked.current) {
      return;
    }
    try {
      await initializeGooglePlayBilling();
    } catch {
      Alert.alert(t('billingUnavailable'), t('playUnavailableBody'));
    }
  }

  async function retryGooglePlayCompletion() {
    if (playOperationLocked.current) {
      return;
    }
    playOperationLocked.current = true;
    try {
      await runGooglePlayCompletionRetry();
    } catch {
      playOperationLocked.current = false;
      Alert.alert(t('billingUnavailable'), t('playUnavailableBody'));
    }
  }

  async function openGooglePlayManagement() {
    setAction('manage');
    try {
      const packageName = getAndroidApplicationPackage();
      if (!packageName) {
        throw new Error('Google Play subscription management is unavailable.');
      }
      await openGooglePlaySubscriptionManagement(packageName, undefined);
      await refreshEntitlements();
    } catch {
      Alert.alert(t('billingUnavailable'), t('playManagementUnavailable'));
    } finally {
      setAction(null);
    }
  }

  const appleStatusMessage = (() => {
    if (!isIos) return null;
    switch (appleState.status) {
      case 'idle':
      case 'disabled':
        return { title: t('iosUnavailableTitle'), body: t('iosUnavailableBody'), tone: 'neutral' as const };
      case 'unsupported':
        return { title: t('playUnavailableTitle'), body: t('iosUnsupportedBody'), tone: 'error' as const };
      case 'loading':
        return { title: t('iosLoadingTitle'), body: t('iosLoadingBody'), tone: 'pending' as const };
      case 'purchasing':
        return { title: t('iosPurchasingTitle'), body: t('iosPurchasingBody'), tone: 'pending' as const };
      case 'pending':
        return { title: t('iosPendingTitle'), body: t('iosPendingBody'), tone: 'pending' as const };
      case 'verifying':
        return { title: t('iosVerifyingTitle'), body: t('iosVerifyingBody'), tone: 'pending' as const };
      case 'restoring':
        return { title: t('iosRestoringTitle'), body: t('iosRestoringBody'), tone: 'pending' as const };
      case 'succeeded': {
        if (appleState.operation === 'restore') {
          const none = (appleState.restored ?? 0) === 0;
          return {
            title: none ? t('iosRestoreNoneTitle') : t('iosRestoreSucceededTitle'),
            body: none ? t('iosRestoreNoneBody') : t('iosRestoreSucceededBody'),
            tone: 'success' as const,
          };
        }
        return { title: t('iosSucceededTitle'), body: t('iosSucceededBody'), tone: 'success' as const };
      }
      case 'failed':
        return {
          title:
            appleState.operation === 'initialize'
              ? t('iosLoadFailedTitle')
              : t('iosFailedTitle'),
          body:
            appleState.code === 'product_configuration_unavailable' ||
            appleState.code === 'status_failed'
              ? t('iosProductsUnavailableBody')
              : appleState.code === 'verification_failed' ||
                  appleState.code === 'verification_not_entitled'
                ? t('iosVerificationFailedBody')
                : t('iosFailedBody'),
          tone: 'error' as const,
        };
      case 'ready':
        return appleState.outcome === 'canceled'
          ? { title: t('iosCanceledTitle'), body: t('iosCanceledBody'), tone: 'neutral' as const }
          : null;
      default:
        return null;
    }
  })();

  const playStatusMessage = (() => {
    if (!isAndroid) return null;
    if (playState.status === 'disabled') {
      return {
        title: t('playComingSoon'),
        body: t('playComingSoonBody'),
        tone: 'neutral' as const,
      };
    }
    if (playState.status === 'unsupported') {
      return {
        title: t('playUnavailableTitle'),
        body: t('playUnavailableBody'),
        tone: 'error' as const,
      };
    }
    if (
      playState.status === 'connecting' ||
      playState.status === 'loading_products'
    ) {
      return {
        title: t('playLoadingTitle'),
        body: t('playLoadingBody'),
        tone: 'pending' as const,
      };
    }
    if (playState.status === 'purchasing') {
      return {
        title: t('playPurchasingTitle'),
        body: t('playPurchasingBody'),
        tone: 'pending' as const,
      };
    }
    if (playState.status === 'pending') {
      return {
        title: t('playPendingTitle'),
        body: t('playPendingBody'),
        tone: 'pending' as const,
      };
    }
    if (playState.status === 'verifying') {
      return {
        title: t('playVerifyingTitle'),
        body: t('playVerifyingBody'),
        tone: 'pending' as const,
      };
    }
    if (playState.status === 'restoring') {
      return {
        title: t('playRestoringTitle'),
        body: t('playRestoringBody'),
        tone: 'pending' as const,
      };
    }
    if (playState.status === 'succeeded') {
      const noPurchases =
        playState.operation === 'restore' &&
        playState.restore?.eligible === 0;
      return {
        title: noPurchases
          ? t('playRestoreNoneTitle')
          : playState.operation === 'restore'
            ? t('playRestoreSucceededTitle')
            : t('playSucceededTitle'),
        body: noPurchases
          ? t('playRestoreNoneBody')
          : playState.operation === 'restore'
            ? t('playRestoreSucceededBody')
            : t('playSucceededBody'),
        tone: 'success' as const,
      };
    }
    if (playState.status === 'failed') {
      const copy = playFailureCopy(playState);
      return {
        title: t(copy.titleKey),
        body: t(copy.bodyKey),
        tone: 'error' as const,
      };
    }
    if (playState.status === 'ready' && playState.outcome === 'canceled') {
      return {
        title: t('playCanceledTitle'),
        body: t('playCanceledBody'),
        tone: 'neutral' as const,
      };
    }
    return null;
  })();

  const statusMessage = isIos ? appleStatusMessage : playStatusMessage;

  return (
    <View style={styles.screen}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: layout.gutter,
              maxWidth: layout.wide ? CONTENT_MAX_WIDTH : undefined,
            },
            compact && styles.contentCompact,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.topBar, compact && styles.topBarCompact]}>
            <Pressable
              onPress={() => router.back()}
              style={styles.iconButton}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common:goBack')}
            >
              <FontAwesome
                name="chevron-left"
                size={18}
                color={colors.textStrong}
              />
            </Pressable>
            <Text style={styles.topTitle}>{t('plans')}</Text>
            <View style={styles.iconButtonPlaceholder} />
          </View>

          <Animated.View
            entering={FadeInUp.springify()}
            style={[styles.hero, compact && styles.heroCompact]}
          >
            <View style={[styles.crown, compact && styles.crownCompact]}>
              <FontAwesome name="diamond" size={20} color={colors.premiumGold} />
            </View>
            <Text style={styles.eyebrow}>{t('eyebrow')}</Text>
            <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>
              {t('tierHeroTitle')}
            </Text>
            <Text style={[styles.heroCopy, compact && styles.heroCopyCompact]}>
              {t('tierHeroTagline')}
            </Text>
          </Animated.View>

          {isWeb && !isPremium ? (
            <View
              style={[styles.statusBanner, styles.statusBannerCanceled]}
              accessibilityLiveRegion="polite"
            >
              <FontAwesome
                name="info-circle"
                size={17}
                color={colors.primaryDark}
              />
              <View style={styles.statusBannerText}>
                <Text style={styles.statusBannerTitle}>
                  {t('webUnavailableTitle')}
                </Text>
                <Text style={styles.statusBannerBody}>
                  {t('webUnavailableBody')}
                </Text>
              </View>
            </View>
          ) : null}

          {statusMessage ? (
            <View
              style={[
                styles.statusBanner,
                statusMessage.tone === 'pending' &&
                  styles.statusBannerPending,
                statusMessage.tone === 'neutral' &&
                  styles.statusBannerCanceled,
                statusMessage.tone === 'error' && styles.playStatusError,
              ]}
              accessibilityLiveRegion="polite"
            >
              {statusMessage.tone === 'pending' ? (
                <ActivityIndicator color={colors.primaryDark} />
              ) : (
                <FontAwesome
                  name={
                    statusMessage.tone === 'success'
                      ? 'check-circle'
                      : 'info-circle'
                  }
                  size={17}
                  color={
                    statusMessage.tone === 'error'
                      ? colors.dangerText
                      : colors.primaryDark
                  }
                />
              )}
              <View style={styles.statusBannerText}>
                <Text style={styles.statusBannerTitle}>
                  {statusMessage.title}
                </Text>
                <Text style={styles.statusBannerBody}>
                  {statusMessage.body}
                </Text>
              </View>
            </View>
          ) : null}

          {isPremium ? (
            <View
              style={styles.statusBanner}
              accessibilityLiveRegion="polite"
            >
              <FontAwesome
                name="check-circle"
                size={17}
                color={colors.successText}
              />
              <View style={styles.statusBannerText}>
                <Text style={styles.statusBannerTitle}>
                  {entitlements.subscriptionStatus === 'trialing'
                    ? t('trialActive')
                    : t('active')}
                </Text>
                <Text style={styles.statusBannerBody}>
                  {entitlements.cancelAtPeriodEnd
                    ? t('willNotRenew')
                    : t('subscriptionReady')}
                </Text>
                {dateLine ? (
                  <Text style={styles.statusBannerBody}>
                    {t(dateLine.key, {
                      date: formatLongDate(
                        dateLine.date,
                        i18n.resolvedLanguage || i18n.language,
                      ),
                    })}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <TierPlansSection
            tierPlans={(isIos ? apple.plans : tierPlans) ?? {}}
            currentTier={entitlements.tier}
            pendingTier={entitlements.pendingTier}
            pendingDateLabel={
              entitlements.pendingTierStartsAt
                ? formatLongDate(
                    entitlements.pendingTierStartsAt,
                    i18n.resolvedLanguage || i18n.language,
                  )
                : null
            }
            busy={isIos ? appleBusy : playBusy}
            canPurchase={isIos ? appleState.status === 'ready' : playState.status === 'ready'}
            periodLabel={formatPlayPeriod}
            onPurchase={(key) =>
              isIos ? void apple.purchase(key) : void startTierPurchase(key)
            }
            onManage={
              isGooglePlayEntitlement
                ? () => void openGooglePlayManagement()
                : isIos && entitlements.source === 'apple'
                  ? () => void Linking.openURL(APPLE_SUBSCRIPTIONS_URL)
                  : undefined
            }
            manageLabel={
              isIos && entitlements.source === 'apple'
                ? t('tierManageApple')
                : undefined
            }
            unavailableNote={
              (isAndroid && playState.status !== 'disabled') ||
              (isIos && appleState.status !== 'disabled')
                ? undefined
                : null
            }
          />
          {isIos && Object.keys(apple.plans).length > 0 ? (
            <Pressable
              style={[styles.restoreButton, !appleReady && styles.buttonDisabled]}
              onPress={() => void apple.restore()}
              disabled={!appleReady}
              accessibilityRole="button"
              accessibilityLabel={t('playRestore')}
              accessibilityState={{ disabled: !appleReady }}
            >
              <Text style={styles.restoreButtonText}>{t('playRestore')}</Text>
            </Pressable>
          ) : null}
          {isIos &&
          appleState.status === 'failed' &&
          appleState.operation === 'initialize' &&
          appleState.retryable ? (
            <Pressable
              style={styles.restoreButton}
              onPress={() => void apple.reload()}
              accessibilityRole="button"
              accessibilityLabel={t('playTryAgain')}
            >
              <Text style={styles.restoreButtonText}>{t('playTryAgain')}</Text>
            </Pressable>
          ) : null}
          {playPlans ? (
            <Pressable
              style={[
                styles.restoreButton,
                !playCanRestore && styles.buttonDisabled,
              ]}
              onPress={() => void restoreGooglePlayPurchases()}
              disabled={!playCanRestore}
              accessibilityRole="button"
              accessibilityLabel={t('playRestore')}
              accessibilityState={{ disabled: !playCanRestore }}
            >
              <Text style={styles.restoreButtonText}>{t('playRestore')}</Text>
            </Pressable>
          ) : null}
          {playState.status === 'failed' &&
          playFailureCopy(playState).action === 'reload' ? (
            <Pressable
              style={styles.restoreButton}
              onPress={() => void reloadGooglePlay()}
              accessibilityRole="button"
              accessibilityLabel={t('playTryAgain')}
            >
              <Text style={styles.restoreButtonText}>{t('playTryAgain')}</Text>
            </Pressable>
          ) : null}
          {playState.status === 'failed' &&
          playState.code === 'transaction_completion_failed' ? (
            <Pressable
              style={styles.restoreButton}
              onPress={() => void retryGooglePlayCompletion()}
              accessibilityRole="button"
              accessibilityLabel={t('playRetryCompletion')}
            >
              <Text style={styles.restoreButtonText}>
                {t('playRetryCompletion')}
              </Text>
            </Pressable>
          ) : null}
          <Text style={styles.footer}>
            {isAndroid
              ? t('tierFooter')
              : isIos
                ? t('iosFooter')
                : t('webFooter')}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.premiumCanvas },
  safeArea: { flex: 1 },
  content: {
    alignSelf: 'center',
    paddingBottom: 56,
    width: '100%',
  },
  // Compact (short or narrow) windows: less decoration, tighter gaps. Text stays
  // readable and buttons keep their 44 dp or taller tap targets.
  contentCompact: { paddingBottom: 32 },
  topBarCompact: { height: 44 },
  heroCompact: { borderRadius: 24, marginTop: 4, paddingHorizontal: 18, paddingVertical: 18 },
  crownCompact: { width: 34, height: 34, marginBottom: 10, borderRadius: 12 },
  heroTitleCompact: { fontSize: 28, lineHeight: 32, letterSpacing: -0.8 },
  heroCopyCompact: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  glowTop: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: colors.premiumGlow,
    top: -260,
    right: -150,
  },
  glowBottom: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.premiumMintGlow,
    bottom: -140,
    left: -120,
  },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(107,70,193,0.10)',
  },
  iconButtonPlaceholder: { width: 44 },
  topTitle: { fontSize: 15, fontWeight: '800', color: colors.textStrong },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingVertical: 28,
    marginTop: 8,
    overflow: 'hidden',
    ...shadows.medium,
  },
  crown: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  eyebrow: {
    color: colors.premiumLavender,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  heroTitle: {
    color: colors.onColor,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1.2,
    fontWeight: '900',
  },
  heroCopy: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.successSoft,
    borderRadius: 18,
    padding: 15,
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  statusBannerPending: {
    backgroundColor: colors.premiumLavenderBadge,
  },
  statusBannerCanceled: {
    backgroundColor: colors.card,
  },
  playStatusError: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  statusBannerText: { flex: 1 },
  statusBannerTitle: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '900',
  },
  statusBannerBody: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  buttonDisabled: { opacity: 0.5 },
  restoreButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  restoreButtonText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  footer: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 24,
    paddingHorizontal: 20,
  },
});
