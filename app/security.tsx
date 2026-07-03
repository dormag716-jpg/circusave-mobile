import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDeviceLock } from '@/components/DeviceLock';
import { colors, radii, spacing } from '@/lib/theme';

export default function SecurityScreen() {
  const { isLockEnabled, setLockEnabled } = useDeviceLock();

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
        <Text style={styles.headerTitle}>Security</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
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
      </View>
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
  placeholder: { width: 36 }, // To balance the back button
  content: {
    padding: spacing.screenX,
  },
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
  cardText: {
    flex: 1,
    paddingRight: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textStrong,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
});
