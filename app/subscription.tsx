import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as WebBrowser from 'expo-web-browser';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import {
  cancelPremiumSubscription,
  createBillingCheckout,
  createBillingPortal,
  getBillingPlans,
  type BillingPlan,
} from '@/lib/api';
import { APP_SCHEME } from '@/lib/config';
import { useAuthSession } from '@/lib/authContext';
import { useEntitlements } from '@/lib/entitlementsContext';
import {
  createGooglePlayBillingMachine,
  type GooglePlayBillingState,
  type GooglePlayPlan,
} from '@/lib/googlePlayBillingMachine';
import {
  getAndroidApplicationPackage,
  openGooglePlaySubscriptionManagement,
} from '@/lib/googlePlaySubscriptionManagement';
import { logClientWarning } from '@/lib/errorLogging';
import {
  checkoutReturnStatusFromUrl,
  pollForPremiumActivation,
  type CheckoutReturnStatus,
} from '@/lib/subscriptionCheckout';
import { formatCurrency } from '@/lib/i18n/formatters';
import { colors, radii, shadows, spacing } from '@/lib/theme';

const FALLBACK_FEATURE_KEYS = [
  'unlimitedCircles',
  'hands',
  'reminders',
  'reports',
  'records',
  'history',
  'assistant',
] as const;

const fallbackPremium: BillingPlan = {
  id: 'premium',
  name: 'Organizer Pro',
  tagline:
    'Run multiple circles with less chasing, clearer records, and professional proof.',
  monthlyPriceCents: 799,
  annualPriceCents: 5999,
  annualSavingsCents: 3589,
  trialDays: 7,
  features: [...FALLBACK_FEATURE_KEYS],
};

type BillingInterval = 'monthly' | 'annual';
type CheckoutReturnState =
  | 'idle'
  | 'activating'
  | 'activated'
  | 'pending'
  | 'canceled';

let googlePlayBillingLifecycle = Promise.resolve();

export default function SubscriptionScreen() {
  const { t, i18n } = useTranslation(['subscription', 'common']);
  const language = i18n.resolvedLanguage || i18n.language;
  const params = useLocalSearchParams<{ checkout?: string | string[] }>();
  const { session, status: authStatus } = useAuthSession();
  const { entitlements, isPremium, refreshEntitlements } = useEntitlements();
  const token = session?.session.token;
  const isAndroid = Platform.OS === 'android';
  const [premium, setPremium] = useState<BillingPlan>(fallbackPremium);
  const [interval, setInterval] = useState<BillingInterval>('annual');
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'checkout' | 'portal' | 'cancel' | null>(
    null,
  );
  const [checkoutReturnState, setCheckoutReturnState] =
    useState<CheckoutReturnState>('idle');
  const handledCheckoutReturn = useRef<CheckoutReturnStatus | null>(null);
  const [playState, setPlayState] = useState<GooglePlayBillingState>({
    status: 'idle',
  });
  const [playPlans, setPlayPlans] = useState<
    Record<BillingInterval, GooglePlayPlan> | null
  >(null);
  const playMachine = useRef<
    ReturnType<typeof createGooglePlayBillingMachine> | null
  >(null);
  const playOperationLocked = useRef(false);

  useEffect(() => {
    if (isAndroid) {
      setLoading(false);
      return;
    }
    let active = true;
    void getBillingPlans()
      .then((response) => {
        const plan = response.plans.find((item) => item.id === 'premium');
        if (active && plan) setPremium(plan);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAndroid]);

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
      let active = true;
      let machine: ReturnType<typeof createGooglePlayBillingMachine> | null =
        null;
      let unsubscribe: () => void = () => {};
      void googlePlayBillingLifecycle.then(() => {
        if (!active) return;
        machine = createGooglePlayBillingMachine({
          authToken: token,
          api: { refreshEntitlements: () => refreshEntitlements() },
        });
        playMachine.current = machine;
        unsubscribe = machine.subscribe((next) => {
          if (!active) return;
          setPlayState(next);
          if (next.status === 'ready') {
            setPlayPlans(next.plans);
          }
          if (
            next.status === 'ready' ||
            next.status === 'disabled' ||
            next.status === 'unsupported' ||
            next.status === 'succeeded' ||
            next.status === 'failed'
          ) {
            playOperationLocked.current = false;
          }
        });
        void machine.initialize().catch(() => {
          logClientWarning(
            'Google Play billing initialization failed.',
            new Error('Google Play billing initialization failed.'),
          );
        });
      });

      return () => {
        active = false;
        unsubscribe();
        if (playMachine.current === machine) {
          playMachine.current = null;
        }
        playOperationLocked.current = false;
        if (machine) {
          googlePlayBillingLifecycle = machine.dispose().catch(() => {
            logClientWarning(
              'Google Play billing cleanup failed.',
              new Error('Google Play billing cleanup failed.'),
            );
          });
        }
      };
    }, [authStatus, isAndroid, isPremium, refreshEntitlements, token]),
  );

  const selectedPrice =
    interval === 'annual'
      ? premium.annualPriceCents
      : premium.monthlyPriceCents;
  const annualMonthlyEquivalent = premium.annualPriceCents / 12;
  const savingsPercent = useMemo(() => {
    const fullAnnual = premium.monthlyPriceCents * 12;
    if (!fullAnnual) return 0;
    return Math.round(
      ((fullAnnual - premium.annualPriceCents) / fullAnnual) * 100,
    );
  }, [premium]);
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
  const usesStripeManagement =
    entitlements.source === 'stripe' || !entitlements.source;

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
    if (!playCanPurchase || playOperationLocked.current || !playMachine.current) {
      return;
    }
    playOperationLocked.current = true;
    try {
      await playMachine.current.purchase(interval);
    } catch {
      playOperationLocked.current = false;
      Alert.alert(t('billingUnavailable'), t('playUnavailableBody'));
    }
  }

  async function restoreGooglePlayPurchases() {
    if (!playCanRestore || playOperationLocked.current || !playMachine.current) {
      return;
    }
    playOperationLocked.current = true;
    try {
      await playMachine.current.restore();
    } catch {
      playOperationLocked.current = false;
      Alert.alert(t('billingUnavailable'), t('playUnavailableBody'));
    }
  }

  async function retryGooglePlayCompletion() {
    if (playOperationLocked.current || !playMachine.current) {
      return;
    }
    playOperationLocked.current = true;
    try {
      await playMachine.current.retryCompletion();
    } catch {
      playOperationLocked.current = false;
      Alert.alert(t('billingUnavailable'), t('playUnavailableBody'));
    }
  }

  const handleCheckoutReturn = useCallback(
    async (status: CheckoutReturnStatus) => {
      if (handledCheckoutReturn.current === status) return;
      handledCheckoutReturn.current = status;

      if (status === 'canceled') {
        setCheckoutReturnState('canceled');
        await refreshEntitlements();
        return;
      }

      setCheckoutReturnState('activating');
      const result = await pollForPremiumActivation(refreshEntitlements);
      setCheckoutReturnState(result);
    },
    [refreshEntitlements],
  );

  useEffect(() => {
    const rawCheckout = Array.isArray(params.checkout)
      ? params.checkout[0]
      : params.checkout;
    if (rawCheckout === 'success' || rawCheckout === 'canceled') {
      void handleCheckoutReturn(rawCheckout);
    }
  }, [handleCheckoutReturn, params.checkout]);

  async function openCheckout() {
    if (!token) return;
    setAction('checkout');
    try {
      const checkout = await createBillingCheckout(
        token,
        interval,
        'subscriptionScreen',
      );
      if (!checkout.checkoutUrl) {
        throw new Error(t('checkoutUrlMissing'));
      }
      handledCheckoutReturn.current = null;
      setCheckoutReturnState('idle');
      const returnUrl = `${APP_SCHEME}://subscription`;
      const browserResult = await WebBrowser.openAuthSessionAsync(
        checkout.checkoutUrl,
        returnUrl,
        {
          presentationStyle:
            WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        },
      );
      if (browserResult.type === 'success') {
        const status = checkoutReturnStatusFromUrl(browserResult.url);
        if (status) {
          await handleCheckoutReturn(status);
          return;
        }
      }
      await refreshEntitlements();
    } catch (error) {
      Alert.alert(
        t('checkoutUnavailable'),
        error instanceof Error ? error.message : t('pleaseTryAgain'),
      );
    } finally {
      setAction(null);
    }
  }

  async function openPortal() {
    if (!token) return;
    setAction('portal');
    try {
      const portal = await createBillingPortal(token);
      await WebBrowser.openBrowserAsync(portal.portalUrl);
      await refreshEntitlements();
    } catch (error) {
      Alert.alert(
        t('billingUnavailable'),
        error instanceof Error ? error.message : t('pleaseTryAgain'),
      );
    } finally {
      setAction(null);
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

  function confirmCancellation() {
    if (!token) return;
    Alert.alert(
      t('keepToolsTitle'),
      t('keepToolsBody'),
      [
        { text: t('keepOrganizerPro'), style: 'cancel' },
        {
          text: t('cancelRenewal'),
          style: 'destructive',
          onPress: async () => {
            setAction('cancel');
            try {
              await cancelPremiumSubscription(token);
              await refreshEntitlements();
              Alert.alert(
                t('renewalCanceled'),
                t('renewalCanceledBody'),
              );
            } catch (error) {
              Alert.alert(
                t('unableToCancel'),
                error instanceof Error ? error.message : t('pleaseTryAgain'),
              );
            } finally {
              setAction(null);
            }
          },
        },
      ],
    );
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
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
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

          <Animated.View entering={FadeInUp.springify()} style={styles.hero}>
            <View style={styles.crown}>
              <FontAwesome name="diamond" size={20} color={colors.premiumGold} />
            </View>
            <Text style={styles.eyebrow}>{t('eyebrow')}</Text>
            <Text style={styles.heroTitle}>{t('heroTitle')}</Text>
            <Text style={styles.heroCopy}>{premium.tagline}</Text>

            {isPremium ? (
              <View style={styles.activePill}>
                <FontAwesome name="check-circle" size={14} color={colors.successSoft} />
                <Text style={styles.activePillText}>
                  {entitlements.subscriptionStatus === 'trialing'
                    ? t('trialActive')
                    : t('active')}
                </Text>
              </View>
            ) : (
              <>
                {!isAndroid ? (
                  <Text style={styles.trialCopy}>
                    {t('trialCopy', { days: premium.trialDays })}
                  </Text>
                ) : selectedPlayPlan?.trial ? (
                  <Text style={styles.trialCopy}>
                    {t('playTrialCopy', {
                      period: formatPlayPeriod(
                        selectedPlayPlan.trial.billingPeriod,
                      ),
                    })}
                  </Text>
                ) : null}
              </>
            )}
          </Animated.View>

          {!isAndroid && checkoutReturnState !== 'idle' ? (
            <View
              style={[
                styles.checkoutStatus,
                checkoutReturnState === 'pending' && styles.checkoutStatusPending,
                checkoutReturnState === 'canceled' && styles.checkoutStatusCanceled,
              ]}
            >
              {checkoutReturnState === 'activating' ? (
                <ActivityIndicator color={colors.primaryDark} />
              ) : (
                <FontAwesome
                  name={
                    checkoutReturnState === 'activated'
                      ? 'check-circle'
                      : 'info-circle'
                  }
                  size={17}
                  color={colors.primaryDark}
                />
              )}
              <View style={styles.checkoutStatusText}>
                <Text style={styles.checkoutStatusTitle}>
                  {checkoutReturnState === 'activating'
                    ? t('activatingTitle')
                    : checkoutReturnState === 'activated'
                      ? t('activatedTitle')
                      : checkoutReturnState === 'pending'
                        ? t('pendingTitle')
                        : t('canceledTitle')}
                </Text>
                <Text style={styles.checkoutStatusBody}>
                  {checkoutReturnState === 'activating'
                    ? t('activatingBody')
                    : checkoutReturnState === 'activated'
                      ? t('activatedBody')
                      : checkoutReturnState === 'pending'
                        ? t('pendingBody')
                        : t('canceledBody')}
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

          {!isPremium ? (
            <Animated.View
              entering={FadeInDown.delay(100).springify()}
              style={styles.billingToggle}
            >
              <IntervalButton
                active={interval === 'monthly'}
                label={t('monthly')}
                disabled={isAndroid && (!playPlans || playBusy)}
                onPress={() => setInterval('monthly')}
              />
              <IntervalButton
                active={interval === 'annual'}
                label={t('annual')}
                badge={
                  isAndroid
                    ? undefined
                    : t('saveBadge', { percent: savingsPercent })
                }
                disabled={isAndroid && (!playPlans || playBusy)}
                onPress={() => setInterval('annual')}
              />
            </Animated.View>
          ) : null}

          <Animated.View
            entering={FadeInDown.delay(180).springify()}
            style={styles.priceCard}
          >
            <View style={styles.priceHeader}>
              <View>
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
              <View style={styles.recommendedBadge}>
                <FontAwesome name="star" size={10} color={colors.primaryDark} />
                <Text style={styles.recommendedText}>
                  {isPremium ? t('yourPlan') : t('bestValue')}
                </Text>
              </View>
            </View>

            {!isPremium ? (
              isAndroid ? (
                selectedPlayPlan ? (
                  <View style={styles.priceRow}>
                    <Text style={styles.playPrice}>
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
                <View style={styles.priceRow}>
                  <Text style={styles.price}>
                    {formatCurrency(selectedPrice / 100, language, 'USD', 2)}
                  </Text>
                  <View style={styles.priceMeta}>
                    <Text style={styles.pricePeriod}>
                      {interval === 'annual' ? t('perYear') : t('perMonth')}
                    </Text>
                    {interval === 'annual' ? (
                      <Text style={styles.equivalent}>
                        {t('monthlyEquivalent', {
                          amount: formatCurrency(
                            annualMonthlyEquivalent / 100,
                            language,
                            'USD',
                            2,
                          ),
                        })}
                      </Text>
                    ) : null}
                  </View>
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

            <View style={styles.divider} />

            <View style={styles.features}>
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
                    {t(`features.${feature}`, { defaultValue: feature })}
                  </Text>
                </View>
              ))}
            </View>

            {isPremium ? (
              <>
                {isGooglePlayEntitlement ? (
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
                ) : usesStripeManagement ? (
                  <>
                    <Pressable
                      style={({ pressed }) => [
                        styles.primaryButton,
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={() => void openPortal()}
                      disabled={action !== null}
                      accessibilityRole="button"
                      accessibilityLabel={t('manageBilling')}
                      accessibilityState={{ disabled: action !== null }}
                    >
                      {action === 'portal' ? (
                        <ActivityIndicator color={colors.onColor} />
                      ) : (
                        <>
                          <Text style={styles.primaryButtonText}>
                            {t('manageBilling')}
                          </Text>
                          <FontAwesome
                            name="external-link"
                            size={14}
                            color={colors.onColor}
                          />
                        </>
                      )}
                    </Pressable>
                    {!entitlements.cancelAtPeriodEnd ? (
                      <Pressable
                        style={styles.cancelButton}
                        onPress={confirmCancellation}
                        disabled={action !== null}
                        accessibilityRole="button"
                        accessibilityLabel={t('cancelRenewal')}
                        accessibilityState={{ disabled: action !== null }}
                      >
                        <Text style={styles.cancelButtonText}>
                          {t('cancelRenewal')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.managementUnavailable}>
                    {t('playManagementUnavailable')}
                  </Text>
                )}
              </>
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
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => void openCheckout()}
                disabled={action !== null || loading}
              >
                {action === 'checkout' ? (
                  <ActivityIndicator color={colors.onColor} />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>
                      {t('startTrial', { days: premium.trialDays })}
                    </Text>
                    <FontAwesome
                      name="arrow-right"
                      size={14}
                      color={colors.onColor}
                    />
                  </>
                )}
              </Pressable>
            )}
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
                <Text style={styles.freeCopy}>{t('freeCopy')}</Text>
              </View>
            </Animated.View>
          ) : null}

          <Text style={styles.footer}>
            {isAndroid ? t('playFooter') : t('footer')}
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
    paddingHorizontal: spacing.screenX,
    paddingBottom: 56,
  },
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
    fontSize: 10,
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
  intervalText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  intervalTextActive: { color: colors.primaryDark },
  savingsBadge: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  savingsText: { color: colors.successText, fontSize: 8, fontWeight: '900' },
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
  planName: { color: colors.textStrong, fontSize: 21, fontWeight: '900' },
  planAudience: { color: colors.muted, fontSize: 12, marginTop: 4 },
  recommendedBadge: {
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
    fontSize: 8,
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
    color: colors.subtle,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 24,
    paddingHorizontal: 20,
  },
});
