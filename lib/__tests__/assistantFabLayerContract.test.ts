import { readFileSync } from 'fs';
import path from 'path';

const source = readFileSync(
  path.join(__dirname, '..', '..', 'components', 'AssistantFabLayer.tsx'),
  'utf8',
);

describe('assistant floating button component contract', () => {
  it('stays visible: no fade-away timer and no screen-wide double-tap handler', () => {
    expect(source).not.toMatch(/setTimeout/);
    expect(source).not.toMatch(/Gesture\.Tap\(/);
    expect(source).not.toMatch(/numberOfTaps/);
    expect(source).not.toMatch(/Animated\.timing/);
  });

  it('is draggable and snaps within the computed safe bounds', () => {
    expect(source).toMatch(/Gesture\.Pan\(\)/);
    expect(source).toMatch(/assistantFabBounds\(/);
    expect(source).toMatch(/assistantFabPlacementFromDrop\(/);
  });

  it('puts the gesture on the button only, not around the whole app', () => {
    const detectors = source.match(/<GestureDetector\b/g) || [];
    expect(detectors).toHaveLength(1);
    expect(source).toMatch(/<GestureDetector gesture=\{pan\}>\s*<Animated\.View style=\{\[styles\.fabHost/);
  });

  it('remembers where the user left it', () => {
    expect(source).toMatch(/AsyncStorage\.getItem\(STORAGE_KEY\)/);
    expect(source).toMatch(/AsyncStorage\.setItem\(STORAGE_KEY/);
  });

  it('steps aside for the keyboard, the open sheet and the lock', () => {
    expect(source).toMatch(/keyboardOpen/);
    expect(source).toMatch(/sheetOpen: isOpen/);
    expect(source).toMatch(/locked: isLocked/);
  });
});
