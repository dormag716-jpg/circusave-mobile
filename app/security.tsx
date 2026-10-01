import React, { useCallback, useEffect, useRef, useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import * as IntentLauncher from 'expo-intent-launcher';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  Alert,
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { useTranslation } from 'react-i18next';

import { resetNavigationToLogin } from '@/lib/auth/authBoundary';
import { useAuthSession } from '@/lib/auth/authContext';
import { exportUserData, deleteAccount, login, logout } from '@/lib/api';
import {
  authenticateForAppLockChange,
  confirmAppLockDisable,
  defaultAppLockPreferences,
  isCompatibleStrongBiometric,
  loadAppLockPreferences,
  saveAppLockPreferences,
  type AppLockPreferences,
} from '@/lib/platform/appLockPreferences';
import {
  isLatestEnrollmentRead,
  joinSensorNames,
  openDeviceSecuritySettings,
  presentBiometricSecurity,
  readBiometricEnrollment,
  shouldRefreshBiometricEnrollmentOnAppState,
  supportedBiometricTranslationKey,
  type BiometricHardwareReport,
  type BiometricPlatform,
} from '@/lib/platform/biometricEnrollment';
import { verifyAccountPassword } from '@/lib/platform/deviceLockPassword';
import { copyText } from '@/lib/platform/clipboard';
import { colors, radii, spacing } from '@/lib/shared/theme';
import { logClientError } from '@/lib/platform/errorLogging';

function devicePlatform(): BiometricPlatform {
  if (Platform.OS === 'ios') {
    return 'ios';
  }
  if (Platform.OS === 'android') {
    return 'android';
  }
  return 'other';
}

export default function SecurityScreen() {
  const { t } = useTranslation(['security', 'common']);
  const { session, signOut, status } = useAuthSession();
  const token = session?.session.token;
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [enrollment, setEnrollment] = useState<BiometricHardwareReport | null>(null);
  const [openingSettings, setOpeningSettings] = useState(false);
  const [preferences, setPreferences] = useState<AppLockPreferences>(defaultAppLockPreferences(false));
  const [savingPreference, setSavingPreference] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState('');
  const passwordResolver = useRef<((value: string | null) => void) | null>(null);
  const preferencesLoadedForUser = useRef('');
  const mountedRef = useRef(true);
  const openingSettingsRef = useRef(false);
  const enrollmentReadId = useRef(0);

  const refreshEnrollment = useCallback(() => {
    const readId = enrollmentReadId.current + 1;
    enrollmentReadId.current = readId;
    void readBiometricEnrollment({
      hasHardwareAsync: LocalAuthentication.hasHardwareAsync,
      isEnrolledAsync: LocalAuthentication.isEnrolledAsync,
      supportedAuthenticationTypesAsync: LocalAuthentication.supportedAuthenticationTypesAsync,
      getEnrolledLevelAsync: LocalAuthentication.getEnrolledLevelAsync,
    })
      .then((next) => {
        if (!mountedRef.current || !isLatestEnrollmentRead(readId, enrollmentReadId.current)) {
          return;
        }
        setEnrollment(next);
      })
      .catch(() => {
        if (!mountedRef.current || !isLatestEnrollmentRead(readId, enrollmentReadId.current)) {
          return;
        }
        setEnrollment({
          hasHardware: false,
          isEnrolled: false,
          supportedTypes: [],
          enrolledLevel: 0,
        });
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshEnrollment();
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (shouldRefreshBiometricEnrollmentOnAppState(previous, next)) {
        refreshEnrollment();
      }
      previous = next;
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [refreshEnrollment]);

  const userId = session?.user.id ?? '';
  const presentation = enrollment ? presentBiometricSecurity(enrollment, devicePlatform()) : null;
  const compatibleEnrolled = enrollment
    ? isCompatibleStrongBiometric({
        hasHardware: enrollment.hasHardware,
        isEnrolled: enrollment.isEnrolled,
        enrolledLevel: enrollment.enrolledLevel,
      })
    : false;

  useEffect(() => {
    if (status !== 'authenticated' || !userId || !enrollment) {
      return undefined;
    }
    if (preferencesLoadedForUser.current === userId) {
      return undefined;
    }
    preferencesLoadedForUser.current = userId;
    let active = true;
    void loadAppLockPreferences(userId, compatibleEnrolled).then((loaded) => {
      if (!active || !mountedRef.current) {
        return;
      }
      if (!loaded.ok) {
        Alert.alert(t('preferenceSaveErrorTitle'), t('preferenceSaveErrorBody'));
        setPreferences(defaultAppLockPreferences(false));
        return;
      }
      setPreferences(loaded.preferences);
    });
    return () => {
      active = false;
    };
  }, [compatibleEnrolled, enrollment, status, t, userId]);

  const promptPassword = useCallback(() => {
    setPasswordDraft('');
    setPasswordOpen(true);
    return new Promise<string | null>((resolve) => {
      passwordResolver.current = resolve;
    });
  }, []);

  const finishPassword = (value: string | null) => {
    setPasswordOpen(false);
    setPasswordDraft('');
    const resolve = passwordResolver.current;
    passwordResolver.current = null;
    resolve?.(value);
  };

  const persistPreferences = async (next: AppLockPreferences) => {
    if (!userId) {
      return;
    }
    setSavingPreference(true);
    const saved = await saveAppLockPreferences(userId, next);
    if (mountedRef.current) {
      setSavingPreference(false);
    }
    if (!saved.ok) {
      logClientError('App lock preference was not saved', new Error('preference_save_failed'));
      Alert.alert(t('preferenceSaveErrorTitle'), t('preferenceSaveErrorBody'));
      return;
    }
    setPreferences(saved.preferences);
  };

  const requireDisableProof = async () => {
    const proof = await confirmAppLockDisable({
      biometricUnlockEnabled: preferences.biometricUnlockEnabled && compatibleEnrolled,
      authenticate: () => authenticateForAppLockChange(t('confirmDisableTitle'), t('common:cancel')),
      promptPassword,
      verifyPassword: (password) =>
        verifyAccountPassword({
          email: session?.user.email || '',
          password,
          expectedUserId: userId,
          login,
          revokeVerificationSession: (proofToken) => logout(proofToken),
        }),
    });
    if (proof === 'failed' && mountedRef.current) {
      Alert.alert(t('confirmDisableTitle'), t('confirmDisableFailed'));
    }
    return proof === 'authorized';
  };

  const changeAppLock = async (enabled: boolean) => {
    if (savingPreference || enabled === preferences.appLockEnabled) {
      return;
    }
    if (!enabled) {
      const allowed = await requireDisableProof();
      if (!allowed) {
        return;
      }
    }
    await persistPreferences({
      appLockEnabled: enabled,
      biometricUnlockEnabled: preferences.biometricUnlockEnabled,
    });
  };

  const changeBiometricUnlock = async (enabled: boolean) => {
    if (savingPreference || !preferences.appLockEnabled || enabled === preferences.biometricUnlockEnabled) {
      return;
    }
    if (enabled && !compatibleEnrolled) {
      Alert.alert(t('biometricUnavailableTitle'), t('biometricUnavailableBody'), [
        { text: t('common:cancel'), style: 'cancel' },
        { text: t('managePhoneBiometrics'), onPress: () => { void handleSetupBiometrics(); } },
      ]);
      return;
    }
    if (!enabled) {
      const allowed = await requireDisableProof();
      if (!allowed) {
        return;
      }
    }
    await persistPreferences({
      appLockEnabled: preferences.appLockEnabled,
      biometricUnlockEnabled: enabled,
    });
  };

  const handleSetupBiometrics = async () => {
    if (openingSettingsRef.current) {
      return;
    }
    openingSettingsRef.current = true;
    setOpeningSettings(true);
    try {
      const result = await openDeviceSecuritySettings({
        platform: Platform.OS,
        startAndroidActivity: (action, params) => IntentLauncher.startActivityAsync(action, params),
        openIosSettings: () => Linking.openSettings(),
      });
      if (result !== 'opened' && mountedRef.current) {
        Alert.alert(t('biometricSettingsErrorTitle'), t('biometricSettingsErrorBody'));
      }
    } finally {
      openingSettingsRef.current = false;
      if (mountedRef.current) {
        setOpeningSettings(false);
      }
      refreshEnrollment();
    }
  };

  const handleExportData = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const data = await exportUserData(token);
      const profile =
        data?.profile && typeof data.profile === 'object'
          ? (data.profile as Record<string, unknown>)
          : {};
      const memberships = Array.isArray(data?.memberships) ? data.memberships : [];
      const legalAcceptances = Array.isArray(data?.legalAcceptances)
        ? data.legalAcceptances
        : [];
      const archiveJson = JSON.stringify(data, null, 2);
      const filename = `circusave-data-export-${Date.now()}.json`;

      // Deliver the actual archive (store data-portability requirement), not only a summary.
      try {
        const file = new File(Paths.cache, filename);
        file.create({ overwrite: true });
        file.write(archiveJson);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/json',
            dialogTitle: t('exportDialogTitle'),
            UTI: 'public.json',
          });
        } else {
          await copyText(archiveJson);
        }
      } catch (shareErr) {
        logClientError('Data export share failed, falling back to copy', shareErr);
        await copyText(archiveJson);
      }

      Alert.alert(
        t('exportReadyTitle'),
        t('exportReadyBody', {
          email: typeof profile.email === 'string' ? profile.email : t('notAvailable'),
          memberships: memberships.length,
          legal: legalAcceptances.length,
        }),
        [{ text: t('common:ok') }],
      );
    } catch (err) {
      logClientError('Data export failed', err);
      Alert.alert(t('exportErrorTitle'), t('exportErrorBody'));
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = () => {
    if (!token) return;
    Alert.alert(
      t('deleteConfirmTitle'),
      t('deleteConfirmBody'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('deleteConfirmAction'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount(token);
              Alert.alert(
                t('deletedTitle'),
                t('deletedBody'),
                [
                  {
                    text: t('common:ok'),
                    onPress: async () => {
                      try {
                        await signOut();
                      } finally {
                        resetNavigationToLogin(router);
                      }
                    },
                  },
                ],
              );
            } catch (err) {
              logClientError('Account deletion failed', err);
              Alert.alert(
                t('deleteErrorTitle'),
                t('deleteErrorBody'),
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common:goBack')}
        >
          <FontAwesome name="arrow-left" size={20} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>{t('deviceAccess')}</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{t('appLock')}</Text>
              <Text style={styles.cardSubtitle}>{t('appLockSwitchSubtitle')}</Text>
            </View>
            <Switch
              value={preferences.appLockEnabled}
              onValueChange={(enabled) => {
                void changeAppLock(enabled);
              }}
              disabled={savingPreference}
              trackColor={{ false: colors.cardBorder, true: colors.primaryLight }}
              thumbColor={preferences.appLockEnabled ? colors.primaryDark : colors.subtle}
              accessibilityRole="switch"
              accessibilityLabel={t('appLock')}
              accessibilityHint={t('appLockSwitchSubtitle')}
              accessibilityState={{ checked: preferences.appLockEnabled, disabled: savingPreference }}
            />
          </View>
          <View style={styles.cardDivider} />
          <View style={styles.cardRow}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{t('biometricUnlock')}</Text>
              <Text style={styles.cardSubtitle}>
                {t(devicePlatform() === 'ios' ? 'biometricUnlockSubtitleIos' : 'biometricUnlockSubtitle')}
              </Text>
            </View>
            <Switch
              value={preferences.biometricUnlockEnabled}
              onValueChange={(enabled) => {
                void changeBiometricUnlock(enabled);
              }}
              disabled={savingPreference || !preferences.appLockEnabled}
              trackColor={{ false: colors.cardBorder, true: colors.primaryLight }}
              thumbColor={
                preferences.appLockEnabled && preferences.biometricUnlockEnabled
                  ? colors.primaryDark
                  : colors.subtle
              }
              accessibilityRole="switch"
              accessibilityLabel={t('biometricUnlock')}
              accessibilityHint={t(
                devicePlatform() === 'ios' ? 'biometricUnlockSubtitleIos' : 'biometricUnlockSubtitle',
              )}
              accessibilityState={{
                checked: preferences.biometricUnlockEnabled,
                disabled: savingPreference || !preferences.appLockEnabled,
              }}
            />
          </View>
          <View style={styles.cardDivider} />
          {presentation ? (
            <View accessibilityLiveRegion="polite">
              <Text style={styles.cardSubtitle}>
                {t('availableSensors', {
                  sensors: joinSensorNames(
                    presentation.supported.map((label) => t(supportedBiometricTranslationKey(label))),
                    t('sensorAnd'),
                  ) || t('noReportedBiometrics'),
                })}
              </Text>
              {presentation.enrollment === 'weak_only' ? (
                <Text style={styles.cardSubtitle}>{t('weakBiometricOnly')}</Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.statusLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.cardSubtitle}>{t('biometricChecking')}</Text>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [styles.setupButton, pressed && styles.actionRowPressed]}
            onPress={() => {
              void handleSetupBiometrics();
            }}
            disabled={openingSettings}
            accessibilityRole="button"
            accessibilityLabel={t('managePhoneBiometrics')}
          >
            {openingSettings ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.setupButtonText}>{t('managePhoneBiometrics')}</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>{t('passwordRecovery')}</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{t('changePassword')}</Text>
              <Text style={styles.cardSubtitle}>{t('changePasswordBody')}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('dataRights')}</Text>
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
            onPress={handleExportData}
            disabled={exporting}
            accessibilityRole="button"
            accessibilityLabel={t('exportData')}
          >
            <View style={styles.actionText}>
              <Text style={styles.cardTitle}>{t('exportData')}</Text>
              <Text style={styles.cardSubtitle}>{t('exportDataBody')}</Text>
            </View>
            {exporting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <FontAwesome name="download" size={18} color={colors.primary} />
            )}
          </Pressable>

          <View style={styles.cardDivider} />

          <Pressable
            style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
            onPress={handleDeleteAccount}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel={t('deleteAccount')}
          >
            <View style={styles.actionText}>
              <Text style={[styles.cardTitle, { color: colors.danger }]}>{t('deleteAccount')}</Text>
              <Text style={styles.cardSubtitle}>{t('deleteAccountBody')}</Text>
            </View>
            {deleting ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <FontAwesome name="trash" size={18} color={colors.danger} />
            )}
          </Pressable>
        </View>
      </ScrollView>
      <Modal
        visible={passwordOpen}
        transparent
        animationType="fade"
        onRequestClose={() => finishPassword(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>{t('confirmDisableTitle')}</Text>
            <Text style={styles.cardSubtitle}>{t('confirmDisableBody')}</Text>
            <TextInput
              value={passwordDraft}
              onChangeText={setPasswordDraft}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              accessibilityLabel={t('confirmDisableBody')}
              style={styles.passwordInput}
            />
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common:cancel')}
                onPress={() => finishPassword(null)}
                style={styles.modalButton}
              >
                <Text style={styles.cardSubtitle}>{t('common:cancel')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('confirmDisableAction')}
                onPress={() => finishPassword(passwordDraft)}
                style={styles.modalButton}
              >
                <Text style={styles.setupButtonText}>{t('confirmDisableAction')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -8,
    width: 44,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textStrong },
  placeholder: { width: 36 },
  content: { padding: spacing.screenX, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.card,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardText: { flex: 1, paddingRight: 16 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  actionRowPressed: { opacity: 0.7 },
  actionText: { flex: 1, paddingRight: 16 },
  cardDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: 12,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.textStrong, marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  statusLoading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  setupButton: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 44,
  },
  setupButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: spacing.screenX,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.card,
  },
  passwordInput: {
    borderColor: colors.cardBorder,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.textStrong,
    fontSize: 16,
    marginTop: 12,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  modalButton: {
    minHeight: 44,
    justifyContent: 'center',
    marginLeft: 12,
    paddingHorizontal: 8,
  },
});
