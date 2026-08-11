import {
  FLOATING_COMPOSER_RESTING_HEIGHT,
  circleChatKeyboardBehavior,
  circleChatKeyboardVerticalOffset,
  floatingComposerBottomOffset,
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
});

describe('floatingComposerListPadding', () => {
  test('reserves space for composer plus keyboard lift', () => {
    expect(floatingComposerListPadding(72, 300)).toBe(372);
    expect(floatingComposerListPadding(FLOATING_COMPOSER_RESTING_HEIGHT, 0)).toBe(
      FLOATING_COMPOSER_RESTING_HEIGHT,
    );
  });

  test('never returns negative padding', () => {
    expect(floatingComposerListPadding(-10, -20)).toBe(0);
  });
});
