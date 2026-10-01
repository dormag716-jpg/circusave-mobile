/**
 * Circle chat keyboard helpers (pure — no react-native import for unit tests).
 *
 * Floating composer strategy:
 * - Measure how much of the chat container sits under the keyboard.
 * - Lift the dock by that overlap only (works with Android resize AND iOS).
 * - Avoids KeyboardAvoidingView double-padding on Android adjustResize.
 */

/** Approx resting height of the floating ChatInput dock (padding + 48px row). */
export const FLOATING_COMPOSER_RESTING_HEIGHT = 72;

/**
 * Shared air between the chat card and composer, and between the composer
 * and the software keyboard. Applied on top of measured keyboard overlap so
 * Gboard, suggestion rows, emoji/number keyboards, and either Android nav
 * mode keep a visible gap without per-device pixel hacks.
 */
export const COMPOSER_VISUAL_CLEARANCE = 12;

/**
 * Legacy KAV helpers kept for Susu AI and any remaining callers.
 * Circle group/private chat uses the floating dock instead.
 */
export function circleChatKeyboardBehavior(
  platformOS: string,
): 'padding' | 'height' | undefined {
  return platformOS === 'ios' ? 'padding' : undefined;
}

export function circleChatKeyboardVerticalOffset(_platformOS: string): number {
  return 0;
}

/**
 * How far to lift a bottom-docked floating composer so it sits just above
 * the keyboard. Uses window coordinates:
 * - containerBottomY = top + height of the chat root (measureInWindow)
 * - keyboardTopY = endCoordinates.screenY from the keyboard event
 *
 * Returns 0 when the keyboard is hidden or does not cover the container
 * (e.g. Android already resized the window so container bottom == keyboard top).
 */
export function floatingComposerBottomOffset(
  containerBottomY: number,
  keyboardTopY: number,
  keyboardHeight?: number,
  platformOS?: string,
): number {
  if (
    !Number.isFinite(containerBottomY) ||
    !Number.isFinite(keyboardTopY)
  ) {
    return 0;
  }

  if (platformOS === 'android' && keyboardHeight != null) {
    // If the container resized (adjustResize), its bottom is at or above the keyboard top.
    // We allow a small 24px threshold for rounding or status bar differences.
    if (containerBottomY <= keyboardTopY + 24) {
      return 0;
    }
    // Container did not shrink (e.g. edge-to-edge mode).
    // measureInWindow y+h on Android often excludes the navigation bar, causing the
    // computed difference to be too small. For full-screen containers, the overlap
    // is exactly the keyboard height.
    return keyboardHeight;
  }

  return Math.max(0, Math.round(containerBottomY - keyboardTopY));
}

/**
 * Extra bottom offset for the floating dock. Geometry stays in
 * floatingComposerBottomOffset; this only adds visual clearance while the
 * keyboard is showing (including Android adjustResize, where overlap is 0).
 */
export function floatingComposerDockOffset(
  keyboardOverlap: number,
  keyboardVisible: boolean,
): number {
  if (!keyboardVisible) {
    return 0;
  }
  return Math.max(0, keyboardOverlap) + COMPOSER_VISUAL_CLEARANCE;
}

/**
 * Bottom inset for the chat card/list so the last bubbles and the card
 * itself sit above the floating composer (+ keyboard lift when needed).
 */
export function floatingComposerListPadding(
  composerHeight: number,
  keyboardLift: number,
  visualClearance: number = COMPOSER_VISUAL_CLEARANCE,
): number {
  const safeComposer = Math.max(0, composerHeight);
  const safeLift = Math.max(0, keyboardLift);
  const safeClearance = Math.max(0, visualClearance);
  return safeComposer + safeLift + safeClearance;
}
