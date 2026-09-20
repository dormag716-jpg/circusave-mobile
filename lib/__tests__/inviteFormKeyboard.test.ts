import { readFileSync } from 'fs';
import path from 'path';

import {
  inviteFieldScrollY,
  inviteFormCanRevealFieldAndButton,
  inviteFormKeyboardBehavior,
  inviteFormKeyboardDismissMode,
  inviteFormScrollPadding,
  inviteFormUsableHeight,
  INVITE_FORM_BUTTON_RESERVE,
  INVITE_FORM_KEYBOARD_RESERVE,
} from '../inviteFormKeyboard';

const root = path.join(__dirname, '..', '..');

describe('invite form keyboard avoidance', () => {
  test('Android resizes the window and iOS pads', () => {
    expect(inviteFormKeyboardBehavior('ios')).toBe('padding');
    expect(inviteFormKeyboardBehavior('android')).toBe('height');
  });

  test('drag dismisses the keyboard; iOS can interactively follow the drag', () => {
    expect(inviteFormKeyboardDismissMode('ios')).toBe('interactive');
    expect(inviteFormKeyboardDismissMode('android')).toBe('on-drag');
  });

  test('bottom padding covers the Add planned hand button and safe area', () => {
    expect(inviteFormScrollPadding(0)).toBe(INVITE_FORM_KEYBOARD_RESERVE);
    expect(inviteFormScrollPadding(34)).toBe(INVITE_FORM_KEYBOARD_RESERVE + 34);
    expect(inviteFormScrollPadding(34)).toBeGreaterThan(INVITE_FORM_BUTTON_RESERVE);
  });

  test('focused field scroll offset stays at or above the field', () => {
    expect(inviteFieldScrollY(400)).toBe(380);
    expect(inviteFieldScrollY(10)).toBe(0);
  });

  test('small Android screens still have room for each input and the Add button', () => {
    const smallPhone = 640;
    const keyboard = 280;
    const usable = inviteFormUsableHeight(smallPhone, keyboard);
    expect(usable).toBe(360);
    expect(inviteFormCanRevealFieldAndButton(usable, 50)).toBe(true);
    expect(inviteFormCanRevealFieldAndButton(usable, 50)).toBe(true);
    expect(inviteFormCanRevealFieldAndButton(usable, 50)).toBe(true);
  });

  test('app.json uses Android softwareKeyboardLayoutMode resize', () => {
    const appConfig = JSON.parse(
      readFileSync(path.join(root, 'app.json'), 'utf8'),
    ) as { expo: { android: { softwareKeyboardLayoutMode?: string } } };
    expect(appConfig.expo.android.softwareKeyboardLayoutMode).toBe('resize');
  });

  test('invite screen wires KeyboardAvoidingView, ScrollView, and dismiss-after-submit', () => {
    const source = readFileSync(
      path.join(root, 'app', 'circle', 'invite.tsx'),
      'utf8',
    );
    expect(source).toContain('KeyboardAvoidingView');
    expect(source).toContain('inviteFormKeyboardBehavior');
    expect(source).toContain('keyboardShouldPersistTaps="handled"');
    expect(source).toContain('keyboardDismissMode');
    expect(source).toContain('inviteFormKeyboardDismissMode');
    expect(source).toContain('Keyboard.dismiss()');
    expect(source).toContain('scrollToFocusedField');
    expect(source).not.toContain("keyboardShouldPersistTaps=\"always\"");
  });
});
