import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCircles } from '@/lib/api';
import type { BackendCircleSummary } from '@/lib/types';
import { useAuthSession } from '@/lib/authContext';
import {
  buildOpenCircleCapacity,
  openCircleLimitMessage,
} from '@/lib/circleCapacity';
import { circleWorkspaceHref, myCirclesHref } from '@/lib/navigation';
import { colors, radii, spacing } from '@/lib/theme';

type BenefitIcon = React.ComponentProps<typeof FontAwesome>['name'];

export default function CreateCircleGuideScreen() {
  const { session } = useAuthSession();
  const token = session?.session.token;
  const role = session?.user?.role;

  const [circles, setCircles] = useState<BackendCircleSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getCircles(token)
      .then(setCircles)
      .catch(() => setCircles([]))
      .finally(() => setLoading(false));
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openCap = buildOpenCircleCapacity({
    circles,
    organizerRoleOrTier: role,
    organizerOwnedOnly: true,
  });
  const hasReachedLimit = openCap.atCapacity;
  const existingId = openCap.primaryOpenCircleId;
  const existing = existingId
    ? circles.find((c) => c.id === existingId)
    : undefined;
  const existingIsSetup =
    existing &&
    ['draft', 'setup', 'forming'].includes(
      String(existing.status || '').toLowerCase(),
    );

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
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
        <View style={styles.hero}>
          <Text style={styles.emoji}>👥</Text>
          <Text style={styles.title}>Start a new Circle</Text>
          <Text style={styles.subtitle}>
            Create a trusted savings group with family or friends.{'\n'}
            Simple, transparent, and secure.
          </Text>
        </View>

        <View style={styles.planNote}>
          <FontAwesome name="info-circle" size={16} color={colors.primary} />
          <Text style={styles.planNoteText}>
            Free plan: <Text style={styles.planNoteStrong}>1 open circle</Text> at
            a time (setup or active). Complete a circle to free your slot, or
            upgrade for unlimited circles.
          </Text>
        </View>

        <View style={styles.benefits}>
          <Benefit icon="lock" text="Authoritative ledger" />
          <Benefit icon="users" text="Trusted members only" />
          <Benefit icon="calendar" text="Automatic reminders" />
        </View>

        {hasReachedLimit ? (
          <View style={styles.limitCard}>
            <View style={styles.limitIcon}>
              <FontAwesome name="lock" size={24} color={colors.warning} />
            </View>
            <Text style={styles.limitTitle}>Free plan limit</Text>
            <Text style={styles.limitText}>{openCircleLimitMessage(openCap)}</Text>
            {existingId ? (
              <Pressable
                style={styles.upgradeButton}
                onPress={() => router.push(circleWorkspaceHref(existingId))}
              >
                <Text style={styles.upgradeButtonText}>
                  {existingIsSetup
                    ? `Continue “${existing?.name || 'your circle'}”`
                    : `Open “${existing?.name || 'your circle'}”`}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.upgradeButton}
                onPress={() => router.push(myCirclesHref)}
              >
                <Text style={styles.upgradeButtonText}>Go to My Circles</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.push('/subscription')}
            >
              <Text style={styles.secondaryButtonText}>View Premium plans</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push('/create-circle/setup')}
              accessibilityRole="button"
              accessibilityLabel="Create new circle"
            >
              <Text style={styles.primaryButtonText}>Create New Circle</Text>
            </Pressable>

            <Text style={styles.note}>
              Free: 1 open circle · Up to 20 members · Takes about 2 minutes
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Benefit({ icon, text }: { icon: BenefitIcon; text: string }) {
  return (
    <View style={styles.benefitRow}>
      <View style={styles.benefitIcon}>
        <FontAwesome name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 100,
    paddingHorizontal: spacing.screenX,
    paddingTop: 40,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 24,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    color: colors.textStrong,
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 26,
    marginTop: 12,
    textAlign: 'center',
  },
  planNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: 14,
    marginBottom: 28,
  },
  planNoteText: {
    flex: 1,
    color: colors.primaryDark,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  planNoteStrong: {
    fontWeight: '900',
  },
  benefits: {
    gap: 20,
    marginBottom: 40,
  },
  benefitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  benefitIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 22,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  benefitText: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    justifyContent: 'center',
    marginBottom: 16,
    minHeight: 62,
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  note: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  limitCard: {
    backgroundColor: '#fff',
    borderRadius: radii.card,
    padding: spacing.card,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.warning,
  },
  limitIcon: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  limitTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textStrong,
    marginBottom: 8,
  },
  limitText: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  upgradeButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: radii.pill,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
  },
});
