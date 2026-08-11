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
): number {
  if (
    !Number.isFinite(containerBottomY) ||
    !Number.isFinite(keyboardTopY)
  ) {
    return 0;
  }
  return Math.max(0, Math.round(containerBottomY - keyboardTopY));
}

/**
 * Bottom padding for the message list so the last bubbles clear the
 * floating composer (+ optional keyboard lift when the list does not resize).
 */
export function floatingComposerListPadding(
  composerHeight: number,
  keyboardLift: number,
): number {
  const safeComposer = Math.max(0, composerHeight);
  const safeLift = Math.max(0, keyboardLift);
  return safeComposer + safeLift;
}
