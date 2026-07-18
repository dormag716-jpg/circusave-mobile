import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View, Pressable, Alert, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing, shadows } from '@/lib/theme';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const plans = [
  {
    name: "Free",
    price: 0,
    period: "forever",
    tagline: "Perfect for starting your first circle",
    features: [
      "1 open circle at a time (setup or active)",
      "Up to 20 members per circle",
      "Track current round",
      "View payment progress",
      "Basic payout order",
      "Start a new circle after you complete one",
    ],
    buttonText: "Continue Free",
    popular: false,
    theme: 'light',
  },
  {
    name: "Premium Organizer",
    price: 4.99,
    period: "per month",
    tagline: "For organizers who manage serious circles",
    features: [
      "Unlimited circles",
      "Up to 50 members per circle",
      "Full circle history",
      "Advanced records & exports",
      "Better reminders",
      "Priority support",
    ],
    buttonText: "Upgrade — $4.99/mo",
    popular: true,
    theme: 'primary',
  },
  {
    name: "Circle Pro",
    price: 9.99,
    period: "per month",
    tagline: "For community leaders & larger groups",
    features: [
      "Everything in Premium",
      "Multiple organizers",
      "Advanced member roles",
      "Full ledger exports",
      "Circle archive",
    ],
    buttonText: "Start Circle Pro",
    popular: false,
    theme: 'dark',
  },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function PlanButton({ plan, onPress }: { plan: typeof plans[0], onPress: () => void }) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isLight = plan.theme === 'light';
  
  return (
    <AnimatedPressable
      onPressIn={() => { scale.value = withSpring(0.95, { damping: 12, stiffness: 200 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 200 }); }}
      onPress={onPress}
      style={[
        styles.button,
        isLight ? styles.buttonLight : styles.buttonDark,
        plan.theme === 'primary' && { backgroundColor: '#fff' },
        animatedStyle
      ]}
    >
      <Text style={[
        styles.buttonText,
        isLight ? styles.buttonTextLight : styles.buttonTextDark,
        plan.theme === 'primary' && { color: colors.primaryDark }
      ]}>
        {plan.buttonText}
      </Text>
    </AnimatedPressable>
  );
}

export default function SubscriptionScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.backgroundAccent} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          
          <Animated.View entering={FadeInDown.springify().damping(14)} style={styles.header}>
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>PLANS & PRICING</Text>
            </View>
            <Text style={styles.title}>Unlock More Power</Text>
            <Text style={styles.subtitle}>
              Start free. Upgrade when you need more tools to manage your circles.
            </Text>
          </Animated.View>

          <View style={styles.plans}>
            {plans.map((plan, index) => {
              const isDark = plan.theme === 'dark';
              const isPrimary = plan.theme === 'primary';
              const textColor = isDark || isPrimary ? '#fff' : colors.textStrong;
              const mutedColor = isDark || isPrimary ? 'rgba(255,255,255,0.75)' : colors.muted;
              
              return (
                <Animated.View 
                  key={index} 
                  entering={FadeInDown.delay(100 + index * 100).springify().damping(14)}
                  style={[
                    styles.planCard,
                    isDark && styles.darkCard,
                    isPrimary && styles.primaryCard,
                    plan.popular && shadows.medium
                  ]}
                >
                  {plan.popular && (
                    <View style={styles.popularBadge}>
                      <Text style={styles.popularText}>MOST POPULAR</Text>
                    </View>
                  )}

                  <Text style={[styles.planName, { color: textColor }]}>{plan.name}</Text>
                  
                  <View style={styles.priceContainer}>
                    <Text style={[styles.price, { color: textColor }]}>${plan.price}</Text>
                    <Text style={[styles.period, { color: mutedColor }]}>/{plan.period}</Text>
                  </View>
                  
                  <Text style={[styles.tagline, { color: mutedColor }]}>{plan.tagline}</Text>

                  <View style={[styles.divider, isDark || isPrimary ? { backgroundColor: 'rgba(255,255,255,0.15)' } : {}]} />

                  <View style={styles.features}>
                    {plan.features.map((feature, i) => (
                      <View key={i} style={styles.featureRow}>
                        <View style={[styles.iconWrapper, isDark || isPrimary ? { backgroundColor: 'rgba(255,255,255,0.2)' } : { backgroundColor: colors.successSoft }]}>
                          <FontAwesome 
                            name="check" 
                            size={10} 
                            color={isDark || isPrimary ? '#fff' : colors.success} 
                          />
                        </View>
                        <Text style={[styles.featureText, { color: textColor }]}>{feature}</Text>
                      </View>
                    ))}
                  </View>

                  <PlanButton 
                    plan={plan} 
                    onPress={() => {
                      if (plan.price === 0) {
                        router.back();
                      } else {
                        Alert.alert("Coming Soon", "Premium subscriptions will be available soon.");
                      }
                    }} 
                  />
                </Animated.View>
              );
            })}
          </View>

          <Animated.Text entering={FadeInDown.delay(500).springify()} style={styles.note}>
            Cancel anytime. Your circles and ledger stay safe in the backend.
          </Animated.Text>
          
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
  
  header: { alignItems: 'center', marginBottom: 40 },
  badgeContainer: {
    backgroundColor: 'rgba(107, 70, 193, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 16,
  },
  badgeText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: { fontSize: 36, fontWeight: '900', color: colors.textStrong, marginBottom: 12, letterSpacing: -0.5 },
  subtitle: { textAlign: 'center', color: colors.muted, fontSize: 16, lineHeight: 24, paddingHorizontal: 10 },

  plans: { gap: 24 },
  planCard: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    ...shadows.small,
  },
  darkCard: {
    backgroundColor: '#0F172A',
    borderColor: '#1E293B',
  },
  primaryCard: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  popularBadge: {
    position: 'absolute',
    top: -14,
    alignSelf: 'center',
    backgroundColor: colors.warning,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    ...shadows.small,
  },
  popularText: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1 },

  planName: { fontSize: 24, fontWeight: '900', marginBottom: 8, letterSpacing: -0.3 },
  priceContainer: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  price: { fontSize: 48, fontWeight: '900', letterSpacing: -1.5 },
  period: { fontSize: 16, marginLeft: 4, fontWeight: '600' },
  tagline: { fontSize: 15, lineHeight: 22, marginBottom: 24 },
  
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginBottom: 24,
  },

  features: { gap: 16, marginBottom: 36 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconWrapper: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { fontSize: 15, flex: 1, fontWeight: '500' },

  button: {
    borderRadius: radii.pill,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.small,
  },
  buttonLight: { backgroundColor: colors.primarySoft, elevation: 0 },
  buttonDark: { backgroundColor: colors.primary },
  
  buttonText: { fontWeight: '800', fontSize: 16 },
  buttonTextLight: { color: colors.primaryDark },
  buttonTextDark: { color: '#fff' },

  note: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: 40,
    fontSize: 14,
    fontWeight: '500',
  },
});
