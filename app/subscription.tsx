import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import appConfig from '@/app.json';
import {
  cancelPremiumSubscription,
  createBillingCheckout,
  createBillingPortal,
  getBillingPlans,
  type BillingPlan,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { useEntitlements } from '@/lib/entitlementsContext';
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

export default function SubscriptionScreen() {
  const { t, i18n } = useTranslation(['subscription', 'common']);
  const language = i18n.resolvedLanguage || i18n.language;
  const params = useLocalSearchParams<{ checkout?: string | string[] }>();
  const { session } = useAuthSession();
  const { entitlements, isPremium, refreshEntitlements } = useEntitlements();
  const token = session?.session.token;
  const [premium, setPremium] = useState<BillingPlan>(fallbackPremium);
  const [interval, setInterval] = useState<BillingInterval>('annual');
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'checkout' | 'portal' | 'cancel' | null>(
    null,
  );
  const [checkoutReturnState, setCheckoutReturnState] =
    useState<CheckoutReturnState>('idle');
  const handledCheckoutReturn = useRef<CheckoutReturnStatus | null>(null);

  useEffect(() => {
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
  }, []);

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
      const returnUrl = `${appConfig.expo.scheme}://subscription`;
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
              <Text style={styles.trialCopy}>
                {t('trialCopy', { days: premium.trialDays })}
              </Text>
            )}
          </Animated.View>

          {checkoutReturnState !== 'idle' ? (
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

          {!isPremium ? (
            <Animated.View
              entering={FadeInDown.delay(100).springify()}
              style={styles.billingToggle}
            >
              <IntervalButton
                active={interval === 'monthly'}
                label={t('monthly')}
                onPress={() => setInterval('monthly')}
              />
              <IntervalButton
                active={interval === 'annual'}
                label={t('annual')}
                badge={t('saveBadge', { percent: savingsPercent })}
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
                <Text style={styles.planName}>{t('productName')}</Text>
                <Text style={styles.planAudience}>{t('audience')}</Text>
              </View>
              <View style={styles.recommendedBadge}>
                <FontAwesome name="star" size={10} color={colors.primaryDark} />
                <Text style={styles.recommendedText}>
                  {isPremium ? t('yourPlan') : t('bestValue')}
                </Text>
              </View>
            </View>

            {!isPremium ? (
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
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => void openPortal()}
                  disabled={action !== null}
                >
                  {action === 'portal' ? (
                    <ActivityIndicator color={colors.onColor} />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>{t('manageBilling')}</Text>
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
                  >
                    <Text style={styles.cancelButtonText}>
                      {t('cancelRenewal')}
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

          <Text style={styles.footer}>{t('footer')}</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function IntervalButton({
  active,
  label,
  badge,
  onPress,
}: {
  active: boolean;
  label: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.intervalButton, active && styles.intervalButtonActive]}
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
  buttonPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  primaryButtonText: {
    color: colors.onColor,
    fontSize: 15,
    fontWeight: '900',
  },
  cancelButton: { alignItems: 'center', paddingVertical: 14 },
  cancelButtonText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
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
