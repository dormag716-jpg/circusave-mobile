import {
  COMPOSER_VISUAL_CLEARANCE,
  FLOATING_COMPOSER_RESTING_HEIGHT,
  circleChatKeyboardBehavior,
  circleChatKeyboardVerticalOffset,
  floatingComposerBottomOffset,
  floatingComposerDockOffset,
  floatingComposerListPadding,
} from '@/lib/chatKeyboard';

describe('circleChatKeyboard', () => {
  test('uses padding avoidance on iOS only (legacy KAV)', () => {
    expect(circleChatKeyboardBehavior('ios')).toBe('padding');
    expect(circleChatKeyboardBehavior('android')).toBeUndefined();
  });

  test('does not add a large fixed vertical offset', () => {
    expect(circleChatKeyboardVerticalOffset('ios')).toBe(0);
    expect(circleChatKeyboardVerticalOffset('android')).toBe(0);
  });
});

describe('floatingComposerBottomOffset', () => {
  test('lifts by the overlap between container bottom and keyboard top', () => {
    // Container bottom at 800, keyboard top at 500 → lift 300
    expect(floatingComposerBottomOffset(800, 500)).toBe(300);
  });

  test('returns 0 when keyboard does not cover the container', () => {
    // Already resized: container bottom equals keyboard top
    expect(floatingComposerBottomOffset(500, 500)).toBe(0);
    expect(floatingComposerBottomOffset(480, 500)).toBe(0);
  });

  test('returns 0 for non-finite values', () => {
    expect(floatingComposerBottomOffset(NaN, 500)).toBe(0);
    expect(floatingComposerBottomOffset(800, Infinity)).toBe(0);
  });

  test('on Android returns 0 when adjustResize already lifted the container', () => {
    expect(floatingComposerBottomOffset(500, 500, 300, 'android')).toBe(0);
    expect(floatingComposerBottomOffset(510, 500, 300, 'android')).toBe(0);
  });

  test('on Android uses keyboard height when the window did not resize', () => {
    expect(floatingComposerBottomOffset(800, 500, 300, 'android')).toBe(300);
  });

  test('ignores the Android height shortcut on iOS', () => {
    expect(floatingComposerBottomOffset(800, 500, 300, 'ios')).toBe(300);
    expect(floatingComposerBottomOffset(800, 520, 300, 'ios')).toBe(280);
  });
});

describe('composer visual clearance', () => {
  test('preserves a resting gap between the chat card and composer', () => {
    expect(COMPOSER_VISUAL_CLEARANCE).toBeGreaterThan(0);
    expect(floatingComposerDockOffset(0, false)).toBe(0);
    expect(
      floatingComposerListPadding(FLOATING_COMPOSER_RESTING_HEIGHT, 0),
    ).toBe(FLOATING_COMPOSER_RESTING_HEIGHT + COMPOSER_VISUAL_CLEARANCE);
  });

  test('reserves enough card/list space so the last message is not under the composer', () => {
    const composerHeight = 80;
    const reserved = floatingComposerListPadding(composerHeight, 0);
    expect(reserved).toBe(composerHeight + COMPOSER_VISUAL_CLEARANCE);
    expect(reserved).toBeGreaterThan(composerHeight);

    const keyboardOpenNoResize = floatingComposerListPadding(
      composerHeight,
      floatingComposerDockOffset(300, true),
    );
    expect(keyboardOpenNoResize).toBe(
      composerHeight + 300 + COMPOSER_VISUAL_CLEARANCE * 2,
    );
  });

  test('Android keyboard lift includes the visual clearance on both resize branches', () => {
    const resized = floatingComposerBottomOffset(500, 500, 300, 'android');
    const uncovered = floatingComposerBottomOffset(800, 500, 300, 'android');
    expect(resized).toBe(0);
    expect(uncovered).toBe(300);
    expect(floatingComposerDockOffset(resized, true)).toBe(
      COMPOSER_VISUAL_CLEARANCE,
    );
    expect(floatingComposerDockOffset(uncovered, true)).toBe(
      300 + COMPOSER_VISUAL_CLEARANCE,
    );
  });
});

describe('floatingComposerListPadding', () => {
  test('reserves space for composer, keyboard lift, and visual clearance', () => {
    expect(floatingComposerListPadding(72, 300)).toBe(
      372 + COMPOSER_VISUAL_CLEARANCE,
    );
    expect(floatingComposerListPadding(FLOATING_COMPOSER_RESTING_HEIGHT, 0)).toBe(
      FLOATING_COMPOSER_RESTING_HEIGHT + COMPOSER_VISUAL_CLEARANCE,
    );
  });

  test('never returns negative padding', () => {
    expect(floatingComposerListPadding(-10, -20)).toBe(COMPOSER_VISUAL_CLEARANCE);
    expect(floatingComposerListPadding(-10, -20, 0)).toBe(0);
  });
});
