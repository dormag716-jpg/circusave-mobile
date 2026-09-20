import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAuthSession } from '@/lib/authContext';
import { colors, spacing } from '@/lib/theme';

export default function AutomatedPaymentsScreen() {
  const { session } = useAuthSession();
  const { t } = useTranslation(['settings', 'contributions', 'common']);

  if (!session) return null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={20}
          accessibilityRole="button"
          accessibilityLabel={t('common:goBack')}
        >
          <FontAwesome name="chevron-left" size={20} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('automatedPaymentsTitle')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.bankCard}>
          <View style={styles.bankHeaderRow}>
            <View style={styles.bankIconContainer}>
              <FontAwesome name="bank" size={20} color={colors.primary} />
            </View>
            <Text style={styles.bankTitle}>{t('automatedPaymentsTitle')}</Text>
          </View>
          <Text style={styles.bankDescription}>
            {t('contributions:rails.contributionPaymentsDisabledBody')}
          </Text>
          <Text style={styles.disabledText}>
            {t('common:unsupported')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenX,
    paddingVertical: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textStrong,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -8,
    width: 44,
  },
  headerRight: { width: 40 },
  content: {
    paddingBottom: 100,
    paddingHorizontal: spacing.screenX,
    paddingTop: 24,
  },
  bankCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 20,
    marginBottom: 24,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  bankHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bankIconContainer: {
    backgroundColor: colors.primarySoft,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bankTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textStrong,
  },
  bankDescription: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 20,
  },
  disabledText: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
});
