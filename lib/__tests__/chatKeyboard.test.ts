import {
  circleChatKeyboardBehavior,
  circleChatKeyboardVerticalOffset,
} from '@/lib/chatKeyboard';

describe('circleChatKeyboard', () => {
  test('uses padding avoidance on iOS only', () => {
    expect(circleChatKeyboardBehavior('ios')).toBe('padding');
    expect(circleChatKeyboardBehavior('android')).toBeUndefined();
  });

  test('does not add a large fixed vertical offset', () => {
    expect(circleChatKeyboardVerticalOffset('ios')).toBe(0);
    expect(circleChatKeyboardVerticalOffset('android')).toBe(0);
  });
});
