// app/subscription.tsx
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@/lib/theme';

const plans = [
  {
    name: "Free",
    price: 0,
    period: "forever",
    tagline: "Perfect for starting your first circle",
    features: [
      "1 active circle only",
      "Up to 20 members per circle",
      "Track current round",
      "View payment progress",
      "Basic payout order",
      "Contribution reminders",
      "Basic records",
    ],
    buttonText: "Continue Free",
    popular: false,
  },
  {
    name: "Premium Organizer",
    price: 4.99,
    period: "per month",
    tagline: "For organizers who manage serious circles",
    features: [
      "Unlimited circles",
      "More members per circle",
      "Full circle history",
      "Advanced records & exports",
      "Better reminders",
      "Priority support",
      "Organizer insights",
    ],
    buttonText: "Upgrade — $4.99/mo",
    popular: true,
  },
  {
    name: "Circle Pro",
    price: 9.99,
    period: "per month",
    tagline: "For community leaders & larger groups",
    features: [
      "Everything in Premium",
      "Larger groups",
      "Multiple organizers",
      "Advanced member roles",
      "Full ledger exports",
      "Circle archive",
      "Early access to new features",
    ],
    buttonText: "Start Circle Pro",
    popular: false,
  },
];

export default function SubscriptionScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose your plan</Text>
          <Text style={styles.subtitle}>
            Start free with one circle. Upgrade when you need more tools.
          </Text>
        </View>

        <View style={styles.plans}>
          {plans.map((plan, index) => (
            <View key={index} style={[styles.planCard, plan.popular && styles.popularCard]}>
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>Most Popular</Text>
                </View>
              )}

              <Text style={styles.planName}>{plan.name}</Text>
              <View style={styles.priceContainer}>
                <Text style={styles.price}>${plan.price}</Text>
                <Text style={styles.period}>/{plan.period}</Text>
              </View>
              <Text style={styles.tagline}>{plan.tagline}</Text>

              <View style={styles.features}>
                {plan.features.map((feature, i) => (
                  <View key={i} style={styles.featureRow}>
                    <FontAwesome name="check-circle" size={18} color={colors.success} />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                style={[styles.button, plan.popular && styles.popularButton]}
                onPress={() => {
                  if (plan.price === 0) {
                    router.back();
                  } else {
                    Alert.alert("Coming Soon", "Premium subscriptions will be available soon.");
                  }
                }}
              >
                <Text style={[styles.buttonText, plan.popular && styles.popularButtonText]}>
                  {plan.buttonText}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          Cancel anytime. Your circles and ledger stay safe in the backend.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: spacing.screenX, paddingBottom: 100 },
  header: { alignItems: 'center', marginBottom: 40, marginTop: 20 },
  title: { fontSize: 32, fontWeight: '900', color: colors.textStrong },
  subtitle: { textAlign: 'center', color: colors.muted, fontSize: 16, marginTop: 12 },

  plans: { gap: 24 },
  planCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 24,
    position: 'relative',
  },
  popularCard: {
    borderColor: colors.primary,
    borderWidth: 2.5,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  popularText: { color: '#fff', fontWeight: '900', fontSize: 12 },

  planName: { fontSize: 24, fontWeight: '900' },
  priceContainer: { flexDirection: 'row', alignItems: 'baseline', marginVertical: 12 },
  price: { fontSize: 48, fontWeight: '900' },
  period: { fontSize: 16, color: colors.muted, marginLeft: 4, flexShrink: 1 },

  tagline: { color: colors.muted, marginBottom: 20, fontSize: 15, flexWrap: 'wrap' },

  features: { gap: 12, marginBottom: 32 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 15, color: colors.text, flex: 1, flexWrap: 'wrap' },

  button: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  popularButton: { backgroundColor: colors.primary },
  buttonText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  popularButtonText: { color: '#fff' },

  note: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: 40,
    fontSize: 13,
  },
});
