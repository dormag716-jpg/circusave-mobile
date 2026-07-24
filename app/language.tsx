import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  changeLanguagePreference,
  type LanguagePreference,
} from '@/lib/i18n';
import { readLanguagePreference } from '@/lib/i18n/language-storage';
import { LANGUAGE_OPTIONS } from '@/lib/i18n/types';
import { colors, shadows, spacing } from '@/lib/theme';

export default function LanguageScreen() {
  const { t } = useTranslation(['common', 'settings']);
  const [preference, setPreference] = useState<LanguagePreference>('system');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<LanguagePreference | null>(null);

  useEffect(() => {
    let active = true;
    void readLanguagePreference()
      .then((storedPreference) => {
        if (active) {
          setPreference(storedPreference);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function selectLanguage(nextPreference: LanguagePreference) {
    if (saving) return;
    setSaving(nextPreference);
    try {
      await changeLanguagePreference(nextPreference);
      setPreference(nextPreference);
    } catch {
      Alert.alert(
        t('settings:languageSaveErrorTitle'),
        t('settings:languageSaveErrorMessage'),
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common:back')}
          hitSlop={12}
        >
          <FontAwesome name="chevron-left" size={18} color={colors.primary} />
          <Text style={styles.backText}>{t('common:back')}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleIcon}>
          <FontAwesome name="language" size={26} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t('settings:languageScreenTitle')}</Text>
        <Text style={styles.description}>
          {t('settings:languageScreenDescription')}
        </Text>

        <View style={styles.optionsCard}>
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>{t('common:loading')}</Text>
            </View>
          ) : (
            LANGUAGE_OPTIONS.map((option, index) => {
              const selected = preference === option.value;
              const optionLoading = saving === option.value;
              const label =
                option.value === 'system'
                  ? t('settings:usePhoneLanguage')
                  : option.label;

              return (
                <Pressable
                  key={option.value}
                  style={[
                    styles.option,
                    index > 0 && styles.optionBorder,
                    selected && styles.selectedOption,
                  ]}
                  onPress={() => void selectLanguage(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, busy: optionLoading }}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      selected && styles.selectedOptionLabel,
                    ]}
                  >
                    {label}
                  </Text>
                  {optionLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : selected ? (
                    <FontAwesome
                      name="check-circle"
                      size={21}
                      color={colors.primary}
                    />
                  ) : (
                    <View style={styles.unselectedCircle} />
                  )}
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 8,
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
  },
  backText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  content: {
    alignSelf: 'center',
    maxWidth: 520,
    padding: spacing.screenX,
    width: '100%',
  },
  titleIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    marginTop: 16,
    width: 56,
  },
  title: {
    color: colors.textStrong,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 18,
    textAlign: 'center',
  },
  description: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  optionsCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 28,
    overflow: 'hidden',
    ...shadows.small,
  },
  loadingState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 72,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 15,
  },
  option: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 66,
    paddingHorizontal: 18,
  },
  optionBorder: {
    borderTopColor: colors.cardBorder,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  selectedOption: {
    backgroundColor: colors.primarySoft,
  },
  optionLabel: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    paddingRight: 12,
  },
  selectedOptionLabel: {
    color: colors.primaryDark,
    fontWeight: '900',
  },
  unselectedCircle: {
    borderColor: colors.cardBorder,
    borderRadius: 999,
    borderWidth: 2,
    height: 20,
    width: 20,
  },
});
