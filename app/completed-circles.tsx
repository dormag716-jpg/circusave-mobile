import { FontAwesome } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCircles } from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { circleWorkspaceHref } from '@/lib/navigation';
import { isOrganizer } from '@/lib/permissions';
import { colors, radii, spacing } from '@/lib/theme';
import type { BackendCircleSummary } from '@/lib/types';

export default function CompletedCirclesScreen() {
  const { session } = useAuthSession();
  const [circles, setCircles] = useState<BackendCircleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const token = session?.session.token;

  const loadCircles = useCallback(async () => {
    if (!token) {
      setError('Your session is missing an access token.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const allCircles = await getCircles(token);
      setCircles(allCircles.filter((c) => c.status === 'completed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load completed circles.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void loadCircles();
    }, [loadCircles])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <FontAwesome name="chevron-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Completed Circles</Text>
        <View style={{ width: 44 }} />
      </View>

      <FlatList
        data={circles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerCard}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.centerText}>Loading history…</Text>
            </View>
          ) : error ? (
            <View style={styles.centerCard}>
              <FontAwesome name="warning" size={32} color={colors.warning} />
              <Text style={styles.errorTitle}>Unable to load history</Text>
              <Text style={styles.errorSubtitle}>{error}</Text>
              <Pressable style={styles.retryButton} onPress={() => void loadCircles()}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.iconContainer}>
                <FontAwesome name="check-circle-o" size={48} color={colors.success} />
              </View>
              <Text style={styles.emptyTitle}>No completed circles yet</Text>
              <Text style={styles.emptyText}>
                When a circle finishes all of its rounds and all payouts have been distributed, it will appear here in your archive.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <CompletedCircleCard circle={item} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
      />
    </SafeAreaView>
  );
}

function CompletedCircleCard({ circle }: { circle: BackendCircleSummary }) {
  const userIsOrganizer = isOrganizer(circle.userRole);
  
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push(circleWorkspaceHref(circle.id))}
    >
      <View style={styles.cardHeader}>
        <View style={styles.circleInfo}>
          <View style={styles.circleTitleRow}>
            <Text style={styles.circleName}>{circle.name}</Text>
            {userIsOrganizer ? (
              <View style={styles.organizerTag}>
                <Text style={styles.organizerTagText}>Organizer</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.circleMeta}>
            Finished • {circle.memberCount} members
          </Text>
        </View>
        <FontAwesome name="check-circle" size={24} color={colors.success} />
      </View>
      
      <View style={styles.detailsRow}>
        <View style={styles.detail}>
          <Text style={styles.detailLabel}>Contribution</Text>
          <Text style={styles.detailValue}>
            {formatMoney(circle.contributionAmount)}
          </Text>
        </View>
        <View style={styles.detail}>
          <Text style={styles.detailLabel}>Total Pot</Text>
          <Text style={styles.detailValue}>
            {formatMoney(circle.contributionAmount * circle.memberCount)}
          </Text>
        </View>
      </View>
      
      {userIsOrganizer && (
        <View style={styles.restartContainer}>
          <Pressable 
            style={({ pressed }) => [styles.restartButton, pressed && styles.pressed]}
            onPress={(e) => {
              e.stopPropagation();
              router.push(`/create-circle/setup?sourceCircleId=${circle.id}`);
            }}
          >
            <FontAwesome name="refresh" size={16} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.restartButtonText}>Restart Circle with these Members</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenX,
    paddingVertical: 12,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    color: colors.textStrong,
    fontSize: 20,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  content: {
    paddingBottom: 60,
    paddingHorizontal: spacing.screenX,
    paddingTop: 10,
    flexGrow: 1,
  },
  centerCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 32,
    marginTop: 20,
  },
  centerText: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 16,
  },
  errorTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 16,
  },
  errorSubtitle: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  cardStack: {
    gap: 16,
    paddingTop: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  circleInfo: {
    flex: 1,
  },
  circleTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  circleName: {
    color: colors.textStrong,
    fontSize: 20,
    fontWeight: '900',
  },
  organizerTag: {
    backgroundColor: `${colors.primary}20`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  organizerTagText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  circleMeta: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
  },
  detailsRow: {
    borderTopColor: colors.cardBorder,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 32,
    paddingTop: 16,
  },
  detail: {
    flex: 1,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 60,
  },
  iconContainer: {
    backgroundColor: `${colors.success}15`,
    borderRadius: 50,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    marginBottom: 24,
  },
  emptyTitle: {
    color: colors.textStrong,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  restartContainer: {
    borderTopColor: colors.cardBorder,
    borderTopWidth: 1,
    marginTop: 20,
    paddingTop: 16,
  },
  restartButton: {
    alignItems: 'center',
    backgroundColor: `${colors.primary}15`,
    borderRadius: radii.control,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  restartButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
  },
});
