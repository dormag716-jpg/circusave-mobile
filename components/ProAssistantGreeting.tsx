import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAuthSession } from '@/lib/auth/authContext';
import { getCircles } from '@/lib/api';
import {
  dismissProGreeting,
  initialProGreetingState,
  proGreetingAssistantTarget,
  proGreetingInputSignature,
  proGreetingVisible,
  settleProGreeting,
  type ProGreetingInput,
} from '@/lib/assistant/proGreeting';
import { useEntitlements } from '@/lib/billing/entitlementsContext';
import { myCirclesHref } from '@/lib/platform/navigation';
import { colors, radii, shadows } from '@/lib/shared/theme';
import { useDeviceLock } from '@/components/DeviceLock';

/**
 * Small local greeting for a signed-in user. It does not call the assistant model.
 */
export function ProAssistantGreeting() {
  const { session, status } = useAuthSession();
  const { isLocked, isInitializing } = useDeviceLock();
  const { entitlements, status: entitlementsStatus } = useEntitlements();
  const { t } = useTranslation('assistant');
  const insets = useSafeAreaInsets();
  const [greeting, setGreeting] = useState(initialProGreetingState);
  const [opening, setOpening] = useState(false);

  const input: ProGreetingInput = {
    userId: session?.user?.id ?? null,
    authenticated: status === 'authenticated',
    locked: isLocked,
    lockReady: !isInitializing,
    pro: entitlements.capabilities.aiAssistant === true,
    entitlementsReady: entitlementsStatus === 'ready',
  };
  const signature = proGreetingInputSignature(input);
  const [seenSignature, setSeenSignature] = useState(signature);
  if (seenSignature !== signature) {
    setSeenSignature(signature);
    setGreeting((current) => settleProGreeting(current, input));
  }

  if (!proGreetingVisible(greeting, input)) {
    return null;
  }

  async function openAssistant() {
    if (opening) return;
    const token = session?.session.token;
    setOpening(true);
    try {
      const circles = token ? await getCircles(token) : [];
      const target = proGreetingAssistantTarget(
        (circles || []).map((circle) => circle.id),
      );
      setGreeting((current) => dismissProGreeting(current));
      if (target.kind === 'assistant') {
        router.push(target.href);
        return;
      }
      router.push(myCirclesHref);
    } catch {
      setGreeting((current) => dismissProGreeting(current));
      router.push(myCirclesHref);
    } finally {
      setOpening(false);
    }
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { top: insets.top + 8 }]}
    >
      <View style={styles.card}>
        <View style={styles.copy}>
          <Text style={styles.title}>{t('greeting.title')}</Text>
          <Text style={styles.body}>{t('greeting.body')}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              void openAssistant();
            }}
            disabled={opening}
            accessibilityRole="button"
            accessibilityLabel={t('greeting.openA11y')}
            style={styles.openButton}
          >
            <Text style={styles.openText}>{t('greeting.open')}</Text>
          </Pressable>
          <Pressable
            onPress={() => setGreeting((current) => dismissProGreeting(current))}
            accessibilityRole="button"
            accessibilityLabel={t('greeting.dismissA11y')}
            style={styles.dismissButton}
          >
            <FontAwesome name="times" size={14} color={colors.muted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: 14,
    gap: 10,
    ...shadows.small,
  },
  copy: { gap: 4 },
  title: { color: colors.textStrong, fontSize: 15, fontWeight: '800' },
  body: { color: colors.text, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  openButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  openText: { color: colors.onColor, fontSize: 13, fontWeight: '700' },
  dismissButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
