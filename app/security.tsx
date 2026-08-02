import React, { useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { Alert, ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { useAuthSession } from '@/lib/authContext';
import { useDeviceLock } from '@/components/DeviceLock';
import { exportUserData, deleteAccount } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { colors, radii, spacing } from '@/lib/theme';

export default function SecurityScreen() {
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
            dialogTitle: 'Export CircuSave Data Archive',
            UTI: 'public.json',
          });
        } else {
          await copyText(archiveJson);
        }
      } catch (shareErr) {
        console.error('Data export share failed, falling back to copy:', shareErr);
        await copyText(archiveJson);
      }

      Alert.alert(
        'Data Export Ready',
        `Your data export archive (v1.0) is ready to save or share.\n\nExport Summary:\n• Email: ${
          typeof profile.email === 'string' ? profile.email : 'N/A'
        }\n• Memberships: ${memberships.length}\n• Legal Audit Trail: ${legalAcceptances.length} accepted`,
        [{ text: 'OK' }],
      );
    } catch (err) {
      console.error('Data export failed:', err);
      Alert.alert('Export Error', 'Unable to export user data. Please check your connection.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = () => {
    if (!token) return;
    Alert.alert(
      'Delete Account?',
      'Are you sure you want to permanently delete your account?\n\n• Your personal details (name, email, phone) will be anonymized.\n• Your active session will be revoked immediately.\n• Required financial transaction records will be retained for regulatory audit compliance.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount(token);
              Alert.alert(
                'Account Deleted',
                'Your account has been deleted and anonymized.',
                [
                  {
                    text: 'OK',
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
              console.error('Account deletion failed:', err);
              Alert.alert(
                'Deletion Error',
                'Unable to complete account deletion. Please verify your connection or try again.',
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
        >
          <FontAwesome name="arrow-left" size={20} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>Security & Privacy</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Device Access</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>App Lock</Text>
              <Text style={styles.cardSubtitle}>
                Require Face ID, Touch ID, or PIN to open the app.
              </Text>
            </View>
            <Switch
              value={isLockEnabled}
              onValueChange={(val) => void setLockEnabled(val)}
              trackColor={{ true: colors.primary, false: colors.cardBorder }}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Password & Recovery</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Change Password</Text>
              <Text style={styles.cardSubtitle}>
                To change your password, sign out and select "Forgot Password" on the login screen. You will be sent a secure recovery code via email.
              </Text>
            </View>
          </View>
        </View>

        {/* Section: Data & Privacy Rights */}
        <Text style={styles.sectionTitle}>Data & Privacy Rights</Text>
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
            onPress={handleExportData}
            disabled={exporting}
          >
            <View style={styles.actionText}>
              <Text style={styles.cardTitle}>Export My Data</Text>
              <Text style={styles.cardSubtitle}>
                Download a complete JSON archive of your profile, circle participation, legal acceptances, and records.
              </Text>
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
          >
            <View style={styles.actionText}>
              <Text style={[styles.cardTitle, { color: colors.danger }]}>Delete Account</Text>
              <Text style={styles.cardSubtitle}>
                Anonymize your personal information and delete your account in accordance with App Store & Google Play privacy policies.
              </Text>
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
  backButton: { padding: 8, marginLeft: -8 },
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
