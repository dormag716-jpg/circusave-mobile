/**
 * Workspace chrome visibility while Chat is open.
 * One keyboard-visible flag owns header/tab collapse. Chrome stays mounted.
 */

export function isSoftwareKeyboardVisible(
  height?: number | null,
): boolean {
  return typeof height === 'number' && Number.isFinite(height) && height > 0;
}

/** Workspace header/tabs are never destroyed for keyboard geometry. */
export function shouldMountWorkspaceChrome(): true {
  return true;
}

export function isWorkspaceChromeCollapsed(keyboardVisible: boolean): boolean {
  return keyboardVisible === true;
}

export function workspaceChromeLayoutStyle(collapsed: boolean): {
  display: 'none' | 'flex';
} {
  return { display: collapsed ? 'none' : 'flex' };
}

/**
 * Composer geometry still uses keyboard metrics.
 * A 0-height frame is a hide, not a show.
 */
export function shouldApplyKeyboardGeometry(height?: number | null): boolean {
  return isSoftwareKeyboardVisible(height);
}
