import {
  shouldShowActivityListError,
  shouldUseSilentActivityRefresh,
} from '../activityPaint';
import { shouldShowBlockingLoadState } from '../requestGeneration';

describe('activity list paint', () => {
  it('uses a silent refresh once a snapshot is already on screen', () => {
    expect(shouldUseSilentActivityRefresh(true)).toBe(true);
    expect(shouldUseSilentActivityRefresh(false)).toBe(false);
  });

  it('does not block the feed with a spinner after a snapshot exists', () => {
    expect(shouldShowBlockingLoadState(true, false)).toBe(true);
    expect(shouldShowBlockingLoadState(true, true)).toBe(false);
  });

  it('shows a list error banner only when rows are already visible', () => {
    expect(
      shouldShowActivityListError({ error: 'load failed', entryCount: 3 }),
    ).toBe(true);
    expect(
      shouldShowActivityListError({ error: 'load failed', entryCount: 0 }),
    ).toBe(false);
    expect(shouldShowActivityListError({ error: null, entryCount: 3 })).toBe(
      false,
    );
  });
});
