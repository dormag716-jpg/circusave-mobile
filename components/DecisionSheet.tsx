import FontAwesome from '@expo/vector-icons/FontAwesome';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from 'react-i18next';

import { colors } from '@/lib/theme';

export function DecisionSheet({
  visible,
  onClose,
  icon,
  iconTone = 'primary',
  title,
  body,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  busy = false,
}: {
  visible: boolean;
  onClose: () => void;
  icon: ComponentProps<typeof FontAwesome>['name'];
  iconTone?: 'primary' | 'success' | 'warning';
  title: string;
  body: string;
  children?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string | null;
  /** When omitted, the secondary button uses onClose (Cancel / dismiss). */
  onSecondary?: () => void;
  busy?: boolean;
}) {
  const { t } = useTranslation('common');
  const resolvedSecondaryLabel =
    secondaryLabel === undefined ? t('cancel') : secondaryLabel;
  const tone = {
    primary: { background: colors.primarySoft, foreground: colors.primary },
    success: { background: colors.successSoft, foreground: colors.success },
    warning: { background: colors.warningSoft, foreground: colors.warning },
  }[iconTone];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('closeDialog')}
        />
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.handle} />
          <View style={[styles.icon, { backgroundColor: tone.background }]}>
            <FontAwesome name={icon} size={22} color={tone.foreground} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {children ? <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>{children}</ScrollView> : null}
          <View style={styles.actions}>
            {resolvedSecondaryLabel ? (
              <Pressable style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} onPress={onSecondary ?? onClose} disabled={busy} accessibilityRole="button">
                <Text style={styles.secondaryText}>{resolvedSecondaryLabel}</Text>
              </Pressable>
            ) : null}
            <Pressable style={({ pressed }) => [styles.primary, (pressed || busy) && styles.pressed]} onPress={onPrimary} disabled={busy} accessibilityRole="button" accessibilityState={{ busy, disabled: busy }}>
              {busy ? <ActivityIndicator color={colors.onColor} /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(17, 24, 39, 0.58)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    paddingBottom: 10,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.cardBorder,
    borderRadius: 2,
    height: 4,
    marginBottom: 20,
    width: 42,
  },
  icon: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginBottom: 14,
    width: 48,
  },
  title: {
    color: colors.textStrong,
    fontSize: 22,
    fontWeight: '900',
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
  },
  content: {
    marginTop: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  secondary: {
    alignItems: 'center',
    borderColor: colors.cardBorder,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
  },
  secondaryText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  primary: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 16,
    flex: 1.45,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 12,
  },
  primaryText: {
    color: colors.onColor,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
