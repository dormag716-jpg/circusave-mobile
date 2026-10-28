/**
 * Activity first-paint and focus-refresh policy.
 * A last-known feed must stay on screen during silent refresh and refetch errors.
 */

export function shouldUseSilentActivityRefresh(
  hasLastKnownState: boolean,
): boolean {
  return hasLastKnownState === true;
}

export function shouldShowActivityListError(input: {
  error: string | null;
  entryCount: number;
}): boolean {
  return Boolean(input.error) && input.entryCount > 0;
}
