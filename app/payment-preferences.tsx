import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { updateUserProfile } from '../lib/api';
import { colors } from '../lib/theme';

export default function PaymentPreferencesScreen() {
  const router = useRouter();
  const { session, user, refreshUser } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [cashtag, setCashtag] = useState(user?.cashtag || '');
  const [venmoHandle, setVenmoHandle] = useState(user?.venmoHandle || '');
  const [paypalEmail, setPaypalEmail] = useState(user?.paypalEmail || '');
  
  // Update state if user changes
  useEffect(() => {
    setCashtag(user?.cashtag || '');
    setVenmoHandle(user?.venmoHandle || '');
    setPaypalEmail(user?.paypalEmail || '');
  }, [user]);

  async function handleSave() {
    if (!session?.token) return;
    
    // Simple validation (e.g., cashtag starts with $)
    const cleanCashtag = cashtag.trim();
    if (cleanCashtag && !cleanCashtag.startsWith('$')) {
      Alert.alert('Invalid Cashtag', 'CashApp Cashtags must start with a $ symbol.');
      return;
    }

    const cleanVenmo = venmoHandle.trim();
    if (cleanVenmo && !cleanVenmo.startsWith('@')) {
      Alert.alert('Invalid Venmo Handle', 'Venmo handles must start with an @ symbol.');
      return;
    }
    
    setLoading(true);
    try {
      await updateUserProfile(session.token, {
        cashtag: cleanCashtag || undefined,
        venmoHandle: cleanVenmo || undefined,
        paypalEmail: paypalEmail.trim() || undefined
      });
      await refreshUser();
      Alert.alert('Saved', 'Your payment preferences have been updated.');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save payment preferences.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable 
          onPress={() => router.back()} 
          style={styles.backButton}
          hitSlop={20}
        >
          <FontAwesome name="angle-left" size={32} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>Payment Preferences</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.description}>
          Add your payment tags below. Organizers will use these links to send you your payout when it's your turn to receive the pot.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>CashApp Cashtag</Text>
          <View style={styles.inputWrapper}>
            <FontAwesome name="dollar" size={16} color={colors.primary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="$cashtag"
              placeholderTextColor={colors.textMuted}
              value={cashtag}
              onChangeText={setCashtag}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Text style={styles.helperText}>Used for generating CashApp payout links</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Venmo Handle</Text>
          <View style={styles.inputWrapper}>
            <FontAwesome name="vimeo" size={16} color={colors.primary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="@username"
              placeholderTextColor={colors.textMuted}
              value={venmoHandle}
              onChangeText={setVenmoHandle}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Text style={styles.helperText}>Used for generating Venmo payout links</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>PayPal Email / Tag</Text>
          <View style={styles.inputWrapper}>
            <FontAwesome name="paypal" size={16} color={colors.primary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="email@example.com or paypal.me/tag"
              placeholderTextColor={colors.textMuted}
              value={paypalEmail}
              onChangeText={setPaypalEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>
          <Text style={styles.helperText}>Used for PayPal payouts</Text>
        </View>

        <Pressable 
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.saveButtonText}>Save Preferences</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textStrong,
  },
  placeholder: {
    width: 40,
  },
  content: {
    padding: 24,
  },
  description: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textStrong,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
  },
  inputIcon: {
    marginRight: 12,
    width: 20,
    textAlign: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.textStrong,
    height: '100%',
  },
  helperText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  saveButton: {
    backgroundColor: colors.primary,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  }
});
