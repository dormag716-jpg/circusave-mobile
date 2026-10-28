import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { getCircles } from '@/lib/api';
import { useAuthSession } from '@/lib/auth/authContext';
import type { BackendCircleSummary } from '@/lib/shared/types';
import { colors, radii, spacing } from '@/lib/shared/theme';

type Props = {
  onPick: (circleId: string) => void;
  onClose: () => void;
};

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; circles: BackendCircleSummary[] };

/**
 * Shown inside the assistant sheet when it was opened away from a circle and the
 * user has more than one (or the list could not be read): choose which circle to
 * ask about instead of guessing.
 */
export function AssistantCirclePicker({ onPick, onClose }: Props) {
  const { t } = useTranslation('assistant');
  const { session } = useAuthSession();
  const token = session?.session.token;
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    if (!token) return;
    setState({ status: 'loading' });
    try {
      const circles = await getCircles(token);
      setState({
        status: 'ready',
        circles: (circles || []).filter(
          (circle) => String(circle.userRole || '').toLowerCase() !== 'waitlist',
        ),
      });
    } catch {
      setState({ status: 'error' });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {t('picker.title')}
        </Text>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('picker.close')}
        >
          <FontAwesome name="times" size={18} color={colors.muted} />
        </Pressable>
      </View>
      <Text style={styles.note}>{t('picker.note')}</Text>

      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.note}>{t('picker.loading')}</Text>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.note}>{t('picker.error')}</Text>
          <Pressable style={styles.retry} onPress={() => void load()} accessibilityRole="button">
            <Text style={styles.retryText}>{t('picker.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {state.status === 'ready' && state.circles.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.note}>{t('picker.empty')}</Text>
        </View>
      ) : null}

      {state.status === 'ready' && state.circles.length > 0 ? (
        <FlatList
          data={state.circles}
          keyExtractor={(circle) => circle.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => onPick(item.id)}
              accessibilityRole="button"
              accessibilityLabel={t('picker.pickA11y', { name: item.name })}
            >
              <View style={styles.badge}>
                <FontAwesome name="users" size={14} color={colors.primary} />
              </View>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              <FontAwesome name="chevron-right" size={11} color={colors.muted} />
            </Pressable>
          )}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.screenX, paddingTop: 8, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800', color: colors.textStrong },
  note: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  center: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  retry: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.control,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  retryText: { color: colors.textStrong, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    minHeight: 52,
  },
  rowPressed: { opacity: 0.7 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: { flex: 1, color: colors.textStrong, fontSize: 16, fontWeight: '700' },
});
