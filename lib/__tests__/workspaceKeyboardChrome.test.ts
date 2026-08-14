import { readFileSync } from 'fs';
import path from 'path';

import {
  COMPOSER_VISUAL_CLEARANCE,
  floatingComposerBottomOffset,
  floatingComposerDockOffset,
  FLOATING_COMPOSER_RESTING_HEIGHT,
  floatingComposerListPadding,
} from '../chatKeyboard';
import {
  isSoftwareKeyboardVisible,
  isWorkspaceChromeCollapsed,
  shouldApplyKeyboardGeometry,
  shouldMountWorkspaceChrome,
  workspaceChromeLayoutStyle,
} from '../workspaceKeyboardChrome';

describe('workspace keyboard chrome ownership', () => {
  it('keeps header/tab visibility on one keyboard-visible flag', () => {
    expect(isWorkspaceChromeCollapsed(false)).toBe(false);
    expect(isWorkspaceChromeCollapsed(true)).toBe(true);
    expect(workspaceChromeLayoutStyle(true)).toEqual({ display: 'none' });
    expect(workspaceChromeLayoutStyle(false)).toEqual({ display: 'flex' });
  });

  it('does not destroy workspace chrome state when the keyboard appears', () => {
    expect(shouldMountWorkspaceChrome()).toBe(true);
    expect(workspaceChromeLayoutStyle(true).display).toBe('none');
  });

  it('restores chrome on hide without a remount-reset', () => {
    const hidden = workspaceChromeLayoutStyle(true);
    const shown = workspaceChromeLayoutStyle(false);
    expect(shouldMountWorkspaceChrome()).toBe(true);
    expect(hidden).not.toEqual(shown);
    expect(shown).toEqual({ display: 'flex' });
    expect(isSoftwareKeyboardVisible(0)).toBe(false);
    expect(shouldApplyKeyboardGeometry(0)).toBe(false);
    expect(isSoftwareKeyboardVisible(280)).toBe(true);
  });

  it('keeps the Susu header mounted and uses shared composer clearance', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'app', 'circle', 'assistant.tsx'),
      'utf8',
    );
    expect(source).toMatch(/workspaceChromeLayoutStyle\(keyboardVisible\)/);
    expect(source).toMatch(/floatingComposerDockOffset/);
    expect(source).toMatch(/shouldApplyKeyboardGeometry/);
    expect(source).not.toMatch(/!keyboardVisible \?/);
  });
});

describe('composer geometry remains unchanged', () => {
  it('keeps the iOS overlap lift', () => {
    expect(floatingComposerBottomOffset(800, 500)).toBe(300);
    expect(floatingComposerBottomOffset(500, 500)).toBe(0);
  });

  it('keeps Android adjustResize and no-resize branches', () => {
    expect(floatingComposerBottomOffset(500, 500, 300, 'android')).toBe(0);
    expect(floatingComposerBottomOffset(510, 500, 300, 'android')).toBe(0);
    expect(floatingComposerBottomOffset(800, 500, 300, 'android')).toBe(300);
  });

  it('still reserves list space from composer height plus lift and clearance', () => {
    expect(
      floatingComposerListPadding(FLOATING_COMPOSER_RESTING_HEIGHT, 0),
    ).toBe(FLOATING_COMPOSER_RESTING_HEIGHT + COMPOSER_VISUAL_CLEARANCE);
    expect(floatingComposerListPadding(72, 300)).toBe(
      372 + COMPOSER_VISUAL_CLEARANCE,
    );
    expect(floatingComposerDockOffset(0, true)).toBe(COMPOSER_VISUAL_CLEARANCE);
  });
});
