import {
  shouldReserveDashboardActionSlot,
  shouldShowDashboardEmptyCircles,
  shouldShowDashboardSkeleton,
  shouldUseSilentDashboardRefresh,
} from '../dashboardPaint';

describe('dashboard first paint', () => {
  it('shows a skeleton on first load before any snapshot exists', () => {
    expect(
      shouldShowDashboardSkeleton({ loading: true, hasSnapshot: false }),
    ).toBe(true);
  });

  it('does not show the empty-circles state while the first request is pending', () => {
    expect(
      shouldShowDashboardEmptyCircles({
        hasSnapshot: false,
        activeCircleCount: 0,
      }),
    ).toBe(false);
  });

  it('uses a silent refresh once a snapshot is already on screen', () => {
    expect(shouldUseSilentDashboardRefresh(true)).toBe(true);
    expect(shouldUseSilentDashboardRefresh(false)).toBe(false);
  });

  it('keeps painted data instead of a skeleton on later loads', () => {
    expect(
      shouldShowDashboardSkeleton({ loading: true, hasSnapshot: true }),
    ).toBe(false);
    expect(
      shouldShowDashboardSkeleton({ loading: false, hasSnapshot: true }),
    ).toBe(false);
  });

  it('shows empty circles only after a successful snapshot with none active', () => {
    expect(
      shouldShowDashboardEmptyCircles({
        hasSnapshot: true,
        activeCircleCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldShowDashboardEmptyCircles({
        hasSnapshot: true,
        activeCircleCount: 2,
      }),
    ).toBe(false);
  });

  it('reserves Pay/Review space from summary pending count before details arrive', () => {
    expect(
      shouldReserveDashboardActionSlot({
        detailsReady: false,
        pendingContributions: 2,
      }),
    ).toBe(true);
    expect(
      shouldReserveDashboardActionSlot({
        detailsReady: false,
        pendingContributions: 0,
      }),
    ).toBe(false);
    expect(
      shouldReserveDashboardActionSlot({
        detailsReady: true,
        pendingContributions: 2,
      }),
    ).toBe(false);
  });
});
