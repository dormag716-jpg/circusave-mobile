/**
 * Pure math for keeping a focused form field visible above the software
 * keyboard. All values are dp in window coordinates (what `measureInWindow`
 * and keyboard events report). No react-native import, so it runs in Jest.
 */

/** Space kept between a focused field's bottom edge and the keyboard. */
export const KEYBOARD_FIELD_GAP = 22;

/** Space kept between a field's top edge and the top of the visible area. */
export const FIELD_TOP_MARGIN = 8;

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * How far the keyboard covers the bottom of a scroll view. Zero when the
 * keyboard is hidden or the window already resized above it (Android
 * adjustResize), so no padding is ever added in that case.
 */
export function keyboardCoverage(
  viewBottom: number,
  keyboardTop: number | null | undefined,
): number {
  if (!finite(viewBottom) || !finite(keyboardTop)) return 0;
  return Math.max(0, Math.round(viewBottom - keyboardTop));
}

/** Lowest visible y of a scroll view: its bottom, or the keyboard top if higher. */
export function visibleBottom(
  viewBottom: number,
  keyboardTop: number | null | undefined,
): number {
  return finite(keyboardTop) ? Math.min(viewBottom, keyboardTop) : viewBottom;
}

/**
 * Scroll offset change that reveals a field with `gap` dp below it.
 * Positive scrolls the content up (reveals lower content), negative down.
 * The field's top is never pushed above the visible area to satisfy the gap.
 */
export function scrollDeltaToRevealField(input: {
  fieldTop: number;
  fieldBottom: number;
  viewportTop: number;
  viewportBottom: number;
  gap?: number;
}): number {
  const { fieldTop, fieldBottom, viewportTop, viewportBottom } = input;
  const gap = input.gap ?? KEYBOARD_FIELD_GAP;
  if (
    !finite(fieldTop) ||
    !finite(fieldBottom) ||
    !finite(viewportTop) ||
    !finite(viewportBottom)
  ) {
    return 0;
  }
  const overflow = fieldBottom + gap - viewportBottom;
  if (overflow > 0) {
    // Scroll down, but keep the field's top on screen if it is taller than
    // the room available.
    const room = fieldTop - (viewportTop + FIELD_TOP_MARGIN);
    return Math.round(Math.max(0, Math.min(overflow, room)));
  }
  const hidden = viewportTop + FIELD_TOP_MARGIN - fieldTop;
  return hidden > 0 ? -Math.round(hidden) : 0;
}
