import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCircles } from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { isOrganizer } from '@/lib/permissions';
import { colors, radii, shadows, spacing } from '@/lib/theme';
import type { BackendCircleSummary } from '@/lib/types';

export default function SmartRemindersScreen() {
  const { t } = useTranslation('settings');
  const { session } = useAuthSession();
  const token = session?.session.token;
  const [circles, setCircles] = useState<BackendCircleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCircles = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getCircles(token);
      setCircles(
        response.filter(
          (circle) =>
            isOrganizer(circle.userRole) &&
            !['completed', 'archived', 'closed'].includes(
              String(circle.status || '').toLowerCase(),
            ),
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t('smartRemindersErrorTitle'),
      );
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useFocusEffect(
    useCallback(() => {
      void loadCircles();
    }, [loadCircles]),
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <FontAwesome name="chevron-left" size={18} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('smartRemindersScreenTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={circles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={styles.intro}>{t('smartRemindersScreenBody')}</Text>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.stateText}>{t('smartRemindersLoading')}</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <FontAwesome name="warning" size={28} color={colors.warning} />
              <Text style={styles.stateTitle}>{t('smartRemindersErrorTitle')}</Text>
              <Text style={styles.stateText}>{error}</Text>
              <Pressable style={styles.retryButton} onPress={() => void loadCircles()}>
                <Text style={styles.retryText}>{t('smartRemindersRetry')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.stateCard}>
              <FontAwesome name="bell-o" size={30} color={colors.muted} />
              <Text style={styles.stateTitle}>{t('smartRemindersEmptyTitle')}</Text>
              <Text style={styles.stateText}>{t('smartRemindersEmptyBody')}</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.circleRow, pressed && styles.pressed]}
            onPress={() =>
              router.push(
                `/circle/reminder-schedule?circleId=${encodeURIComponent(item.id)}` as Href,
              )
            }
            accessibilityRole="button"
            accessibilityLabel={`${t('smartReminders')}: ${item.name}`}
          >
            <View style={styles.circleIcon}>
              <FontAwesome name="bell" size={17} color={colors.primary} />
            </View>
            <View style={styles.circleCopy}>
              <Text style={styles.circleName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.circleMeta}>
                {item.memberCount} members · {item.frequency}
              </Text>
            </View>
            <FontAwesome name="chevron-right" size={13} color={colors.subtle} />
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: spacing.screenX,
    paddingVertical: 12,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerTitle: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flexGrow: 1,
    padding: spacing.screenX,
  },
  intro: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  circleRow: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 76,
    padding: 14,
    ...shadows.small,
  },
  circleIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  circleCopy: {
    flex: 1,
    minWidth: 0,
  },
  circleName: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: '900',
  },
  circleMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  separator: {
    height: 12,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    marginTop: 24,
    padding: 28,
  },
  stateTitle: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  stateText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: {
    color: colors.onColor,
    fontSize: 13,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.75,
  },
});
