import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '../lib/authContext';
import { getCircles, updateUserProfile } from '../lib/api';
import { circlePaymentSetupHref } from '../lib/navigation';
import { isOrganizer } from '../lib/permissions';
import { colors, shadows } from '../lib/theme';
import type { BackendCircleSummary } from '../lib/types';

export default function PaymentPreferencesScreen() {
  const router = useRouter();
  const { t } = useTranslation(['settings', 'common']);
  const { session: authSession, refreshSession } = useAuthSession();
  const user = authSession?.user;
  const session = authSession?.session;
  
  const [loading, setLoading] = useState(false);
  const [cashtag, setCashtag] = useState(user?.cashtag || '');
  const [venmoHandle, setVenmoHandle] = useState(user?.venmoHandle || '');
  const [paypalEmail, setPaypalEmail] = useState(user?.paypalEmail || '');
  const [organizerCircles, setOrganizerCircles] = useState<BackendCircleSummary[]>([]);
  const [circlesLoading, setCirclesLoading] = useState(true);
  const [circlesError, setCirclesError] = useState<string | null>(null);
  
  // Update state if user changes
  useEffect(() => {
    setCashtag(user?.cashtag || '');
    setVenmoHandle(user?.venmoHandle || '');
    setPaypalEmail(user?.paypalEmail || '');
  }, [user]);

  useEffect(() => {
    let active = true;
    if (!session?.token) {
      setCirclesLoading(false);
      return;
    }
    setCirclesLoading(true);
    setCirclesError(null);
    void getCircles(session.token)
      .then((circles) => {
        if (!active) return;
        setOrganizerCircles(
          circles.filter(
            (circle) =>
              isOrganizer(circle.userRole) &&
              !['completed', 'archived', 'closed'].includes(
                String(circle.status || '').toLowerCase(),
              ),
          ),
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCirclesError(
          error instanceof Error
            ? error.message
            : t('contributionInstructionsLoadError'),
        );
      })
      .finally(() => {
        if (active) setCirclesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.token, t]);

  async function handleSave() {
    if (!session?.token) return;
    
    // Simple validation (e.g., cashtag starts with $)
    const cleanCashtag = cashtag.trim();
    if (cleanCashtag && !cleanCashtag.startsWith('$')) {
      Alert.alert(t('invalidCashtagTitle'), t('invalidCashtagBody'));
      return;
    }

    const cleanVenmo = venmoHandle.trim();
    if (cleanVenmo && !cleanVenmo.startsWith('@')) {
      Alert.alert(t('invalidVenmoTitle'), t('invalidVenmoBody'));
      return;
    }
    
    setLoading(true);
    try {
      await updateUserProfile(session.token, {
        cashtag: cleanCashtag || undefined,
        venmoHandle: cleanVenmo || undefined,
        paypalEmail: paypalEmail.trim() || undefined
      });
      await refreshSession();
      Alert.alert(t('common:saved'), t('paymentPrefsSaved'));
      router.back();
    } catch (e: any) {
      Alert.alert(t('common:error'), e.message || t('paymentPrefsSaveError'));
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
          accessibilityRole="button"
          accessibilityLabel={t('common:goBack')}
        >
          <FontAwesome name="angle-left" size={32} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('paymentPrefsTitle')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.description}>{t('paymentPrefsDescription')}</Text>
        <Text style={styles.disclosure}>{t('externalPaymentDisclosure')}</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('cashtagLabel')}</Text>
          <View style={styles.inputWrapper}>
            <FontAwesome name="dollar" size={16} color={colors.primary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="$cashtag"
              placeholderTextColor={colors.muted}
              value={cashtag}
              onChangeText={setCashtag}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Text style={styles.helperText}>{t('cashtagHelper')}</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('venmoLabel')}</Text>
          <View style={styles.inputWrapper}>
            <FontAwesome name="vimeo" size={16} color={colors.primary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="@username"
              placeholderTextColor={colors.muted}
              value={venmoHandle}
              onChangeText={setVenmoHandle}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Text style={styles.helperText}>{t('venmoHelper')}</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('paypalLabel')}</Text>
          <View style={styles.inputWrapper}>
            <FontAwesome name="paypal" size={16} color={colors.primary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="email@example.com or paypal.me/tag"
              placeholderTextColor={colors.muted}
              value={paypalEmail}
              onChangeText={setPaypalEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>
          <Text style={styles.helperText}>{t('paypalHelper')}</Text>
        </View>

        <Pressable 
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.card} />
          ) : (
            <Text style={styles.saveButtonText}>{t('savePreferences')}</Text>
          )}
        </Pressable>

        <View style={styles.sectionDivider} />
        <Text style={styles.sectionTitle}>{t('contributionInstructions')}</Text>
        <Text style={styles.sectionDescription}>
          {t('contributionInstructionsSubtitle')}
        </Text>

        {circlesLoading ? (
          <View style={styles.circleState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.circleStateText}>
              {t('contributionInstructionsLoading')}
            </Text>
          </View>
        ) : circlesError ? (
          <View style={styles.circleState}>
            <FontAwesome name="warning" size={20} color={colors.warning} />
            <Text style={styles.circleStateText}>{circlesError}</Text>
          </View>
        ) : organizerCircles.length > 0 ? (
          <View style={styles.circleList}>
            {organizerCircles.map((circle) => (
              <Pressable
                key={circle.id}
                style={({ pressed }) => [
                  styles.circleRow,
                  pressed && styles.circleRowPressed,
                ]}
                onPress={() =>
                  router.push(
                    circlePaymentSetupHref(circle.id, 'payment-preferences'),
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={t('manageContributionInstructionsA11y', {
                  circle: circle.name,
                })}
              >
                <View style={styles.circleIcon}>
                  <FontAwesome name="money" size={16} color={colors.primary} />
                </View>
                <View style={styles.circleCopy}>
                  <Text style={styles.circleName} numberOfLines={1}>
                    {circle.name}
                  </Text>
                  <Text style={styles.circleHint}>
                    {t('manageContributionInstructions')}
                  </Text>
                </View>
                <FontAwesome
                  name="chevron-right"
                  size={13}
                  color={colors.subtle}
                />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.circleState}>
            <FontAwesome name="users" size={20} color={colors.muted} />
            <Text style={styles.circleStateText}>
              {t('contributionInstructionsEmpty')}
            </Text>
          </View>
        )}
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
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
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
    marginBottom: 12,
  },
  disclosure: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 28,
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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
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
    color: colors.muted,
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
    color: colors.card,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionDivider: {
    backgroundColor: colors.cardBorder,
    height: 1,
    marginVertical: 32,
  },
  sectionTitle: {
    color: colors.textStrong,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    marginTop: 6,
  },
  circleList: {
    gap: 10,
  },
  circleRow: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    padding: 12,
    ...shadows.small,
  },
  circleRowPressed: {
    opacity: 0.75,
  },
  circleIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  circleCopy: {
    flex: 1,
    minWidth: 0,
  },
  circleName: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '800',
  },
  circleHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  circleState: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
  },
  circleStateText: {
    color: colors.muted,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
