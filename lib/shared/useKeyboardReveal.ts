import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type View,
} from 'react-native';

import {
  keyboardCoverage,
  scrollDeltaToRevealField,
  visibleBottom,
} from './keyboardScroll';

/**
 * Keeps the focused TextInput inside a ScrollView fully visible, with a gap
 * above the software keyboard.
 *
 * Attach `viewportRef` to a plain View that wraps the ScrollView (its size is
 * the visible area) and `scrollRef`/`onScroll` to the ScrollView itself.
 *
 * - On every focus and every keyboard show it measures the focused field and
 *   the scroll view in window coordinates and scrolls just enough.
 * - `keyboardInset` is how far the keyboard covers the scroll view. It is
 *   zero when the window already resized above the keyboard, and returns to
 *   zero when the keyboard closes, so no space is left behind.
 */
export function useKeyboardReveal(topInset = 0) {
  // Keyboard events report `screenY` in screen coordinates, but
  // `measureInWindow` on edge-to-edge Android is measured from below the status
  // bar. Comparing them directly put the keyboard `topInset` dp too low, so
  // the field stopped that far short of the gap. Measured on the emulator with
  // logging: a field at y=467 in JS was at y=491 on screen (24 dp = status bar).
  const keyboardTopCorrection = Platform.OS === 'android' ? topInset : 0;
  const correctionRef = useRef(keyboardTopCorrection);
  correctionRef.current = keyboardTopCorrection;
  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const offsetY = useRef(0);
  // Scroll position before the keyboard opened, restored when it closes.
  const offsetBeforeKeyboard = useRef<number | null>(null);
  const keyboardTop = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const reveal = useCallback(() => {
    const field = TextInput.State.currentlyFocusedInput();
    const scroll = scrollRef.current;
    const viewport = viewportRef.current;
    if (!field || !scroll || !viewport) return;
    field.measureInWindow((_fx, fieldY, _fw, fieldHeight) => {
      viewport.measureInWindow((_sx, scrollY, _sw, scrollHeight) => {
        const delta = scrollDeltaToRevealField({
          fieldTop: fieldY,
          fieldBottom: fieldY + fieldHeight,
          viewportTop: scrollY,
          viewportBottom: visibleBottom(scrollY + scrollHeight, keyboardTop.current),
        });
        if (delta !== 0) {
          scroll.scrollTo({
            y: Math.max(0, offsetY.current + delta),
            animated: true,
          });
        }
      });
    });
  }, []);

  const scheduleReveal = useCallback(
    (delayMs: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(reveal, delayMs);
    },
    [reveal],
  );

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      keyboardTop.current = event.endCoordinates.screenY - correctionRef.current;
      if (offsetBeforeKeyboard.current === null) {
        offsetBeforeKeyboard.current = offsetY.current;
      }
      viewportRef.current?.measureInWindow((_x, y, _w, height) => {
        setKeyboardInset(keyboardCoverage(y + height, keyboardTop.current));
        // Let the extra bottom padding lay out before scrolling into it.
        scheduleReveal(80);
      });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardTop.current = null;
      setKeyboardInset(0);
      const restore = offsetBeforeKeyboard.current;
      offsetBeforeKeyboard.current = null;
      if (restore !== null) {
        scrollRef.current?.scrollTo({ y: restore, animated: true });
      }
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [scheduleReveal]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetY.current = event.nativeEvent.contentOffset.y;
    },
    [],
  );

  const onFieldFocus = useCallback(() => scheduleReveal(60), [scheduleReveal]);

  return { scrollRef, viewportRef, onScroll, keyboardInset, onFieldFocus };
}
