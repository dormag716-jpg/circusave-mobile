import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { circleWorkspaceHref, myCirclesHref } from '@/lib/navigation';
import { colors, radii, spacing } from '@/lib/theme';

/**
 * Legacy route: circle history now lives in the Records statement center.
 * This screen redirects users into the workspace Records tab.
 */
export default function CircleHistoryScreen() {
  const { t } = useTranslation('circleWorkspace');
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;

  function openRecords() {
    if (circleId) {
      router.replace(circleWorkspaceHref(circleId, 'records'));
      return;
    }
    router.replace(myCirclesHref);
  }

  function handleBack() {
    if (circleId) {
      router.replace(circleWorkspaceHref(circleId));
      return;
    }
    router.replace(myCirclesHref);
  }

  const backLabel = circleId
    ? t('history.backToWorkspace')
    : t('history.backToCircles');
  const actionLabel = circleId
    ? t('history.openRecords')
    : t('history.backToCirclesAction');
  const actionA11y = circleId
    ? t('history.openRecordsA11y')
    : t('history.backToCircles');

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
          >
            <FontAwesome name="angle-left" size={24} color={colors.primaryDark} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>{t('history.kicker')}</Text>
            <Text style={styles.title}>{t('history.title')}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.eyebrow}>{t('history.moved')}</Text>
          <Text style={styles.cardTitle}>{t('history.cardTitle')}</Text>
          <Text style={styles.body}>{t('history.body')}</Text>
          <Pressable
            style={styles.primaryButton}
            onPress={openRecords}
            accessibilityRole="button"
            accessibilityLabel={actionA11y}
          >
            <Text style={styles.primaryButtonText}>{actionLabel}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 40,
    paddingHorizontal: spacing.screenX,
    paddingTop: 18,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textStrong,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.card,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  cardTitle: {
    color: colors.textStrong,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.onColor,
    fontSize: 15,
    fontWeight: '800',
  },
});
