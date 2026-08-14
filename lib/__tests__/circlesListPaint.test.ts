import {
  CIRCLES_LIST_DETAIL_LIMIT,
  mergeRetainedCircleDetails,
  selectCircleDetailTargets,
  shouldUseSilentCirclesRefresh,
} from '../circlesListPaint';

describe('circles list paint', () => {
  it('uses a silent refresh once a snapshot is already on screen', () => {
    expect(shouldUseSilentCirclesRefresh(true)).toBe(true);
    expect(shouldUseSilentCirclesRefresh(false)).toBe(false);
  });

  it('caps detail fetches and prefers setup then active over paused or closed', () => {
    const summaries = [
      { id: 'closed-1', status: 'closed' },
      { id: 'active-1', status: 'active' },
      { id: 'setup-1', status: 'draft' },
      { id: 'active-2', status: 'active' },
      { id: 'paused-1', status: 'paused' },
      { id: 'active-3', status: 'active' },
      { id: 'setup-2', status: 'forming' },
    ];

    const targets = selectCircleDetailTargets(summaries);
    expect(targets.map((circle) => circle.id)).toEqual([
      'setup-1',
      'setup-2',
      'active-1',
      'active-2',
      'active-3',
    ]);
    expect(targets).toHaveLength(CIRCLES_LIST_DETAIL_LIMIT);
    expect(targets.some((circle) => circle.id === 'paused-1')).toBe(false);
    expect(targets.some((circle) => circle.id === 'closed-1')).toBe(false);
  });

  it('does not request details when the cap is zero', () => {
    expect(
      selectCircleDetailTargets([{ id: 'active-1', status: 'active' }], 0),
    ).toEqual([]);
  });

  it('keeps last-known details for circles not in this fetch and drops deleted ids', () => {
    const merged = mergeRetainedCircleDetails({
      current: {
        keep: { name: 'kept' },
        stale: { name: 'gone' },
        refresh: { name: 'old' },
      },
      incoming: {
        refresh: { name: 'new' },
        extra: { name: 'ignored' },
      },
      circleIds: ['keep', 'refresh'],
    });

    expect(merged).toEqual({
      keep: { name: 'kept' },
      refresh: { name: 'new' },
    });
  });
});
