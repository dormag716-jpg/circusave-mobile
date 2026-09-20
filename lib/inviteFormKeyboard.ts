/**
 * Keyboard helpers for the organizer invite/add-member form.
 * Pure — no react-native import so Jest can cover small-screen geometry.
 */

export const INVITE_FORM_FIELD_GAP = 20;
export const INVITE_FORM_BUTTON_RESERVE = 72;
export const INVITE_FORM_KEYBOARD_RESERVE = 160;

export function inviteFormKeyboardBehavior(
  platformOS: string,
): 'padding' | 'height' {
  return platformOS === 'ios' ? 'padding' : 'height';
}

export function inviteFormKeyboardDismissMode(
  platformOS: string,
): 'interactive' | 'on-drag' {
  return platformOS === 'ios' ? 'interactive' : 'on-drag';
}

/** Bottom content padding so the last field and Add button can scroll above the keyboard. */
export function inviteFormScrollPadding(safeAreaBottom = 0): number {
  return Math.max(0, safeAreaBottom) + INVITE_FORM_KEYBOARD_RESERVE;
}

/**
 * Content offset that places a focused field above the keyboard, with room
 * for the Add planned hand button beneath it on small screens.
 */
export function inviteFieldScrollY(fieldY: number, fieldHeight = 50): number {
  if (!Number.isFinite(fieldY)) return 0;
  return Math.max(0, Math.round(fieldY - INVITE_FORM_FIELD_GAP));
}

/**
 * Fabric-safe scroll offset from window coordinates.
 * Avoids measureLayout, which requires a native-component relative node.
 */
export function inviteFieldScrollOffsetFromWindow(input: {
  fieldWindowY: number;
  scrollWindowY: number;
  currentScrollY: number;
}): number {
  if (
    !Number.isFinite(input.fieldWindowY) ||
    !Number.isFinite(input.scrollWindowY) ||
    !Number.isFinite(input.currentScrollY)
  ) {
    return 0;
  }
  const delta = input.fieldWindowY - input.scrollWindowY - INVITE_FORM_FIELD_GAP;
  return Math.max(0, Math.round(input.currentScrollY + delta));
}

/** Visible area after Android window resize; used to assert small-screen clearance. */
export function inviteFormUsableHeight(
  windowHeight: number,
  keyboardHeight: number,
): number {
  return Math.max(0, windowHeight - Math.max(0, keyboardHeight));
}

export function inviteFormCanRevealFieldAndButton(
  usableHeight: number,
  fieldHeight = 50,
): boolean {
  const needed =
    INVITE_FORM_FIELD_GAP +
    fieldHeight +
    INVITE_FORM_BUTTON_RESERVE +
    INVITE_FORM_FIELD_GAP;
  return usableHeight >= needed && inviteFormScrollPadding(0) >= INVITE_FORM_BUTTON_RESERVE;
}
