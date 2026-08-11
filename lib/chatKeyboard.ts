/**
 * Circle chat lives in a flex column (not a nested ScrollView).
 * - Android: window already resizes (app.json softwareKeyboardLayoutMode=resize);
 *   adding KeyboardAvoidingView padding doubles the gap.
 * - iOS: use padding so the composer lifts above the keyboard.
 *
 * Pure helpers (no react-native import) for unit tests.
 */
export function circleChatKeyboardBehavior(
  platformOS: string,
): 'padding' | 'height' | undefined {
  return platformOS === 'ios' ? 'padding' : undefined;
}

/**
 * Vertical offset for KeyboardAvoidingView when the chat surface already
 * accounts for top chrome (workspace header/tabs sit outside the avoiding view).
 */
export function circleChatKeyboardVerticalOffset(_platformOS: string): number {
  // Previous ChatInput used keyboardVerticalOffset={100}, which created large
  // blank gaps once chat was correctly laid out in a flex column.
  return 0;
}
