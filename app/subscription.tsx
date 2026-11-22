import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { type BillingPlan } from '@/lib/api';
import { useAuthSession } from '@/lib/auth/authContext';
import { useEntitlements } from '@/lib/billing/entitlementsContext';
import {
  getAndroidApplicationPackage,
  openGooglePlaySubscriptionManagement,
} from '@/lib/billing/googlePlaySubscriptionManagement';
import {
  FREE_MAX_PARTICIPATING_HANDS,
  PREMIUM_MAX_PARTICIPATING_HANDS,
} from '@/lib/billing/entitlements';
import { logClientWarning } from '@/lib/platform/errorLogging';
import { CONTENT_MAX_WIDTH } from '@/lib/shared/responsive';
import { colors, radii, shadows } from '@/lib/shared/theme';
import { useLayoutMetrics } from '@/lib/shared/useLayoutMetrics';

const FALLBACK_FEATURE_KEYS = [
  'unlimitedCircles',
  'hands',
  'history',
] as const;

const fallbackPremium: BillingPlan = {
  id: 'premium',
  name: 'Organizer Pro',
  tagline: '',
  monthlyPriceCents: 799,
  annualPriceCents: 5999,
  annualSavingsCents: 3589,
  trialDays: 7,
  features: [...FALLBACK_FEATURE_KEYS],
};

type BillingInterval = 'monthly' | 'annual';

export default function SubscriptionScreen() {
  const { t } = useTranslation(['subscription', 'common']);
  const layout = useLayoutMetrics();
  const compact = layout.compact;
  const { session, status: authStatus } = useAuthSession();
  const {
    entitlements,
    isPremium,
    refreshEntitlements,
    googlePlayBillingState: playState,
    googlePlayPlans: playPlans,
    initializeGooglePlayBilling,
    purchaseGooglePlaySubscription: runGooglePlayPurchase,
    restoreGooglePlayPurchases: runGooglePlayRestore,
    retryGooglePlayCompletion: runGooglePlayCompletionRetry,
  } = useEntitlements();
  const token = session?.session.token;
  const isAndroid = Platform.OS === 'android';
  const isIos = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const [premium] = useState<BillingPlan>(fallbackPremium);
  const [interval, setInterval] = useState<BillingInterval>('annual');
  const [action, setAction] = useState<'portal' | null>(null);
  const playOperationLocked = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (
        !isAndroid ||
        isPremium ||
        authStatus !== 'authenticated' ||
        !token
      ) {
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
      isPremium,
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

  const selectedPlayPlan = playPlans?.[interval] ?? null;
  const playBusy = [
    'connecting',
    'loading_products',
    'purchasing',
    'pending',
    'verifying',
    'restoring',
  ].includes(playState.status);
  const playCanPurchase =
    playState.status === 'ready' && selectedPlayPlan !== null && !isPremium;
  const playCanRestore =
    playPlans !== null &&
    !playBusy &&
    (playState.status === 'ready' ||
      playState.status === 'succeeded' ||
      playState.status === 'failed');
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

  async function startGooglePlayPurchase() {
    if (!playCanPurchase || playOperationLocked.current) {
      return;
    }
    playOperationLocked.current = true;
    try {
      await runGooglePlayPurchase(interval);
    } catch {
      playOperationLocked.current = false;
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
    setAction('portal');
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

  const playStatusMessage = (() => {
    if (!isAndroid || isPremium) return null;
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
      return {
        title:
          playState.code === 'transaction_completion_failed'
            ? t('playCompletionPendingTitle')
            : t('playUnavailableTitle'),
        body:
          playState.code === 'transaction_completion_failed'
            ? t('playCompletionPendingBody')
            : t('playUnavailableBody'),
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
              {t('heroTitle')}
            </Text>
            <Text style={[styles.heroCopy, compact && styles.heroCopyCompact]}>
              {t('heroTagline')}
            </Text>

            {isPremium ? (
              <View style={styles.activePill}>
                <FontAwesome name="check-circle" size={14} color={colors.successSoft} />
                <Text style={styles.activePillText}>
                  {entitlements.subscriptionStatus === 'trialing'
                    ? t('trialActive')
                    : t('active')}
                </Text>
              </View>
            ) : selectedPlayPlan?.trial ? (
              <Text style={styles.trialCopy}>
                {t('playTrialCopy', {
                  period: formatPlayPeriod(
                    selectedPlayPlan.trial.billingPeriod,
                  ),
                })}
              </Text>
            ) : null}
          </Animated.View>

          {isIos && !isPremium ? (
            <View
              style={[styles.checkoutStatus, styles.checkoutStatusCanceled]}
              accessibilityLiveRegion="polite"
            >
              <FontAwesome
                name="info-circle"
                size={17}
                color={colors.primaryDark}
              />
              <View style={styles.checkoutStatusText}>
                <Text style={styles.checkoutStatusTitle}>
                  {t('iosUnavailableTitle')}
                </Text>
                <Text style={styles.checkoutStatusBody}>
                  {t('iosUnavailableBody')}
                </Text>
              </View>
            </View>
          ) : null}

          {isWeb && !isPremium ? (
            <View
              style={[styles.checkoutStatus, styles.checkoutStatusCanceled]}
              accessibilityLiveRegion="polite"
            >
              <FontAwesome
                name="info-circle"
                size={17}
                color={colors.primaryDark}
              />
              <View style={styles.checkoutStatusText}>
                <Text style={styles.checkoutStatusTitle}>
                  {t('webUnavailableTitle')}
                </Text>
                <Text style={styles.checkoutStatusBody}>
                  {t('webUnavailableBody')}
                </Text>
              </View>
            </View>
          ) : null}

          {playStatusMessage ? (
            <View
              style={[
                styles.checkoutStatus,
                playStatusMessage.tone === 'pending' &&
                  styles.checkoutStatusPending,
                playStatusMessage.tone === 'neutral' &&
                  styles.checkoutStatusCanceled,
                playStatusMessage.tone === 'error' && styles.playStatusError,
              ]}
              accessibilityLiveRegion="polite"
            >
              {playStatusMessage.tone === 'pending' ? (
                <ActivityIndicator color={colors.primaryDark} />
              ) : (
                <FontAwesome
                  name={
                    playStatusMessage.tone === 'success'
                      ? 'check-circle'
                      : 'info-circle'
                  }
                  size={17}
                  color={
                    playStatusMessage.tone === 'error'
                      ? colors.dangerText
                      : colors.primaryDark
                  }
                />
              )}
              <View style={styles.checkoutStatusText}>
                <Text style={styles.checkoutStatusTitle}>
                  {playStatusMessage.title}
                </Text>
                <Text style={styles.checkoutStatusBody}>
                  {playStatusMessage.body}
                </Text>
              </View>
            </View>
          ) : null}

          {!isPremium && isAndroid ? (
            <Animated.View
              entering={FadeInDown.delay(100).springify()}
              style={[styles.billingToggle, compact && styles.billingToggleCompact]}
            >
              <IntervalButton
                active={interval === 'monthly'}
                label={t('monthly')}
                disabled={!playPlans || playBusy}
                onPress={() => setInterval('monthly')}
              />
              <IntervalButton
                active={interval === 'annual'}
                label={t('annual')}
                disabled={!playPlans || playBusy}
                onPress={() => setInterval('annual')}
              />
            </Animated.View>
          ) : null}

          <Animated.View
            entering={FadeInDown.delay(180).springify()}
            style={[styles.priceCard, compact && styles.priceCardCompact]}
          >
            <View style={styles.priceHeader}>
              <View style={styles.planTitleBlock}>
                <Text style={styles.planName}>
                  {isAndroid && selectedPlayPlan
                    ? selectedPlayPlan.title
                    : t('productName')}
                </Text>
                <Text style={styles.planAudience}>
                  {isAndroid && selectedPlayPlan
                    ? selectedPlayPlan.description
                    : t('audience')}
                </Text>
              </View>
              {isPremium ? (
                <View style={styles.recommendedBadge}>
                  <FontAwesome name="star" size={10} color={colors.primaryDark} />
                  <Text style={styles.recommendedText}>{t('yourPlan')}</Text>
                </View>
              ) : isAndroid && interval === 'annual' ? (
                <View style={styles.recommendedBadge}>
                  <FontAwesome name="star" size={10} color={colors.primaryDark} />
                  <Text style={styles.recommendedText}>{t('bestValue')}</Text>
                </View>
              ) : null}
            </View>

            {!isPremium ? (
              isAndroid ? (
                selectedPlayPlan ? (
                  <View style={styles.priceRow}>
                    <Text
                      style={[styles.playPrice, compact && styles.playPriceCompact]}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      {selectedPlayPlan.displayPrice}
                    </Text>
                    {selectedPlayPlan.billingPeriod ? (
                      <View style={styles.priceMeta}>
                        <Text style={styles.pricePeriod}>
                          {t('playBillingPeriod', {
                            period: formatPlayPeriod(
                              selectedPlayPlan.billingPeriod,
                            ),
                          })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.playPricePlaceholder}>
                    {playBusy ? (
                      <ActivityIndicator color={colors.primaryDark} />
                    ) : null}
                    <Text style={styles.playPricePlaceholderText}>
                      {playState.status === 'disabled'
                        ? t('playComingSoon')
                        : t('playUnavailableBody')}
                    </Text>
                  </View>
                )
              ) : (
                <View style={styles.playPricePlaceholder}>
                  <Text style={styles.playPricePlaceholderText}>
                    {isIos ? t('iosUnavailableBody') : t('webUnavailableBody')}
                  </Text>
                </View>
              )
            ) : (
              <View style={styles.activeSummary}>
                <Text style={styles.activeSummaryTitle}>
                  {t('unlockedTitle')}
                </Text>
                <Text style={styles.activeSummaryText}>
                  {entitlements.cancelAtPeriodEnd
                    ? t('willNotRenew')
                    : t('subscriptionReady')}
                </Text>
              </View>
            )}

            <View style={[styles.divider, compact && styles.dividerCompact]} />

            <View style={[styles.features, compact && styles.featuresCompact]}>
              {premium.features.map((feature, index) => (
                <View key={feature} style={styles.featureRow}>
                  <View
                    style={[
                      styles.featureIcon,
                      index < 2 && styles.featureIconFeatured,
                    ]}
                  >
                    <FontAwesome
                      name={featureIcon(feature)}
                      size={13}
                      color={
                        index < 2 ? colors.onColor : colors.primaryDark
                      }
                    />
                  </View>
                  <Text style={styles.featureText}>
                    {feature === 'hands'
                      ? t('features.hands', {
                          count: PREMIUM_MAX_PARTICIPATING_HANDS,
                        })
                      : t(`features.${feature}`, { defaultValue: feature })}
                  </Text>
                </View>
              ))}
            </View>

            {isPremium ? (
              isGooglePlayEntitlement ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => void openGooglePlayManagement()}
                  disabled={action !== null}
                  accessibilityRole="button"
                  accessibilityLabel={t('playManageSubscription')}
                  accessibilityState={{ disabled: action !== null }}
                >
                  {action === 'portal' ? (
                    <ActivityIndicator color={colors.onColor} />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>
                        {t('playManageSubscription')}
                      </Text>
                      <FontAwesome
                        name="external-link"
                        size={14}
                        color={colors.onColor}
                      />
                    </>
                  )}
                </Pressable>
              ) : null
            ) : isAndroid ? (
              <>
                {playPlans ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryButton,
                      (!playCanPurchase || playBusy) && styles.buttonDisabled,
                      pressed && playCanPurchase && styles.buttonPressed,
                    ]}
                    onPress={() => void startGooglePlayPurchase()}
                    disabled={!playCanPurchase || playBusy}
                    accessibilityRole="button"
                    accessibilityLabel={
                      selectedPlayPlan?.trial
                        ? t('playPurchaseTrial')
                        : t('playPurchase')
                    }
                    accessibilityState={{
                      disabled: !playCanPurchase || playBusy,
                    }}
                  >
                    {playBusy && playState.status !== 'pending' ? (
                      <ActivityIndicator color={colors.onColor} />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {selectedPlayPlan?.trial
                          ? t('playPurchaseTrial')
                          : t('playPurchase')}
                      </Text>
                    )}
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
                    <Text style={styles.restoreButtonText}>
                      {t('playRestore')}
                    </Text>
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
              </>
            ) : null}
          </Animated.View>

          {!isPremium ? (
            <Animated.View
              entering={FadeInDown.delay(260).springify()}
              style={styles.freeCard}
            >
              <View style={styles.freeIcon}>
                <FontAwesome name="heart-o" size={17} color={colors.success} />
              </View>
              <View style={styles.freeText}>
                <Text style={styles.freeTitle}>{t('freeTitle')}</Text>
                <Text style={styles.freeCopy}>
                  {t('freeCopy', {
                    count:
                      entitlements.capabilities?.maxParticipatingHands ??
                      FREE_MAX_PARTICIPATING_HANDS,
                  })}
                </Text>
              </View>
            </Animated.View>
          ) : null}

          <Text style={styles.footer}>
            {isAndroid
              ? t('playFooter')
              : isIos
                ? t('iosFooter')
                : t('webFooter')}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function IntervalButton({
  active,
  label,
  badge,
  disabled = false,
  onPress,
}: {
  active: boolean;
  label: string;
  badge?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={[
        styles.intervalButton,
        active && styles.intervalButtonActive,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[styles.intervalText, active && styles.intervalTextActive]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {badge ? (
        <View style={styles.savingsBadge}>
          <Text style={styles.savingsText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function featureIcon(
  feature: string,
): React.ComponentProps<typeof FontAwesome>['name'] {
  const value = feature.toLowerCase();
  if (value.includes('circle')) return 'circle-o-notch';
  if (value.includes('reminder')) return 'bell';
  if (value.includes('report') || value.includes('history')) return 'line-chart';
  if (value.includes('pdf') || value.includes('record')) return 'file-text';
  if (value.includes('ai')) return 'magic';
  return 'check';
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
  billingToggleCompact: { marginTop: 12 },
  priceCardCompact: { borderRadius: 24, marginTop: 12, padding: 16 },
  playPriceCompact: { fontSize: 34, lineHeight: 40 },
  dividerCompact: { marginVertical: 14 },
  featuresCompact: { gap: 10, marginBottom: 16 },
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
  trialCopy: {
    color: colors.premiumGold,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 18,
  },
  activePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(16,185,129,0.18)',
  },
  activePillText: { color: colors.successSoft, fontWeight: '800', fontSize: 12 },
  checkoutStatus: {
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
  checkoutStatusPending: {
    backgroundColor: colors.premiumLavenderBadge,
  },
  checkoutStatusCanceled: {
    backgroundColor: colors.card,
  },
  playStatusError: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  checkoutStatusText: { flex: 1 },
  checkoutStatusTitle: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '900',
  },
  checkoutStatusBody: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  billingToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.72)',
    padding: 5,
    borderRadius: radii.pill,
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  intervalButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radii.pill,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
  },
  intervalButtonActive: {
    backgroundColor: colors.card,
    ...shadows.small,
  },
  intervalText: {
    color: colors.muted,
    flexShrink: 1,
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
  },
  intervalTextActive: { color: colors.primaryDark },
  savingsBadge: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  savingsText: { color: colors.successText, fontSize: 10, fontWeight: '900' },
  priceCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    marginTop: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    ...shadows.medium,
  },
  priceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  planTitleBlock: { flex: 1, minWidth: 0 },
  planName: { color: colors.textStrong, fontSize: 21, fontWeight: '900' },
  planAudience: { color: colors.muted, fontSize: 12, marginTop: 4 },
  recommendedBadge: {
    flexShrink: 1,
    maxWidth: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.premiumLavenderBadge,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  recommendedText: {
    color: colors.primaryDark,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 24,
  },
  currency: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.textStrong,
    marginTop: 8,
  },
  price: {
    fontSize: 54,
    lineHeight: 60,
    fontWeight: '900',
    letterSpacing: -2,
    color: colors.textStrong,
  },
  playPrice: {
    flexShrink: 1,
    fontSize: 42,
    lineHeight: 50,
    fontWeight: '900',
    letterSpacing: -1.5,
    color: colors.textStrong,
  },
  playPricePlaceholder: {
    minHeight: 72,
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playPricePlaceholderText: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  priceMeta: { marginLeft: 7, marginTop: 16 },
  pricePeriod: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  equivalent: {
    color: colors.successText,
    fontWeight: '800',
    fontSize: 11,
    marginTop: 3,
  },
  activeSummary: {
    backgroundColor: colors.successSoft,
    padding: 16,
    borderRadius: 18,
    marginTop: 22,
  },
  activeSummaryTitle: {
    color: colors.successText,
    fontWeight: '900',
    fontSize: 15,
  },
  activeSummaryText: {
    color: colors.successText,
    opacity: 0.85,
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: 22,
  },
  features: { gap: 14, marginBottom: 24 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIconFeatured: { backgroundColor: colors.primary },
  featureText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...shadows.small,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  primaryButtonText: {
    color: colors.onColor,
    fontSize: 15,
    fontWeight: '900',
  },
  cancelButton: { alignItems: 'center', paddingVertical: 14 },
  cancelButtonText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
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
  managementUnavailable: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingVertical: 12,
  },
  freeCard: {
    flexDirection: 'row',
    gap: 13,
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderRadius: 20,
    padding: 17,
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  freeIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freeText: { flex: 1 },
  freeTitle: { color: colors.textStrong, fontWeight: '900', fontSize: 14 },
  freeCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  footer: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 24,
    paddingHorizontal: 20,
  },
});
