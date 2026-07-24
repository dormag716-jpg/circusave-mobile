import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthSession } from '@/lib/authContext';
import { colors, radii, shadows, spacing } from '@/lib/theme';

export default function Index() {
  const { status } = useAuthSession();
  const { t } = useTranslation('auth');

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // If already logged in, go straight to the dashboard
  if (status === 'authenticated') {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  // Mobile-first landing screen for unauthenticated users
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <View style={styles.logoContainer}>
            <FontAwesome name="users" size={48} color="#ffffff" />
          </View>
          <Text style={styles.appName}>CircuSave</Text>
          <Text style={styles.headline}>{t('landing.headline')}</Text>
          <Text style={styles.subhead}>
            {t('landing.subhead')}
          </Text>
        </View>

        <View style={styles.benefitsSection}>
          <View style={styles.benefitCard}>
            <View style={styles.benefitIconWrapper}>
              <FontAwesome name="line-chart" size={20} color={colors.primary} />
            </View>
            <Text style={styles.benefitTitle}>{t('landing.trackContributions')}</Text>
          </View>

          <View style={styles.benefitCard}>
            <View style={styles.benefitIconWrapper}>
              <FontAwesome name="money" size={20} color={colors.primary} />
            </View>
            <Text style={styles.benefitTitle}>{t('landing.organizePayouts')}</Text>
          </View>

          <View style={styles.benefitCard}>
            <View style={styles.benefitIconWrapper}>
              <FontAwesome name="bell" size={20} color={colors.primary} />
            </View>
            <Text style={styles.benefitTitle}>{t('landing.stayNotified')}</Text>
          </View>
        </View>

        <View style={styles.actionsSection}>
          <Pressable 
            style={styles.primaryButton} 
            onPress={() => router.push('/create-account')}
            accessibilityRole="button"
            accessibilityLabel={t('landing.getStarted')}
          >
            <Text style={styles.primaryButtonText}>{t('landing.getStarted')}</Text>
          </Pressable>
          <Pressable 
            style={styles.secondaryButton} 
            onPress={() => router.push('/login')}
            accessibilityRole="button"
            accessibilityLabel={t('landing.signIn')}
          >
            <Text style={styles.secondaryButtonText}>{t('landing.signIn')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.primarySoft,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.screenX,
    paddingTop: 40,
    paddingBottom: 40,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroSection: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 40,
  },
  logoContainer: {
    width: 88,
    height: 88,
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...shadows.medium,
  },
  appName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5,
    marginBottom: 24,
    textTransform: 'uppercase',
  },
  headline: {
    fontSize: 38,
    fontWeight: '900',
    color: colors.textStrong,
    textAlign: 'center',
    lineHeight: 44,
    marginBottom: 16,
  },
  subhead: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  benefitsSection: {
    width: '100%',
    maxWidth: 400,
    gap: 12,
    marginBottom: 48,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...shadows.small,
  },
  benefitIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  benefitTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textStrong,
  },
  actionsSection: {
    width: '100%',
    maxWidth: 400,
    gap: 16,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: radii.control,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 18,
    borderRadius: radii.control,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '800',
  },
});
