import AsyncStorage from '@react-native-async-storage/async-storage';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAssistantSheet } from '@/components/AssistantSheetContext';
import { useDeviceLock } from '@/components/DeviceLock';
import { useOpenAssistant } from '@/components/useOpenAssistant';
import {
  ASSISTANT_FAB_SIZE,
  DEFAULT_ASSISTANT_FAB_PLACEMENT,
  assistantFabAvailable,
  assistantFabBounds,
  assistantFabPlacementFromDrop,
  assistantFabPosition,
  parseAssistantFabPlacement,
  type FabPlacement,
} from '@/lib/assistant/assistantFab';
import {
  ASSISTANT_FAB_STORAGE_KEY,
  resetAssistantFabPlacement,
  subscribeAssistantFabReset,
} from '@/lib/assistant/assistantFabStore';
import { useAuthSession } from '@/lib/auth/authContext';
import { colors, shadows } from '@/lib/shared/theme';

const STORAGE_KEY = ASSISTANT_FAB_STORAGE_KEY;
const SPRING = { damping: 20, stiffness: 240, mass: 0.8 };

/**
 * The single way to open the assistant: a floating circle over the screen.
 *
 * It stays visible whenever the user is signed in and unlocked, on the screens
 * listed in assistantFab.ts. It can be dragged anywhere inside bounds that clear
 * the status bar, the tab bar and the composer area, snaps to the nearer side edge
 * when released, and remembers its place. It steps aside for the keyboard and the
 * open sheet, and is gone while locked. Only the button carries a gesture; there is
 * no screen-wide handler.
 */
export function AssistantFabLayer({ children }: { children: ReactNode }) {
  const { t } = useTranslation('assistant');
  const { status } = useAuthSession();
  const { isLocked, isInitializing } = useDeviceLock();
  const { isOpen } = useAssistantSheet();
  const { open } = useOpenAssistant();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [placement, setPlacement] = useState<FabPlacement>(DEFAULT_ASSISTANT_FAB_PLACEMENT);
  const placementRef = useRef(placement);
  placementRef.current = placement;

  const available = assistantFabAvailable({
    authenticated: status === 'authenticated',
    locked: isLocked,
    lockReady: !isInitializing,
    pathname,
    keyboardOpen,
    sheetOpen: isOpen,
  });

  const bounds = assistantFabBounds({ width, height, insets, pathname });
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dragging = useSharedValue(false);
  // Bounds as shared values: the drag handler runs on the UI thread, where React
  // refs and ordinary helpers are not available.
  const boundMinX = useSharedValue(0);
  const boundMaxX = useSharedValue(0);
  const boundMinY = useSharedValue(0);
  const boundMaxY = useSharedValue(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Restore the saved place once.
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (active && raw) setPlacement(parseAssistantFabPlacement(raw));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Settings can put the button back to its default place.
  useEffect(
    () => subscribeAssistantFabReset(() => setPlacement(DEFAULT_ASSISTANT_FAB_PLACEMENT)),
    [],
  );

  // Keep the button inside the bounds when the screen, insets or window change.
  const { minX, maxX, minY, maxY } = bounds;
  useEffect(() => {
    boundMinX.value = minX;
    boundMaxX.value = maxX;
    boundMinY.value = minY;
    boundMaxY.value = maxY;
    if (dragging.value) return;
    const next = assistantFabPosition(placement, { minX, maxX, minY, maxY });
    x.value = withSpring(next.x, SPRING);
    y.value = withSpring(next.y, SPRING);
  }, [placement, minX, maxX, minY, maxY, x, y, dragging, boundMinX, boundMaxX, boundMinY, boundMaxY]);

  const settle = useCallback((dropX: number, dropY: number) => {
    const next = assistantFabPlacementFromDrop({ x: dropX, y: dropY }, boundsRef.current);
    setPlacement(next);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
    const target = assistantFabPosition(next, boundsRef.current);
    x.value = withSpring(target.x, SPRING);
    y.value = withSpring(target.y, SPRING);
  }, [x, y]);

  const pan = Gesture.Pan()
    .minDistance(6)
    .onBegin(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onStart(() => {
      dragging.value = true;
    })
    .onUpdate((event) => {
      x.value = Math.min(
        Math.max(startX.value + event.translationX, boundMinX.value),
        boundMaxX.value,
      );
      y.value = Math.min(
        Math.max(startY.value + event.translationY, boundMinY.value),
        boundMaxY.value,
      );
    })
    .onEnd(() => {
      runOnJS(settle)(x.value, y.value);
    })
    .onFinalize(() => {
      dragging.value = false;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return (
    <View style={styles.root}>
      {children}
      {available ? (
        <View style={styles.overlay} pointerEvents="box-none">
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.fabHost, animatedStyle]}>
              <Pressable
                style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
                onPress={() => void open()}
                accessibilityRole="button"
                accessibilityLabel={t('fab.open')}
                accessibilityHint={t('fab.hint')}
                accessibilityActions={[{ name: 'resetPosition', label: t('fab.resetAction') }]}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'resetPosition') {
                    void resetAssistantFabPlacement();
                    AccessibilityInfo.announceForAccessibility(t('fab.resetDone'));
                  }
                }}
                hitSlop={4}
              >
                <FontAwesome name="magic" size={22} color={colors.onColor} />
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject },
  fabHost: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: ASSISTANT_FAB_SIZE,
    height: ASSISTANT_FAB_SIZE,
  },
  fab: {
    width: ASSISTANT_FAB_SIZE,
    height: ASSISTANT_FAB_SIZE,
    borderRadius: ASSISTANT_FAB_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.small,
    elevation: 6,
  },
  pressed: { opacity: 0.85 },
});
