/**
 * Screen-level request generations.
 * Each load increments the counter; only the current generation may write UI.
 * This is not a cache and does not abort in-flight HTTP.
 */

export type RequestGeneration = {
  next: () => number;
  isCurrent: (generation: number) => boolean;
  current: () => number;
};

export function createRequestGeneration(): RequestGeneration {
  let current = 0;
  return {
    next() {
      current += 1;
      return current;
    },
    isCurrent(generation: number) {
      return generation === current;
    },
    current() {
      return current;
    },
  };
}

/** Apply a response only when its generation is still the latest load. */
export function shouldApplyRequestGeneration(
  currentGeneration: number,
  resultGeneration: number,
): boolean {
  return (
    Number.isInteger(currentGeneration) &&
    Number.isInteger(resultGeneration) &&
    currentGeneration === resultGeneration
  );
}

/**
 * Refetch failures must keep last-known financial UI.
 * Clear local financial state only when there is nothing to keep (first load).
 */
export function shouldReplaceFinancialStateOnError(
  hasLastKnownState: boolean,
): boolean {
  return !hasLastKnownState;
}

/** Full-screen loaders only when there is no last-known snapshot to show. */
export function shouldShowBlockingLoadState(
  loading: boolean,
  hasLastKnownState: boolean,
): boolean {
  return loading && !hasLastKnownState;
}
