import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  getPremiumReminderSchedule,
  updatePremiumReminderSchedule,
} from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { useEntitlements } from '@/lib/entitlementsContext';
import { formatDateTime } from '@/lib/i18n/formatters';
import { colors, radii, shadows, spacing } from '@/lib/theme';

export default function ReminderScheduleScreen() {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const language = i18n.resolvedLanguage || i18n.language;
  const cadences = [
    { hours: 12, label: t('cadenceTwiceDaily'), detail: t('cadenceTwiceDailyDetail') },
    { hours: 24, label: t('cadenceDaily'), detail: t('cadenceDailyDetail') },
    { hours: 48, label: t('cadenceEveryTwoDays'), detail: t('cadenceEveryTwoDaysDetail') },
  ];
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;
  const { session } = useAuthSession();
  const { hasCapability } = useEntitlements();
  const token = session?.session.token;
  const premiumEnabled = hasCapability('premiumReminders');
  const [enabled, setEnabled] = useState(false);
  const [repeatHours, setRepeatHours] = useState(24);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token || !circleId) {
      setLoading(false);
      return;
    }
    void getPremiumReminderSchedule(token, circleId)
      .then((schedule) => {
        setEnabled(schedule.enabled);
        setRepeatHours(schedule.repeatHours);
        setNextRunAt(schedule.nextRunAt);
        if (schedule.lastResult?.status === 'sent') {
          setLastResult(
            t('remindedCount', { count: schedule.lastResult.remindedCount ?? 0 }),
          );
        } else if (schedule.lastResult?.error) {
          setLastResult(schedule.lastResult.error);
        }
      })
      .catch((error) => {
        Alert.alert(
          t('loadScheduleError'),
          error instanceof Error ? error.message : t('genericFailure'),
        );
      })
      .finally(() => setLoading(false));
  }, [circleId, t, token]);

  async function save() {
    if (!token || !circleId) return;
    if (!premiumEnabled) {
      router.push('/subscription');
      return;
    }
    setSaving(true);
    try {
      const schedule = await updatePremiumReminderSchedule(token, circleId, {
        enabled,
        repeatHours,
      });
      setNextRunAt(schedule.nextRunAt);
      Alert.alert(
        enabled ? t('remindersScheduledTitle') : t('schedulePausedTitle'),
        enabled ? t('remindersScheduledBody') : t('schedulePausedBody'),
      );
    } catch (error) {
      Alert.alert(
        t('saveScheduleError'),
        error instanceof Error ? error.message : t('genericFailure'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel={t('common:goBack')}
        >
          <FontAwesome name="chevron-left" size={18} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('reminderScheduleTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <FontAwesome name="bell" size={21} color={colors.premiumGold} />
          </View>
          <Text style={styles.eyebrow}>{t('reminderEyebrow')}</Text>
          <Text style={styles.heroTitle}>{t('reminderHeroTitle')}</Text>
          <Text style={styles.heroCopy}>{t('reminderHeroCopy')}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>{t('reminderLoading')}</Text>
          </View>
        ) : (
          <>
            <View style={styles.controlCard}>
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.controlTitle}>{t('automaticReminders')}</Text>
                  <Text style={styles.controlCopy}>
                    {enabled ? t('remindersActive') : t('remindersPaused')}
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={setEnabled}
                  trackColor={{
                    false: colors.cardBorder,
                    true: colors.primaryLight,
                  }}
                  thumbColor={enabled ? colors.primaryDark : colors.subtle}
                  accessibilityRole="switch"
                  accessibilityLabel={t('automaticReminders')}
                  accessibilityState={{ checked: enabled }}
                />
              </View>

              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>{t('reminderRhythm')}</Text>
              <View style={styles.cadences}>
                {cadences.map((cadence) => {
                  const selected = repeatHours === cadence.hours;
                  return (
                    <Pressable
                      key={cadence.hours}
                      onPress={() => setRepeatHours(cadence.hours)}
                      style={[
                        styles.cadence,
                        selected && styles.cadenceSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.radio,
                          selected && styles.radioSelected,
                        ]}
                      >
                        {selected ? <View style={styles.radioDot} /> : null}
                      </View>
                      <View style={styles.cadenceText}>
                        <Text
                          style={[
                            styles.cadenceTitle,
                            selected && styles.cadenceTitleSelected,
                          ]}
                        >
                          {cadence.label}
                        </Text>
                        <Text style={styles.cadenceDetail}>{cadence.detail}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.safetyCard}>
              <FontAwesome name="shield" size={17} color={colors.successText} />
              <View style={styles.safetyText}>
                <Text style={styles.safetyTitle}>{t('respectfulTitle')}</Text>
                <Text style={styles.safetyCopy}>{t('respectfulCopy')}</Text>
              </View>
            </View>

            {nextRunAt || lastResult ? (
              <View style={styles.statusCard}>
                {nextRunAt ? (
                  <Text style={styles.statusText}>
                    {t('nextCheck', { when: formatDateTime(nextRunAt, language) })}
                  </Text>
                ) : null}
                {lastResult ? (
                  <Text style={styles.statusSubtext}>
                    {t('lastRun', { result: lastResult })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {!premiumEnabled ? (
              <View style={styles.lockedCard}>
                <View style={styles.lockedIcon}>
                  <FontAwesome name="diamond" size={15} color={colors.premiumGold} />
                </View>
                <View style={styles.lockedText}>
                  <Text style={styles.lockedTitle}>{t('includedWithOrganizerPro')}</Text>
                  <Text style={styles.lockedCopy}>{t('trialToActivateReminders')}</Text>
                </View>
              </View>
            ) : null}

            <Pressable
              onPress={() => void save()}
              disabled={saving}
              style={({ pressed }) => [
                styles.saveButton,
                pressed && styles.saveButtonPressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onColor} />
              ) : (
                <>
                  <Text style={styles.saveButtonText}>
                    {premiumEnabled ? t('saveReminderSchedule') : t('viewOrganizerPro')}
                  </Text>
                  <FontAwesome name="arrow-right" size={14} color={colors.onColor} />
                </>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.premiumCanvas },
  header: {
    minHeight: 58,
    paddingHorizontal: spacing.screenX,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.small,
  },
  headerTitle: { color: colors.textStrong, fontSize: 15, fontWeight: '900' },
  headerSpacer: { width: 44 },
  content: { padding: spacing.screenX, paddingBottom: 50 },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: 28,
    padding: 24,
    ...shadows.medium,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  eyebrow: { color: colors.premiumLavender, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  heroTitle: { color: colors.onColor, fontSize: 29, lineHeight: 34, fontWeight: '900', marginTop: 8 },
  heroCopy: { color: 'rgba(255,255,255,0.70)', fontSize: 13, lineHeight: 20, marginTop: 10 },
  loadingCard: { marginTop: 18, backgroundColor: colors.card, borderRadius: 22, padding: 25, alignItems: 'center', gap: 10 },
  loadingText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  controlCard: { marginTop: 18, backgroundColor: colors.card, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.primaryBorder, ...shadows.small },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchText: { flex: 1 },
  controlTitle: { color: colors.textStrong, fontSize: 16, fontWeight: '900' },
  controlCopy: { color: colors.muted, fontSize: 12, marginTop: 3 },
  divider: { height: 1, backgroundColor: colors.cardBorder, marginVertical: 20 },
  sectionLabel: { color: colors.subtle, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginBottom: 11 },
  cadences: { gap: 9 },
  cadence: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 17, padding: 14 },
  cadenceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.subtle, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  cadenceText: { flex: 1 },
  cadenceTitle: { color: colors.textStrong, fontSize: 13, fontWeight: '800' },
  cadenceTitleSelected: { color: colors.primaryDark },
  cadenceDetail: { color: colors.muted, fontSize: 10, marginTop: 3 },
  safetyCard: { flexDirection: 'row', gap: 11, backgroundColor: colors.successSoft, borderRadius: 18, padding: 15, marginTop: 14 },
  safetyText: { flex: 1 },
  safetyTitle: { color: colors.successText, fontSize: 12, fontWeight: '900' },
  safetyCopy: { color: colors.successText, opacity: 0.82, fontSize: 10, lineHeight: 15, marginTop: 2 },
  statusCard: { backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: 16, padding: 13, marginTop: 12, borderWidth: 1, borderColor: colors.cardBorder },
  statusText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  statusSubtext: { color: colors.muted, fontSize: 10, marginTop: 3 },
  lockedCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.primaryDark, borderRadius: 18, padding: 15, marginTop: 14 },
  lockedIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  lockedText: { flex: 1 },
  lockedTitle: { color: colors.onColor, fontSize: 12, fontWeight: '900' },
  lockedCopy: { color: 'rgba(255,255,255,0.65)', fontSize: 10, lineHeight: 14, marginTop: 2 },
  saveButton: { minHeight: 54, borderRadius: 18, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 18, ...shadows.small },
  saveButtonPressed: { opacity: 0.88 },
  saveButtonText: { color: colors.onColor, fontSize: 14, fontWeight: '900' },
});
