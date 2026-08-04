import React, { useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTranslation } from 'react-i18next';

import { colors, radii, spacing, shadows } from '@/lib/theme';
import { useEntitlements } from '@/lib/entitlementsContext';
import { formatDateTime } from '@/lib/i18n/formatters';

const { width } = Dimensions.get('window');

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function PlanButton({
  label,
  theme,
  disabled,
  onPress,
}: {
  label: string;
  theme: 'light' | 'primary' | 'dark';
  disabled?: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isLight = theme === 'light';

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={() => {
        if (!disabled) scale.value = withSpring(0.95, { damping: 12, stiffness: 200 });
      }}
      onPressOut={() => {
        if (!disabled) scale.value = withSpring(1, { damping: 12, stiffness: 200 });
      }}
      onPress={onPress}
      style={[
        styles.button,
        isLight ? styles.buttonLight : styles.buttonDark,
        theme === 'primary' && { backgroundColor: colors.card },
        disabled && styles.buttonDisabled,
        animatedStyle,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          isLight ? styles.buttonTextLight : styles.buttonTextDark,
          theme === 'primary' && { color: colors.primaryDark },
          disabled && styles.buttonTextDisabled,
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export default function SubscriptionScreen() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language || 'en';
  const { entitlements, isPremium, refreshEntitlements } = useEntitlements();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const refreshed = await refreshEntitlements();
      Alert.alert(
        'Entitlements Synced',
        refreshed.plan === 'premium'
          ? 'Your Premium Organizer subscription is active and verified.'
          : 'Your account is on the Free plan.',
      );
    } catch {
      Alert.alert(
        'Sync Error',
        'Unable to sync entitlements. Please check your network connection.',
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleUpgradePrompt = () => {
    Alert.alert(
      'Upgrade to Premium Organizer',
      'Get unlimited circles, 50 members per circle, payout PDFs, advanced reports, and AI assistance for $4.99/month.\n\nCancel anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify / Sync Plan',
          onPress: () => {
            void handleSync();
          },
        },
      ],
    );
  };

  const formattedPeriodEnd = entitlements.currentPeriodEnd
    ? formatDateTime(entitlements.currentPeriodEnd, language)
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.backgroundAccent} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.springify().damping(14)} style={styles.header}>
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>CIRCUSAVE PREMIUM</Text>
            </View>
            <Text style={styles.title}>
              {isPremium ? 'Your Premium Active' : 'Unlock More Power'}
            </Text>
            <Text style={styles.subtitle}>
              {isPremium
                ? 'You have full access to Premium Organizer features, advanced reports, and AI tools.'
                : 'Start free. Upgrade when you need higher capacity, payout PDFs, and AI assistance.'}
            </Text>
          </Animated.View>

          {isPremium ? (
            <Animated.View
              entering={FadeInDown.springify().damping(14)}
              style={styles.activeBanner}
            >
              <View style={styles.bannerHeader}>
                <FontAwesome
                  name="check-circle"
                  size={20}
                  color={colors.success}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.bannerTitle}>Premium Organizer Active</Text>
              </View>
              {formattedPeriodEnd ? (
                <Text style={styles.bannerSubtitle}>
                  {entitlements.cancelAtPeriodEnd
                    ? `Access continues until ${formattedPeriodEnd}`
                    : `Renews on ${formattedPeriodEnd}`}
                </Text>
              ) : null}
              {entitlements.subscriptionStatus === 'trialing' && entitlements.trialEndsAt ? (
                <Text style={styles.bannerSubtitle}>
                  Trial ends {formatDateTime(entitlements.trialEndsAt, language)}
                </Text>
              ) : null}
              {entitlements.source !== 'none' ? (
                <Text style={styles.bannerSource}>
                  Billing via {entitlements.source.toUpperCase()}
                </Text>
              ) : null}
            </Animated.View>
          ) : null}

          <View style={styles.plans}>
            <Animated.View
              entering={FadeInDown.delay(100).springify().damping(14)}
              style={[styles.planCard, !isPremium && styles.activePlanCardBorder]}
            >
              {!isPremium ? (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>CURRENT PLAN</Text>
                </View>
              ) : null}
              <Text style={styles.planName}>Free</Text>
              <View style={styles.priceContainer}>
                <Text style={styles.price}>$0</Text>
                <Text style={styles.period}>/forever</Text>
              </View>
              <Text style={styles.tagline}>Complete manual tools for core circles</Text>
              <View style={styles.divider} />

              <View style={styles.features}>
                {[
                  '1 open circle at a time',
                  'Up to 20 members per circle',
                  'Manual Smart Save tools',
                  'Submit & approve contributions',
                  'Release & record payouts',
                  'Basic circle reminders',
                ].map((feature, i) => (
                  <View key={i} style={styles.featureRow}>
                    <View style={styles.iconWrapperLight}>
                      <FontAwesome name="check" size={10} color={colors.success} />
                    </View>
                    <Text style={styles.featureTextLight}>{feature}</Text>
                  </View>
                ))}
              </View>

              <PlanButton
                label={!isPremium ? 'Current Plan' : 'Included Free'}
                theme="light"
                disabled={!isPremium}
                onPress={() => router.back()}
              />
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(200).springify().damping(14)}
              style={[styles.planCard, styles.primaryCard, shadows.medium]}
            >
              {isPremium ? (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>ACTIVE PLAN</Text>
                </View>
              ) : (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>RECOMMENDED</Text>
                </View>
              )}

              <Text style={[styles.planName, { color: colors.onColor }]}>Premium Organizer</Text>
              <View style={styles.priceContainer}>
                <Text style={[styles.price, { color: colors.onColor }]}>$4.99</Text>
                <Text style={[styles.period, { color: 'rgba(255,255,255,0.75)' }]}>
                  /per month
                </Text>
              </View>
              <Text style={[styles.tagline, { color: 'rgba(255,255,255,0.75)' }]}>
                For organizers who manage serious circles
              </Text>
              <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />

              <View style={styles.features}>
                {[
                  'Unlimited open circles',
                  'Up to 50 members per circle',
                  'Full activity & circle history',
                  'Payout-order PDFs (Draft & Final)',
                  'Advanced organizer reports & exports',
                  'Enhanced reminders & scheduling',
                  'AI Susu Assistant',
                ].map((feature, i) => (
                  <View key={i} style={styles.featureRow}>
                    <View style={styles.iconWrapperDark}>
                      <FontAwesome name="check" size={10} color={colors.onColor} />
                    </View>
                    <Text style={[styles.featureText, { color: colors.onColor }]}>{feature}</Text>
                  </View>
                ))}
              </View>

              <PlanButton
                label={isPremium ? 'Active Subscription' : 'Upgrade — $4.99/mo'}
                theme="primary"
                disabled={isPremium}
                onPress={handleUpgradePrompt}
              />
            </Animated.View>
          </View>

          <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.syncContainer}>
            <Pressable
              style={({ pressed }) => [styles.syncButton, pressed && styles.syncButtonPressed]}
              onPress={() => void handleSync()}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <FontAwesome
                    name="refresh"
                    size={14}
                    color={colors.primary}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.syncButtonText}>
                    Sync Entitlements / Restore Purchases
                  </Text>
                </>
              )}
            </Pressable>
            <Text style={styles.note}>
              Cancel anytime. Essential financial authority is always retained on Free.
            </Text>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  backgroundAccent: {
    position: 'absolute',
    top: -width * 0.5,
    left: -width * 0.2,
    width: width * 1.4,
    height: width * 1.4,
    borderRadius: width * 0.7,
    backgroundColor: colors.primarySoft,
    opacity: 0.7,
  },
  safeArea: { flex: 1 },
  content: { padding: spacing.screenX, paddingBottom: 60, paddingTop: 10 },

  header: { alignItems: 'center', marginBottom: 24 },
  badgeContainer: {
    backgroundColor: colors.primaryTint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },
  badgeText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.textStrong,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 10,
  },

  activeBanner: {
    backgroundColor: `${colors.success}15`,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: `${colors.success}30`,
  },
  bannerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  bannerTitle: { fontSize: 16, fontWeight: '800', color: colors.success },
  bannerSubtitle: { fontSize: 13, color: colors.textStrong, marginTop: 2 },
  bannerSource: { fontSize: 11, color: colors.muted, marginTop: 4, fontWeight: '700' },

  plans: { gap: 24 },
  planCard: {
    backgroundColor: colors.card,
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    ...shadows.small,
  },
  activePlanCardBorder: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  primaryCard: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },

  popularBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: colors.warning,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    ...shadows.small,
  },
  popularText: { color: colors.onColor, fontWeight: '900', fontSize: 10, letterSpacing: 1 },

  currentBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    ...shadows.small,
  },
  currentBadgeText: { color: colors.onColor, fontWeight: '900', fontSize: 10, letterSpacing: 1 },

  planName: { fontSize: 22, fontWeight: '900', marginBottom: 6, color: colors.textStrong },
  priceContainer: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 },
  price: {
    fontSize: 44,
    fontWeight: '900',
    color: colors.textStrong,
    letterSpacing: -1.5,
  },
  period: { fontSize: 15, marginLeft: 4, fontWeight: '600', color: colors.muted },
  tagline: { fontSize: 14, lineHeight: 20, marginBottom: 20, color: colors.muted },

  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginBottom: 20,
  },

  features: { gap: 14, marginBottom: 28 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrapperLight: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperDark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextLight: { fontSize: 14, flex: 1, fontWeight: '500', color: colors.textStrong },
  featureText: { fontSize: 14, flex: 1, fontWeight: '500' },

  button: {
    borderRadius: radii.pill,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.small,
  },
  buttonLight: { backgroundColor: colors.primarySoft },
  buttonDark: { backgroundColor: colors.primary },
  buttonDisabled: { opacity: 0.65 },

  buttonText: { fontWeight: '800', fontSize: 15 },
  buttonTextLight: { color: colors.primaryDark },
  buttonTextDark: { color: colors.onColor },
  buttonTextDisabled: { color: colors.muted },

  syncContainer: { alignItems: 'center', marginTop: 32 },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radii.pill,
    backgroundColor: `${colors.primary}10`,
  },
  syncButtonPressed: { backgroundColor: `${colors.primary}20` },
  syncButtonText: { color: colors.primary, fontWeight: '800', fontSize: 14 },

  note: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: 20,
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 20,
  },
});
