import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFinancialConnectionsSheet } from '@stripe/stripe-react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthSession } from '@/lib/authContext';
import { createFinancialConnectionsSession, getLinkedAccounts, type BackendLinkedAccount } from '@/lib/api';
import { colors, radii, spacing } from '@/lib/theme';

const isStripeSupported = Platform.OS !== 'web' && Constants.appOwnership !== 'expo';

function NativeStripeButton({ session, onSuccess, label }: { session: any, onSuccess?: () => void, label?: string }) {
  const [isLinkingBank, setIsLinkingBank] = useState(false);
  const { collectFinancialConnectionsAccounts } = useFinancialConnectionsSheet();

  const handleConnectBank = async () => {
    if (!session?.session.token) return;
    try {
      setIsLinkingBank(true);
      const { clientSecret } = await createFinancialConnectionsSession(session.session.token);
      
      const { error } = await collectFinancialConnectionsAccounts(clientSecret);
      
      if (error) {
        Alert.alert('Connection Failed', error.message || 'Unknown error');
      } else {
        Alert.alert('Success', 'Your bank account has been securely linked!');
        onSuccess?.();
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to initiate bank connection.');
    } finally {
      setIsLinkingBank(false);
    }
  };

  return (
    <Pressable 
      style={({ pressed }) => [styles.connectButton, pressed && styles.connectButtonPressed]}
      onPress={handleConnectBank}
      disabled={isLinkingBank}
      accessibilityRole="button"
    >
      {isLinkingBank ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <FontAwesome name="lock" size={16} color="#fff" />
      )}
      <Text style={styles.connectButtonText}>
        {isLinkingBank ? 'Connecting...' : (label || 'Connect with Stripe')}
      </Text>
    </Pressable>
  );
}

function LinkedAccountsList({ session }: { session: any }) {
  const [accounts, setAccounts] = useState<BackendLinkedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAccounts = async () => {
    if (!session?.session.token) return;
    try {
      setIsLoading(true);
      const linked = await getLinkedAccounts(session.session.token);
      setAccounts(linked);
    } catch (err) {
      console.error('Failed to fetch linked accounts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [session?.session.token]);

  if (isLoading) {
    return <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 16 }} />;
  }

  if (accounts.length === 0) {
    return <NativeStripeButton session={session} onSuccess={fetchAccounts} />;
  }

  return (
    <View style={styles.linkedAccountsContainer}>
      <Text style={styles.linkedAccountsTitle}>Linked Bank Accounts</Text>
      {accounts.map(acc => (
        <View key={acc.id} style={styles.linkedAccountRow}>
          <View style={styles.linkedAccountIcon}>
            <FontAwesome name="bank" size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkedAccountText}>{acc.bankName} •••• {acc.last4}</Text>
          </View>
          <View style={styles.connectedBadge}>
            <Text style={styles.connectedBadgeText}>Connected</Text>
          </View>
        </View>
      ))}
      <Text style={styles.linkedAccountNote}>
        Used for automated contributions when enabled.
      </Text>
      <NativeStripeButton session={session} onSuccess={fetchAccounts} label="Connect another account" />
    </View>
  );
}

export default function AutomatedPaymentsScreen() {
  const { session } = useAuthSession();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={20}>
          <FontAwesome name="chevron-left" size={20} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>Automated Payments</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.bankCard}>
          <View style={styles.bankHeaderRow}>
            <View style={styles.bankIconContainer}>
              <FontAwesome name="bank" size={20} color={colors.primary} />
            </View>
            <Text style={styles.bankTitle}>Automated Payments</Text>
          </View>
          <Text style={styles.bankDescription}>
            Connect your bank account to automate contributions and receive payouts instantly.
          </Text>
          
          {isStripeSupported ? (
            <LinkedAccountsList session={session} />
          ) : (
            <Pressable 
              style={({ pressed }) => [styles.connectButton, pressed && styles.connectButtonPressed]}
              onPress={() => Alert.alert('Build Required', 'The Stripe SDK requires a native development build (eas build). It cannot run in Expo Go or Web.')}
              accessibilityRole="button"
            >
              <FontAwesome name="lock" size={16} color="#fff" />
              <Text style={styles.connectButtonText}>Connect with Stripe</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenX,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textStrong,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerRight: {
    width: 40,
  },
  content: { 
    paddingBottom: 100, 
    paddingHorizontal: spacing.screenX,
    paddingTop: 24,
  },
  bankCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 20,
    marginBottom: 24,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  bankHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bankIconContainer: {
    backgroundColor: colors.primarySoft,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bankTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textStrong,
  },
  bankDescription: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 20,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  connectButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  linkedAccountsContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  linkedAccountsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textStrong,
    marginBottom: 12,
  },
  linkedAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 12,
  },
  linkedAccountIcon: {
    backgroundColor: colors.primarySoft,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  linkedAccountText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textStrong,
  },
  connectedBadge: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  connectedBadgeText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  linkedAccountNote: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 16,
    fontStyle: 'italic',
  }
});
