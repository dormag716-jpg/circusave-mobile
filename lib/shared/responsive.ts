/**
 * Layout metrics for screens that must work from a 320 dp phone to a tablet.
 * Pure, so it runs in Jest. `useLayoutMetrics` feeds it the live window size.
 *
 * Sizes are density-independent pixels (what `useWindowDimensions` reports),
 * never physical pixels or the emulator window size.
 */

/** Windows this short (or shorter) are treated as compact in height. */
export const COMPACT_HEIGHT_MAX = 700;
/** Windows narrower than this are treated as narrow. */
export const NARROW_WIDTH_MAX = 360;
/** From this width up the screen is a tablet or a large foldable. */
export const WIDE_WIDTH_MIN = 600;
/** System font scale at which side-by-side rows stop fitting. */
export const LARGE_TEXT_SCALE = 1.3;

/** Comfortable reading widths for centred content on large screens. */
export const FORM_MAX_WIDTH = 480;
export const CONTENT_MAX_WIDTH = 640;

export type LayoutMetrics = {
  width: number;
  height: number;
  fontScale: number;
  /** Short window: trim decoration and vertical gaps. */
  compactHeight: boolean;
  /** Narrow window: smaller side gutters, stack what no longer fits. */
  narrow: boolean;
  /** Tablet or large foldable: cap widths and centre content. */
  wide: boolean;
  /** The user enabled large system text. */
  largeText: boolean;
  /** Either dimension is tight. */
  compact: boolean;
  /** Put side-by-side items on separate lines. */
  stackRow: boolean;
  /** Left and right screen padding. */
  gutter: number;
};

export function getLayoutMetrics(input: {
  width: number;
  height: number;
  fontScale?: number;
}): LayoutMetrics {
  const width = Number.isFinite(input.width) ? input.width : 360;
  const height = Number.isFinite(input.height) ? input.height : 800;
  const fontScale =
    input.fontScale && Number.isFinite(input.fontScale) && input.fontScale > 0
      ? input.fontScale
      : 1;

  const compactHeight = height <= COMPACT_HEIGHT_MAX;
  const narrow = width < NARROW_WIDTH_MAX;
  const wide = width >= WIDE_WIDTH_MIN;
  const largeText = fontScale >= LARGE_TEXT_SCALE;

  return {
    width,
    height,
    fontScale,
    compactHeight,
    narrow,
    wide,
    largeText,
    compact: compactHeight || narrow,
    stackRow: narrow || largeText,
    gutter: narrow ? 16 : 20,
  };
}
