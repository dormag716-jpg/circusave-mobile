import {
  ASSISTANT_FAB_BOTTOM_RESERVE_CIRCLE,
  ASSISTANT_FAB_BOTTOM_RESERVE_TAB,
  ASSISTANT_FAB_MARGIN,
  ASSISTANT_FAB_SIZE,
  DEFAULT_ASSISTANT_FAB_PLACEMENT,
  assistantFabAllowedForPath,
  assistantFabAvailable,
  assistantFabBottomReserve,
  assistantFabBounds,
  assistantFabCircleId,
  assistantFabPlacementFromDrop,
  assistantFabPosition,
  clampAssistantFab,
  parseAssistantFabPlacement,
  type AssistantFabInput,
} from '../assistantFab';

const ready: AssistantFabInput = {
  authenticated: true,
  locked: false,
  lockReady: true,
  pathname: '/dashboard',
  keyboardOpen: false,
  sheetOpen: false,
};

describe('assistant floating button: where it may appear', () => {
  it('appears on the main screens and the circle workspace', () => {
    for (const path of [
      '/dashboard',
      '/circles',
      '/activity',
      '/settings',
      '/circle/workspace',
      '/circle/workspace/',
      '/circle/workspace?circleId=c1&tab=people',
      '/circle/history',
    ]) {
      expect(assistantFabAllowedForPath(path)).toBe(true);
    }
  });

  it('never floats over forms, payments, agreements, the Start review, or sign-in', () => {
    for (const path of [
      '/login',
      '/create-account',
      '/',
      '/circle/agreement-review',
      '/circle/payment-setup',
      '/circle/additional-hand',
      '/circle/invite',
      '/circle/assistant',
      '/payment/contribution',
      '/create-circle/setup',
      '/join-circle',
      '/subscription',
      '/security',
      '/legal/terms',
      null,
      undefined,
      '',
    ]) {
      expect(assistantFabAllowedForPath(path as string | null)).toBe(false);
    }
  });
});

describe('assistant floating button: availability', () => {
  it('is available when signed in, unlocked, and nothing else is in the way', () => {
    expect(assistantFabAvailable(ready)).toBe(true);
  });

  it('is unavailable when signed out, locked, or the lock state is not ready', () => {
    expect(assistantFabAvailable({ ...ready, authenticated: false })).toBe(false);
    expect(assistantFabAvailable({ ...ready, locked: true })).toBe(false);
    expect(assistantFabAvailable({ ...ready, lockReady: false })).toBe(false);
  });

  it('steps aside for the keyboard and for the open sheet', () => {
    expect(assistantFabAvailable({ ...ready, keyboardOpen: true })).toBe(false);
    expect(assistantFabAvailable({ ...ready, sheetOpen: true })).toBe(false);
  });
});

describe('assistant floating button: which circle opens', () => {
  it('uses the circle on a circle screen', () => {
    expect(
      assistantFabCircleId({
        pathname: '/circle/workspace',
        routeCircleId: 'c2',
        circleIds: ['c1', 'c2', 'c3'],
      }),
    ).toBe('c2');
  });

  it('uses the only circle elsewhere', () => {
    expect(
      assistantFabCircleId({ pathname: '/dashboard', routeCircleId: null, circleIds: ['c1'] }),
    ).toBe('c1');
  });

  it('asks the user to choose when there are several or none, instead of guessing', () => {
    expect(
      assistantFabCircleId({ pathname: '/dashboard', routeCircleId: null, circleIds: ['c1', 'c2'] }),
    ).toBeNull();
    expect(
      assistantFabCircleId({ pathname: '/dashboard', routeCircleId: null, circleIds: [] }),
    ).toBeNull();
  });

  it('ignores a stray circleId parameter on a non-circle screen', () => {
    expect(
      assistantFabCircleId({
        pathname: '/dashboard',
        routeCircleId: 'stale',
        circleIds: ['c1', 'c2'],
      }),
    ).toBeNull();
  });
});

const insets = { top: 24, bottom: 24, left: 0, right: 0 };
const phone = { width: 360, height: 800, insets };

describe('assistant floating button: bounds', () => {
  it('keeps the tab bar clear on the main screens', () => {
    const b = assistantFabBounds({ ...phone, pathname: '/dashboard' });
    expect(b.maxY + ASSISTANT_FAB_SIZE).toBe(
      800 - insets.bottom - ASSISTANT_FAB_BOTTOM_RESERVE_TAB,
    );
    expect(b.minY).toBe(insets.top + ASSISTANT_FAB_MARGIN);
  });

  it('keeps more room clear on circle screens for the composer and actions', () => {
    expect(assistantFabBottomReserve('/circle/workspace')).toBe(
      ASSISTANT_FAB_BOTTOM_RESERVE_CIRCLE,
    );
    expect(ASSISTANT_FAB_BOTTOM_RESERVE_CIRCLE).toBeGreaterThan(ASSISTANT_FAB_BOTTOM_RESERVE_TAB);
    const b = assistantFabBounds({ ...phone, pathname: '/circle/workspace?circleId=c1' });
    expect(b.maxY + ASSISTANT_FAB_SIZE).toBe(
      800 - insets.bottom - ASSISTANT_FAB_BOTTOM_RESERVE_CIRCLE,
    );
  });

  it('keeps the button inside the side margins', () => {
    const b = assistantFabBounds({ ...phone, pathname: '/dashboard' });
    expect(b.minX).toBe(ASSISTANT_FAB_MARGIN);
    expect(b.maxX + ASSISTANT_FAB_SIZE + ASSISTANT_FAB_MARGIN).toBe(360);
  });

  it('never produces an inverted range on a very small window', () => {
    const b = assistantFabBounds({
      width: 80,
      height: 200,
      insets,
      pathname: '/circle/workspace',
    });
    expect(b.maxX).toBeGreaterThanOrEqual(b.minX);
    expect(b.maxY).toBeGreaterThanOrEqual(b.minY);
  });
});

describe('assistant floating button: dragging', () => {
  const bounds = assistantFabBounds({ ...phone, pathname: '/dashboard' });

  it('clamps a drag to the bounds', () => {
    expect(clampAssistantFab({ x: -50, y: -50 }, bounds)).toEqual({
      x: bounds.minX,
      y: bounds.minY,
    });
    expect(clampAssistantFab({ x: 9999, y: 9999 }, bounds)).toEqual({
      x: bounds.maxX,
      y: bounds.maxY,
    });
  });

  it('snaps to the nearer side edge and keeps the height', () => {
    const mid = (bounds.minY + bounds.maxY) / 2;
    const left = assistantFabPlacementFromDrop({ x: 40, y: mid }, bounds);
    const right = assistantFabPlacementFromDrop({ x: 280, y: mid }, bounds);
    expect(left.side).toBe('left');
    expect(right.side).toBe('right');
    expect(left.yFraction).toBeCloseTo(0.5, 2);
    const p = assistantFabPosition(left, bounds);
    expect(p.x).toBe(bounds.minX);
    expect(p.y).toBeCloseTo(mid, 1);
  });

  it('cannot be dropped below the reserved bottom area', () => {
    const dropped = assistantFabPlacementFromDrop({ x: 300, y: 790 }, bounds);
    expect(assistantFabPosition(dropped, bounds).y).toBe(bounds.maxY);
  });

  it('carries the saved height between screens with different bottom reserves', () => {
    const tab = assistantFabBounds({ ...phone, pathname: '/dashboard' });
    const circle = assistantFabBounds({ ...phone, pathname: '/circle/workspace' });
    const placement = { side: 'right' as const, yFraction: 1 };
    expect(assistantFabPosition(placement, tab).y).toBe(tab.maxY);
    expect(assistantFabPosition(placement, circle).y).toBe(circle.maxY);
    expect(circle.maxY).toBeLessThan(tab.maxY);
  });
});

describe('assistant floating button: saved place', () => {
  it('defaults to the right edge at the bottom of the range', () => {
    expect(DEFAULT_ASSISTANT_FAB_PLACEMENT).toEqual({ side: 'right', yFraction: 1 });
  });

  it('round-trips a saved placement', () => {
    const saved = JSON.stringify({ side: 'left', yFraction: 0.25 });
    expect(parseAssistantFabPlacement(saved)).toEqual({ side: 'left', yFraction: 0.25 });
  });

  it('falls back to the default for missing or malformed values and clamps the height', () => {
    for (const raw of [null, undefined, '', 'not json', '{"side":"top","yFraction":0.2}', '{"side":"left"}']) {
      expect(parseAssistantFabPlacement(raw as string | null)).toEqual(
        DEFAULT_ASSISTANT_FAB_PLACEMENT,
      );
    }
    expect(parseAssistantFabPlacement('{"side":"right","yFraction":7}').yFraction).toBe(1);
    expect(parseAssistantFabPlacement('{"side":"right","yFraction":-3}').yFraction).toBe(0);
  });
});
