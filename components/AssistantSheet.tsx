import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { colors, radii, shadows } from '@/lib/shared/theme';

const SHEET_FRACTION = 0.72;
const DISMISS_Y = 120;
const SPRING = { damping: 22, stiffness: 220, mass: 0.9 };

type Props = {
  visible: boolean;
  onClose: () => void;
  children?: React.ReactNode | ((requestClose: () => void) => React.ReactNode);
};

/**
 * Floating bottom sheet over the current screen (home stays mounted).
 * Pan is limited to the drag handle so chat scroll stays usable.
 */
export function AssistantSheet({ visible, onClose, children }: Props) {
  const { t } = useTranslation('common');
  const { height: windowH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Sizes follow the live window (small screens, rotation, display-size changes).
  const baseH = Math.round(windowH * SHEET_FRACTION);
  const expandedH = Math.max(baseH, windowH - insets.top - 8);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const sheetH = useSharedValue(baseH);
  const offscreenY = useSharedValue(windowH);
  const translateY = useSharedValue(windowH);
  const dragStartY = useSharedValue(0);
  const [mounted, setMounted] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // With the keyboard open, use the whole space above it so the conversation and
  // composer have room (a 72% sheet minus a keyboard leaves almost nothing).
  useEffect(() => {
    sheetH.value = withTiming(keyboardOpen ? expandedH : baseH, { duration: 200 });
    offscreenY.value = windowH;
  }, [keyboardOpen, baseH, expandedH, windowH, sheetH, offscreenY]);

  const finishClose = useCallback(() => {
    closingRef.current = false;
    setMounted(false);
    onCloseRef.current();
  }, []);

  const animateClosed = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    translateY.value = withSpring(offscreenY.value, SPRING, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [finishClose, translateY]);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      setMounted(true);
      translateY.value = offscreenY.value;
      const id = requestAnimationFrame(() => {
        translateY.value = withSpring(0, SPRING);
      });
      return () => cancelAnimationFrame(id);
    }
    if (mounted && !closingRef.current) {
      animateClosed();
    }
    // Only react to visibility changes; mount/close helpers stay stable via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [visible]);

  // Android Back closes the sheet instead of navigating the screen underneath.
  // (With the keyboard open the system dismisses the keyboard first.)
  useEffect(() => {
    if (!mounted) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      animateClosed();
      return true;
    });
    return () => sub.remove();
  }, [mounted, animateClosed]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-24, 24])
    .onBegin(() => {
      dragStartY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = Math.max(0, dragStartY.value + e.translationY);
      translateY.value = next;
    })
    .onEnd((e) => {
      const shouldClose = translateY.value > DISMISS_Y || e.velocityY > 900;
      if (shouldClose) {
        runOnJS(animateClosed)();
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    height: sheetH.value,
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, offscreenY.value],
      [0.45, 0],
      Extrapolation.CLAMP,
    ),
  }));

  if (!mounted) return null;

  const body =
    typeof children === 'function' ? children(animateClosed) : children;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={animateClosed}
        accessibilityRole="button"
        accessibilityLabel={t('closeDialog')}
      >
        <Animated.View style={[styles.backdrop, backdropStyle]} />
      </Pressable>

      <Animated.View
        style={[styles.sheet, sheetStyle]}
        accessibilityViewIsModal
      >
        <GestureDetector gesture={pan}>
          <Animated.View style={styles.handleHit}>
            <View style={styles.handle} />
          </Animated.View>
        </GestureDetector>
        <View style={styles.body}>{body}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.shadow,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.modal,
    borderTopRightRadius: radii.modal,
    ...shadows.medium,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  handleHit: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.cardBorder,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
});
