// app/(tabs)/profile.tsx
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthSession } from '@/lib/authContext';
import { getLinkedAccounts, type BackendLinkedAccount } from '@/lib/api';
import { scheduleTestNotification } from '@/lib/notifications';
import { useMarket, type MarketType } from '@/lib/market';
import { myCirclesHref } from '@/lib/navigation';
import { colors, radii, spacing } from '@/lib/theme';
export default function ProfileScreen() {
  const { session, signOut } = useAuthSession();
  const { market, setMarket } = useMarket();
  const [modalVisible, setModalVisible] = useState(false);
  const [accounts, setAccounts] = useState<BackendLinkedAccount[]>([]);

  useEffect(() => {
    if (!session?.session.token) return;
    getLinkedAccounts(session.session.token).then(setAccounts).catch(console.error);
  }, [session?.session.token]);

  const displayName = session?.user.name ?? 'Profile';
  const email = session?.user.email ?? 'Connected to backend session';
  const initials = getInitials(displayName);
  const reliabilityScore = session?.user.reliabilityScore !== undefined 
    ? `${session.user.reliabilityScore}%` 
    : '--%';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.email}>{email}</Text>
          
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              BACKEND CONNECTED
            </Text>
          </View>
        </View>

        {/* Reliability Score Card */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreHeader}>
            <View style={styles.scoreIconContainer}>
              <FontAwesome name="shield" size={24} color={colors.success} />
            </View>
            <View style={styles.scoreTextContainer}>
              <Text style={styles.scoreTitle}>Reliability Score</Text>
              <Text style={styles.scoreSubtitle}>Based on past circles</Text>
            </View>
            <View style={styles.scoreValueContainer}>
              <Text style={styles.scoreValue}>{reliabilityScore}</Text>
              <Text style={styles.scoreLabel}>On-Time</Text>
            </View>
          </View>
        </View>


        {/* Menu */}
        <View style={styles.menu}>
          <MenuItem
            icon="bank"
            title="Automated Payments"
            subtitle={accounts.length > 0 ? "Bank account linked" : "Connect your bank account"}
            badge={accounts.length > 0 ? "CONNECTED" : undefined}
            onPress={() => router.push('/automated-payments')}
          />
          
          <MenuItem
            icon="check-circle-o"
            title="Completed Circles"
            subtitle="View your past savings groups"
            onPress={() => router.push('/completed-circles')}
          />

          <MenuItem
            icon="bell-o"
            title="Test Notification"
            subtitle="Schedule a local contribution confirmation"
            onPress={async () => {
              const result = await scheduleTestNotification('test');
              if (result.ok) {
                Alert.alert('Scheduled', 'Test notification will appear in 2 seconds.');
              } else {
                Alert.alert(
                  'Notifications unavailable',
                  result.reason,
                );
              }
            }}
          />

          <MenuItem
            icon="shield"
            title="Security"
            subtitle="Password, recovery, and device access"
            onPress={() => router.push('/security')}
          />

          <MenuItem
            icon="credit-card"
            title="Payment Preferences"
            subtitle="CashApp, Venmo, and PayPal tags for receiving payouts"
            onPress={() => router.push('/payment-preferences')}
          />

          <MenuItem
            icon="globe"
            title="Cultural Terminology"
            subtitle={`Currently using terms for: ${market.toUpperCase()}`}
            onPress={() => setModalVisible(true)}
          />

          <MenuItem
            icon="star-o"
            title="Subscription"
            subtitle="View plans and upgrade options"
            onPress={() => router.push('/subscription')}
          />

          <MenuItem
            icon="question-circle-o"
            title="Support"
            subtitle="Help with circles, contributions, and payouts"
            onPress={() => router.push('/support')}
          />
        </View>

        {/* Sign Out */}
        <Pressable
          style={styles.signOutButton}
          onPress={async () => {
            try {
              await signOut();
            } catch (e) {}
            router.replace('/login');
          }}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        {/* Version */}
        <Text style={styles.version}>CircuSave v1.0.0 • Build 2026.06</Text>

        {/* Cultural Terminology Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Terminology</Text>
                <Pressable onPress={() => setModalVisible(false)} hitSlop={20}>
                  <FontAwesome name="times" size={24} color={colors.textStrong} />
                </Pressable>
              </View>
              <Text style={styles.modalDescription}>
                Choose your cultural terminology. This will change what we call savings groups, organizers, and payouts across the app.
              </Text>
              
              <ScrollView showsVerticalScrollIndicator={false}>
                {(['default', 'susu', 'tanda', 'sol', 'hagbad', 'pardner'] as MarketType[]).map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.marketOption, market === m && styles.marketOptionSelected]}
                    onPress={() => {
                      setMarket(m);
                      setModalVisible(false);
                    }}
                  >
                    <Text style={[styles.marketOptionText, market === m && styles.marketOptionTextSelected]}>
                      {m.toUpperCase()}
                    </Text>
                    {market === m && (
                      <FontAwesome name="check" size={16} color={colors.primary} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({ icon, title, subtitle, badge, onPress }: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuIcon}>
        <FontAwesome name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      {badge && (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      )}
      <FontAwesome name="chevron-right" size={18} color={colors.muted} />
    </Pressable>
  );
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingBottom: 100, paddingHorizontal: spacing.screenX },

  profileHeader: { alignItems: 'center', marginVertical: 32 },
  avatar: {
    backgroundColor: colors.primary,
    borderRadius: 50,
    height: 100,
    justifyContent: 'center',
    width: 100,
    marginBottom: 16,
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '900' },
  name: { fontSize: 26, fontWeight: '900', color: colors.textStrong },
  email: { color: colors.muted, marginTop: 4 },
  roleBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  roleText: { color: colors.primaryDark, fontWeight: '900', fontSize: 13 },

  scoreCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 20,
    marginBottom: 24,
  },
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreIconContainer: {
    backgroundColor: `${colors.success}20`,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  scoreTextContainer: {
    flex: 1,
  },
  scoreTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textStrong,
  },
  scoreSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  scoreValueContainer: {
    alignItems: 'flex-end',
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.success,
  },
  scoreLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.success,
    textTransform: 'uppercase',
  },

  menu: { gap: 12 },
  menuItem: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  menuIcon: { width: 40 },
  menuText: { flex: 1 },
  menuTitle: { fontSize: 17, fontWeight: '900', color: colors.textStrong },
  menuSubtitle: { color: colors.muted, marginTop: 2, fontSize: 13 },
  menuBadge: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginRight: 12,
  },
  menuBadgeText: {
    color: colors.success,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  signOutButton: {
    backgroundColor: '#EF4444',
    borderRadius: 999,
    marginTop: 40,
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  signOutText: { color: '#fff', fontWeight: '900', fontSize: 17 },

  version: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: 40,
    fontSize: 12,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    maxHeight: '80%',
    padding: spacing.screenX,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textStrong,
  },
  modalDescription: {
    fontSize: 15,
    color: colors.muted,
    marginBottom: 20,
    lineHeight: 22,
  },
  marketOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  marketOptionSelected: {
    backgroundColor: 'rgba(64, 21, 163, 0.05)',
  },
  marketOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textStrong,
  },
  marketOptionTextSelected: {
    color: colors.primary,
    fontWeight: '800',
  }
});
