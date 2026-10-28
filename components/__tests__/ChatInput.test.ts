import { readFileSync } from 'fs';
import path from 'path';

describe('ChatInput text layout', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'ChatInput.tsx'),
    'utf8',
  );

  test('keeps multiline text aligned and padded without clipping', () => {
    expect(source).toContain('textAlignVertical="top"');
    expect(source).toContain('scrollEnabled');
    expect(source).toContain('lineHeight: 22');
    expect(source).toContain('paddingTop: 10');
    expect(source).toContain('paddingBottom: 10');
    expect(source).toContain('minWidth: 0');
  });

  test('commits Android IME text before sending the draft', () => {
    expect(source).toContain("const draftRef = useRef('')");
    expect(source).toContain('sendAfterEndEditingRef.current = true');
    expect(source).toContain('inputRef.current?.blur()');
    expect(source).toContain('const committedText = event.nativeEvent.text');
    expect(source).toContain('void sendDraft(committedText)');
    expect(source).toContain('requestAnimationFrame(() => inputRef.current?.focus())');
  });

  test('sends and clears the exact committed draft', () => {
    expect(source).toContain('await onSend(draft)');
    expect(source).toContain('draftRef.current = next');
  });
});
