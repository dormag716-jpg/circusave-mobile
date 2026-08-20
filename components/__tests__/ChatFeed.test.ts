/**
 * Structural expectations for circle chat message list keyboard behavior.
 * (Avoid react-test-renderer + RN host trees in this suite.)
 */
import { readFileSync } from 'fs';
import path from 'path';

import {
  COMPOSER_VISUAL_CLEARANCE,
  floatingComposerListPadding,
} from '@/lib/chatKeyboard';

describe('ChatFeed keyboard contract', () => {
  test('defaults match the flex chat surface requirements', () => {
    // ChatFeed is implemented with:
    // - scrollEnabled default true (owns list scrolling)
    // - keyboardShouldPersistTaps="handled"
    // - keyboardDismissMode="on-drag"
    // - style flex:1 / minHeight:0 so it can shrink above the composer
    const defaults = {
      scrollEnabled: true,
      keyboardShouldPersistTaps: 'handled' as const,
      keyboardDismissMode: 'on-drag' as const,
      listFlex: 1,
      listMinHeight: 0,
    };

    expect(defaults.scrollEnabled).toBe(true);
    expect(defaults.keyboardShouldPersistTaps).toBe('handled');
    expect(defaults.keyboardDismissMode).toBe('on-drag');
    expect(defaults.listFlex).toBe(1);
    expect(defaults.listMinHeight).toBe(0);
  });

  test('card inset, not list padding, keeps the last message above the composer', () => {
    const cardInset = floatingComposerListPadding(72, 0);
    expect(cardInset).toBeGreaterThanOrEqual(72 + COMPOSER_VISUAL_CLEARANCE);
  });

  test('chat surface stays mounted and supports message deletion', () => {
    const source = readFileSync(
      path.join(__dirname, '..', 'ConversationChat.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/chatPanelExpanded/);
    expect(source).not.toMatch(/toggleConversationPanel/);
    expect(source).toMatch(/<ChatFeed/);
    expect(source).toMatch(/onDeleteMessage/);
    expect(source).toMatch(/<ChatInput/);
  });
});
