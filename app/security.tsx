import React, { useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { Alert, ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { useTranslation } from 'react-i18next';

import { useAuthSession } from '@/lib/authContext';
import { useDeviceLock } from '@/components/DeviceLock';
import { exportUserData, deleteAccount } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { colors, radii, spacing } from '@/lib/theme';
import { logClientError } from '@/lib/errorLogging';

export default function SecurityScreen() {
  const { t } = useTranslation(['security', 'common']);
  const { session, signOut } = useAuthSession();
  const token = session?.session.token;
  const { isLockEnabled, setLockEnabled } = useDeviceLock();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
                        router.replace('/login');
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
              <Text style={styles.cardSubtitle}>{t('appLockSubtitle')}</Text>
            </View>
            <Switch
              value={isLockEnabled}
              onValueChange={(val) => void setLockEnabled(val)}
              trackColor={{ true: colors.primary, false: colors.cardBorder }}
              accessibilityRole="switch"
              accessibilityLabel={t('appLockA11y')}
              accessibilityState={{ checked: isLockEnabled }}
            />
          </View>
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
});
