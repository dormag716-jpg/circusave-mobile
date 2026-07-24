import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, type Href, useFocusEffect } from 'expo-router';
import { useCallback, useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';

import { useAuthSession } from '@/lib/authContext';
import { getLinkedAccounts, type BackendLinkedAccount } from '@/lib/api';
import { readLanguagePreference } from '@/lib/i18n/language-storage';
import {
  LANGUAGE_OPTIONS,
  type LanguagePreference,
} from '@/lib/i18n/types';
import { scheduleTestNotification } from '@/lib/notifications';
import { useMarket, type MarketType } from '@/lib/market';
import { colors, radii, spacing } from '@/lib/theme';

export default function SettingsScreen() {
  const { i18n, t } = useTranslation(['settings', 'navigation']);
  const { session, signOut } = useAuthSession();
  const { market, setMarket } = useMarket();
  const [modalVisible, setModalVisible] = useState(false);
  const [accounts, setAccounts] = useState<BackendLinkedAccount[]>([]);
  const [languagePreference, setLanguagePreference] =
    useState<LanguagePreference>('system');

  useEffect(() => {
    if (!session?.session.token) return;
    getLinkedAccounts(session.session.token).then(setAccounts).catch(console.error);
  }, [session?.session.token]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void readLanguagePreference().then((preference) => {
        if (active) {
          setLanguagePreference(preference);
        }
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const displayName = session?.user.name ?? t('settings:title');
  const email = session?.user.email ?? t('settings:connectedSession');
  const reliabilityScore = session?.user.reliabilityScore !== undefined 
    ? `${session.user.reliabilityScore}%` 
    : '--%';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Profile Header */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.avatarContainer}>
              <Avatar name={displayName} size={90} />
              <View style={styles.badgeContainer}>
                <FontAwesome name="check-circle" size={18} color={colors.primary} />
              </View>
            </View>
            
            <View style={styles.headerInfo}>
              <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.email} numberOfLines={1}>{email}</Text>
              
              <View style={styles.reliabilityBadge}>
                <FontAwesome name="shield" size={12} color={colors.success} style={{ marginRight: 6 }} />
                <Text style={styles.reliabilityText}>
                  {t('settings:reliabilityScore', { score: reliabilityScore })}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Section: Financial */}
        <Text style={styles.sectionTitle}>{t('settings:financialPayments')}</Text>
        <View style={styles.sectionContainer}>
          <MenuItem
            icon="bank"
            title={t('settings:automatedPayments')}
            subtitle={accounts.length > 0 ? t('settings:bankLinked') : t('settings:connectBank')}
            badge={accounts.length > 0 ? t('settings:connected') : undefined}
            onPress={() => router.push('/automated-payments')}
            isFirst
          />
          <MenuItem
            icon="credit-card"
            title={t('settings:paymentPreferences')}
            subtitle="CashApp, Venmo, PayPal"
            onPress={() => router.push('/payment-preferences')}
          />
          <MenuItem
            icon="history"
            title={t('settings:completedCircles')}
            subtitle={t('settings:completedCirclesSubtitle')}
            onPress={() => router.push('/completed-circles')}
            isLast
          />
        </View>

        {/* Section: Account & Security */}
        <Text style={styles.sectionTitle}>{t('settings:accountSecurity')}</Text>
        <View style={styles.sectionContainer}>
          <MenuItem
            icon="lock"
            title={t('settings:security')}
            subtitle={t('settings:securitySubtitle')}
            onPress={() => router.push('/security')}
            isFirst
          />
          <MenuItem
            icon="star-o"
            title={t('settings:subscription')}
            subtitle={t('settings:subscriptionSubtitle')}
            onPress={() => router.push('/subscription')}
            isLast
          />
        </View>

        {/* Section: Preferences */}
        <Text style={styles.sectionTitle}>{t('settings:preferences')}</Text>
        <View style={styles.sectionContainer}>
          <MenuItem
            icon="language"
            title={t('settings:language')}
            subtitle={getLanguagePreferenceLabel(
              languagePreference,
              i18n.resolvedLanguage || i18n.language,
              t('settings:usePhoneLanguage'),
            )}
            onPress={() => router.push('/language')}
            isFirst
          />
          <MenuItem
            icon="globe"
            title={t('settings:culturalTerminology')}
            subtitle={t('settings:currentTerminology', { market: market.toUpperCase() })}
            onPress={() => setModalVisible(true)}
          />
          <MenuItem
            icon="bell-o"
            title={t('settings:testNotification')}
            subtitle={t('settings:testNotificationSubtitle')}
            onPress={async () => {
              const result = await scheduleTestNotification('test');
              if (result.ok) {
                Alert.alert(t('settings:scheduled'), t('settings:scheduledMessage'));
              } else {
                Alert.alert(
                  t('settings:notificationsUnavailable'),
                  t('settings:genericFailure'),
                );
              }
            }}
            isLast
          />
        </View>

        {/* Section: Support */}
        <Text style={styles.sectionTitle}>{t('settings:supportAbout')}</Text>
        <View style={styles.sectionContainer}>
          <MenuItem
            icon="question-circle-o"
            title={t('settings:helpSupport')}
            subtitle={t('settings:helpSupportSubtitle')}
            onPress={() => router.push('/support')}
            isFirst
          />
          <MenuItem
            icon="file-text-o"
            title={t('settings:legalPolicies')}
            subtitle={t('settings:legalPoliciesSubtitle')}
            onPress={() => router.push('/legal' as Href)}
            isLast
          />
        </View>

        {/* Sign Out */}
        <Pressable
          style={({ pressed }) => [
            styles.signOutButton,
            pressed && styles.signOutButtonPressed
          ]}
          onPress={() =>
            Alert.alert(t('settings:signOutTitle'), t('settings:signOutMessage'), [
              { text: t('settings:cancel'), style: 'cancel' },
              {
                text: t('settings:signOut'),
                style: 'destructive',
                onPress: async () => {
                  try {
                    await signOut();
                  } finally {
                    router.replace('/login');
                  }
                },
              },
            ])
          }
          accessibilityRole="button"
          accessibilityLabel={t('settings:signOut')}
        >
          <FontAwesome name="sign-out" size={20} color="#EF4444" style={{ marginRight: 8 }} />
          <Text style={styles.signOutText}>{t('settings:signOut')}</Text>
        </Pressable>

        {/* Version */}
        <Text style={styles.version}>CircuSave v1.0.0 - Build 2026.06</Text>

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
                <Text style={styles.modalTitle}>{t('settings:selectTerminology')}</Text>
                <Pressable
                  onPress={() => setModalVisible(false)}
                  hitSlop={20}
                  accessibilityRole="button"
                  accessibilityLabel={t('settings:closeTerminology')}
                >
                  <FontAwesome name="times" size={24} color={colors.muted} />
                </Pressable>
              </View>
              <Text style={styles.modalDescription}>
                {t('settings:terminologyDescription')}
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
                      <FontAwesome name="check-circle" size={20} color={colors.primary} />
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

function getLanguagePreferenceLabel(
  preference: LanguagePreference,
  currentLanguage: string,
  systemLabel: string,
) {
  if (preference === 'system') {
    const currentLabel =
      LANGUAGE_OPTIONS.find((option) => option.value === currentLanguage)?.label ??
      LANGUAGE_OPTIONS[1].label;
    return `${systemLabel} · ${currentLabel}`;
  }

  return (
    LANGUAGE_OPTIONS.find((option) => option.value === preference)?.label ??
    LANGUAGE_OPTIONS[1].label
  );
}

function MenuItem({ icon, title, subtitle, badge, onPress, isFirst, isLast }: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <Pressable 
      style={({ pressed }) => [
        styles.menuItem,
        isFirst && styles.menuItemFirst,
        isLast && styles.menuItemLast,
        pressed && styles.menuItemPressed
      ]} 
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <View style={styles.menuIconContainer}>
        <FontAwesome name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      {badge && (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      )}
      <FontAwesome name="chevron-right" size={14} color={colors.muted} />
    </Pressable>
  );
}



const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingBottom: 100 },

  headerCard: { 
    backgroundColor: colors.card,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 20,
  },
  avatar: {
    backgroundColor: colors.primary,
    borderRadius: 45,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '800', textAlign: 'center' },
  badgeContainer: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  name: { fontSize: 24, fontWeight: '900', color: colors.textStrong, marginBottom: 2 },
  email: { color: colors.muted, fontSize: 14, marginBottom: 12 },
  reliabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.success}15`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  reliabilityText: {
    color: colors.success,
    fontWeight: '800',
    fontSize: 12,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 24,
    marginBottom: 8,
    marginTop: 8,
  },
  sectionContainer: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  menuItemFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  menuItemLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  menuItemPressed: {
    backgroundColor: '#F1F5F9',
  },
  
  menuIconContainer: { 
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${colors.primary}10`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuText: { flex: 1, marginRight: 8 },
  menuTitle: { fontSize: 16, fontWeight: '600', color: colors.textStrong, marginBottom: 2 },
  menuSubtitle: { color: colors.muted, fontSize: 13 },
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
    flexDirection: 'row',
    backgroundColor: `${colors.danger}10`,
    borderRadius: 16,
    marginTop: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: `${colors.danger}20`,
  },
  signOutButtonPressed: {
    backgroundColor: `${colors.danger}20`,
  },
  signOutText: { color: '#EF4444', fontWeight: '700', fontSize: 16 },

  version: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: 32,
    marginBottom: 20,
    fontSize: 13,
    fontWeight: '500',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textStrong,
  },
  modalDescription: {
    fontSize: 15,
    color: colors.muted,
    marginBottom: 24,
    lineHeight: 22,
  },
  marketOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: colors.card,
  },
  marketOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}08`,
  },
  marketOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textStrong,
  },
  marketOptionTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  }
});
