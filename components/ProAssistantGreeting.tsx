import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { colors, radii } from '@/lib/shared/theme';
import { useDeviceLock } from '@/components/DeviceLock';

/**
 * Local greeting for a signed-in user. It does not call the assistant model and
 * shows no circle data, only fixed copy.
 *
 * It is a band in the page flow above the navigator, not an overlay, so it can
 * never cover a title, button or field: screens are laid out below it. It is
 * hidden while the device is locked and while the keyboard is open (the greeting
 * stays armed and returns when the keyboard closes), and it stays until the user
 * opens the assistant or closes it.
 */
export function ProAssistantGreeting() {
  const { session, status } = useAuthSession();
  const { isLocked, isInitializing } = useDeviceLock();
  const { entitlements, status: entitlementsStatus } = useEntitlements();
  const { t } = useTranslation('assistant');
  const insets = useSafeAreaInsets();
  const [greeting, setGreeting] = useState(initialProGreetingState);
  const [opening, setOpening] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const visible = proGreetingVisible(greeting, input) && !keyboardOpen;

  useEffect(() => {
    if (!visible) {
      fade.setValue(0);
      return;
    }
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [visible, fade]);

  if (!visible) {
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
    <Animated.View
      style={[styles.band, { paddingTop: insets.top + 8, opacity: fade }]}
    >
      <View style={styles.card}>
        <View style={styles.badge}>
          <FontAwesome name="magic" size={16} color={colors.onColor} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} accessibilityRole="header">
            {t('greeting.title')}
          </Text>
          <Text style={styles.body}>{t('greeting.body')}</Text>
          <Pressable
            onPress={() => {
              void openAssistant();
            }}
            disabled={opening}
            hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('greeting.openA11y')}
            style={({ pressed }) => [
              styles.openButton,
              pressed && styles.pressed,
              opening && styles.disabled,
            ]}
          >
            <Text style={styles.openText}>{t('greeting.open')}</Text>
            <FontAwesome name="arrow-right" size={12} color={colors.onColor} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => setGreeting((current) => dismissProGreeting(current))}
          accessibilityRole="button"
          accessibilityLabel={t('greeting.dismissA11y')}
          hitSlop={8}
          style={({ pressed }) => [styles.dismissButton, pressed && styles.pressed]}
        >
          <FontAwesome name="times" size={16} color={colors.muted} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: colors.primarySoft,
    borderBottomColor: colors.primaryBorder,
    borderBottomWidth: 1,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  card: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    marginTop: 2,
    width: 36,
  },
  copy: { flex: 1, gap: 4 },
  title: { color: colors.textStrong, fontSize: 15, fontWeight: '800' },
  body: { color: colors.text, fontSize: 13, lineHeight: 17 },
  openButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    minHeight: 36,
    paddingHorizontal: 16,
  },
  openText: { color: colors.onColor, fontSize: 14, fontWeight: '800' },
  dismissButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginRight: -10,
    marginTop: -8,
    width: 44,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.6 },
});
