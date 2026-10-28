import {
  FIELD_TOP_MARGIN,
  KEYBOARD_FIELD_GAP,
  keyboardCoverage,
  scrollDeltaToRevealField,
  visibleBottom,
} from '@/lib/shared/keyboardScroll';

describe('keyboard field gap', () => {
  test('is within the requested 20-24 dp', () => {
    expect(KEYBOARD_FIELD_GAP).toBeGreaterThanOrEqual(20);
    expect(KEYBOARD_FIELD_GAP).toBeLessThanOrEqual(24);
  });
});

describe('keyboardCoverage', () => {
  test('is the overlap when the keyboard covers the view', () => {
    expect(keyboardCoverage(800, 560)).toBe(240);
  });
  test('is zero when the keyboard is hidden', () => {
    expect(keyboardCoverage(800, null)).toBe(0);
    expect(keyboardCoverage(800, undefined)).toBe(0);
  });
  test('is zero when the window already resized above the keyboard', () => {
    expect(keyboardCoverage(560, 560)).toBe(0);
    expect(keyboardCoverage(500, 560)).toBe(0);
  });
  test('ignores non-finite input', () => {
    expect(keyboardCoverage(Number.NaN, 560)).toBe(0);
  });
});

describe('visibleBottom', () => {
  test('uses the keyboard top when it is higher than the view bottom', () => {
    expect(visibleBottom(800, 560)).toBe(560);
  });
  test('uses the view bottom when the keyboard is hidden or lower', () => {
    expect(visibleBottom(800, null)).toBe(800);
    expect(visibleBottom(500, 560)).toBe(500);
  });
});

describe('scrollDeltaToRevealField', () => {
  const viewport = { viewportTop: 100, viewportBottom: 600 };

  test('scrolls so the field bottom clears the keyboard by the gap', () => {
    // The reported bug: field bottom flush with the keyboard (600).
    const delta = scrollDeltaToRevealField({ ...viewport, fieldTop: 480, fieldBottom: 600 });
    expect(delta).toBe(KEYBOARD_FIELD_GAP);
    // After scrolling, the field bottom sits exactly `gap` above the keyboard.
    expect(600 - delta + KEYBOARD_FIELD_GAP).toBe(600);
  });

  test('scrolls more when the field is partly under the keyboard', () => {
    expect(
      scrollDeltaToRevealField({ ...viewport, fieldTop: 540, fieldBottom: 660 }),
    ).toBe(660 + KEYBOARD_FIELD_GAP - 600);
  });

  test('does not scroll when the field already has the gap', () => {
    expect(
      scrollDeltaToRevealField({ ...viewport, fieldTop: 400, fieldBottom: 520 }),
    ).toBe(0);
    expect(
      scrollDeltaToRevealField({
        ...viewport,
        fieldTop: 400,
        fieldBottom: 600 - KEYBOARD_FIELD_GAP,
      }),
    ).toBe(0);
  });

  test('scrolls back when the field is above the visible area', () => {
    expect(
      scrollDeltaToRevealField({ ...viewport, fieldTop: 60, fieldBottom: 180 }),
    ).toBe(-(100 + FIELD_TOP_MARGIN - 60));
  });

  test('never pushes the field top out of view to satisfy the gap', () => {
    // A field taller than the room: only scroll until its top reaches the margin.
    const delta = scrollDeltaToRevealField({
      viewportTop: 100,
      viewportBottom: 220,
      fieldTop: 130,
      fieldBottom: 260,
    });
    expect(delta).toBe(130 - (100 + FIELD_TOP_MARGIN));
  });

  test('ignores non-finite input', () => {
    expect(
      scrollDeltaToRevealField({ ...viewport, fieldTop: Number.NaN, fieldBottom: 600 }),
    ).toBe(0);
  });
});
