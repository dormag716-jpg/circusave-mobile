/**
 * Rules for the floating assistant button. Pure, so they run in Jest.
 *
 * The button is the single way to open the assistant. It stays on screen (no
 * fade-away), can be dragged anywhere inside safe bounds, snaps to the nearest
 * side edge, and remembers where the user left it. Tapping it opens the bottom
 * sheet over the current screen.
 */

export const ASSISTANT_FAB_SIZE = 56;
/** Gap to the screen edges and to the status bar. */
export const ASSISTANT_FAB_MARGIN = 12;
/** Space kept clear at the bottom of the main tab screens (the tab bar). */
export const ASSISTANT_FAB_BOTTOM_RESERVE_TAB = 84;
/**
 * Space kept clear at the bottom of circle screens, which have no tab bar but do
 * have the chat composer and the payment and approval actions along the bottom.
 */
export const ASSISTANT_FAB_BOTTOM_RESERVE_CIRCLE = 148;

/**
 * Screens where the button may appear. It is an allow-list on purpose: forms,
 * payments, agreements, the Start review and sign-in must never have a button
 * floating over a field, a confirmation, or an irreversible action.
 */
const ALLOWED_PATHS = new Set([
  '/dashboard',
  '/circles',
  '/activity',
  '/settings',
  '/circle/workspace',
  '/circle/history',
]);

export function assistantFabAllowedForPath(pathname: string | null | undefined): boolean {
  const path = String(pathname || '').split('?')[0].replace(/\/+$/, '');
  return ALLOWED_PATHS.has(path);
}

export type AssistantFabInput = {
  authenticated: boolean;
  locked: boolean;
  lockReady: boolean;
  pathname: string | null | undefined;
  keyboardOpen: boolean;
  sheetOpen: boolean;
};

/** Whether the button may be drawn at all (before the fade-away timer is applied). */
export function assistantFabAvailable(input: AssistantFabInput): boolean {
  return (
    input.authenticated &&
    input.lockReady &&
    !input.locked &&
    !input.keyboardOpen &&
    !input.sheetOpen &&
    assistantFabAllowedForPath(input.pathname)
  );
}

/**
 * Which circle the assistant opens for. On a circle screen it is that circle.
 * Elsewhere, a single circle is used directly; with several (or none known) the
 * sheet asks the user to choose, so there is never a guess.
 */
export function assistantFabCircleId(input: {
  pathname: string | null | undefined;
  routeCircleId: string | null | undefined;
  circleIds: readonly string[];
}): string | null {
  const path = String(input.pathname || '').split('?')[0];
  const fromRoute = String(input.routeCircleId || '').trim();
  if (path.startsWith('/circle/') && fromRoute) return fromRoute;
  const ids = input.circleIds.map((id) => String(id || '').trim()).filter(Boolean);
  return ids.length === 1 ? ids[0] : null;
}

// ---------------------------------------------------------------------------
// Placement: where the button sits, kept inside bounds that clear the system
// bars, the tab bar and the composer area.
// ---------------------------------------------------------------------------

export type FabInsets = { top: number; bottom: number; left: number; right: number };

export type FabBounds = { minX: number; maxX: number; minY: number; maxY: number };

/** Saved position: which side edge and how far down the draggable range (0 top, 1 bottom). */
export type FabPlacement = { side: 'left' | 'right'; yFraction: number };

export const DEFAULT_ASSISTANT_FAB_PLACEMENT: FabPlacement = { side: 'right', yFraction: 1 };

const TAB_PATHS = new Set(['/dashboard', '/circles', '/activity', '/settings']);

export function assistantFabBottomReserve(pathname: string | null | undefined): number {
  const path = String(pathname || '').split('?')[0].replace(/\/+$/, '');
  return TAB_PATHS.has(path)
    ? ASSISTANT_FAB_BOTTOM_RESERVE_TAB
    : ASSISTANT_FAB_BOTTOM_RESERVE_CIRCLE;
}

export function assistantFabBounds(input: {
  width: number;
  height: number;
  insets: FabInsets;
  pathname: string | null | undefined;
}): FabBounds {
  const { width, height, insets } = input;
  const minX = insets.left + ASSISTANT_FAB_MARGIN;
  const maxX = Math.max(minX, width - insets.right - ASSISTANT_FAB_MARGIN - ASSISTANT_FAB_SIZE);
  const minY = insets.top + ASSISTANT_FAB_MARGIN;
  const maxY = Math.max(
    minY,
    height - insets.bottom - assistantFabBottomReserve(input.pathname) - ASSISTANT_FAB_SIZE,
  );
  return { minX, maxX, minY, maxY };
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

export function clampAssistantFab(
  point: { x: number; y: number },
  bounds: FabBounds,
): { x: number; y: number } {
  return {
    x: clamp(point.x, bounds.minX, bounds.maxX),
    y: clamp(point.y, bounds.minY, bounds.maxY),
  };
}

/** Pixel position for a saved placement inside the given bounds. */
export function assistantFabPosition(
  placement: FabPlacement,
  bounds: FabBounds,
): { x: number; y: number } {
  const fraction = clamp(
    Number.isFinite(placement.yFraction) ? placement.yFraction : 1,
    0,
    1,
  );
  return {
    x: placement.side === 'left' ? bounds.minX : bounds.maxX,
    y: bounds.minY + fraction * (bounds.maxY - bounds.minY),
  };
}

/** Where a dropped button ends up: clamped, then snapped to the nearer side edge. */
export function assistantFabPlacementFromDrop(
  point: { x: number; y: number },
  bounds: FabBounds,
): FabPlacement {
  const { x, y } = clampAssistantFab(point, bounds);
  const middle = (bounds.minX + bounds.maxX) / 2;
  const range = bounds.maxY - bounds.minY;
  return {
    side: x < middle ? 'left' : 'right',
    yFraction: range > 0 ? clamp((y - bounds.minY) / range, 0, 1) : 1,
  };
}

/** Reads a stored placement; anything malformed falls back to the default. */
export function parseAssistantFabPlacement(raw: string | null | undefined): FabPlacement {
  try {
    const value = JSON.parse(String(raw ?? ''));
    const side = value?.side === 'left' ? 'left' : value?.side === 'right' ? 'right' : null;
    const y = Number(value?.yFraction);
    if (side && Number.isFinite(y)) {
      return { side, yFraction: clamp(y, 0, 1) };
    }
  } catch {
    // fall through
  }
  return DEFAULT_ASSISTANT_FAB_PLACEMENT;
}
