import {
  createRequestGeneration,
  shouldApplyRequestGeneration,
  shouldReplaceFinancialStateOnError,
  shouldShowBlockingLoadState,
} from '../requestGeneration';

describe('request generation', () => {
  it('starts at generation 0 and increments on each load', () => {
    const generation = createRequestGeneration();
    expect(generation.current()).toBe(0);
    expect(generation.next()).toBe(1);
    expect(generation.next()).toBe(2);
    expect(generation.current()).toBe(2);
  });

  it('applies a response only when its generation is still current', () => {
    const generation = createRequestGeneration();
    const first = generation.next();
    const second = generation.next();

    expect(generation.isCurrent(first)).toBe(false);
    expect(generation.isCurrent(second)).toBe(true);
    expect(shouldApplyRequestGeneration(generation.current(), first)).toBe(
      false,
    );
    expect(shouldApplyRequestGeneration(generation.current(), second)).toBe(
      true,
    );
  });

  it('rejects non-integer generations', () => {
    expect(shouldApplyRequestGeneration(1.5, 1.5)).toBe(false);
    expect(shouldApplyRequestGeneration(Number.NaN, Number.NaN)).toBe(false);
  });

  it('does not replace last-known financial state on refetch error', () => {
    expect(shouldReplaceFinancialStateOnError(true)).toBe(false);
    expect(shouldReplaceFinancialStateOnError(false)).toBe(true);
  });

  it('blocks the screen with a loader only when no last-known state exists', () => {
    expect(shouldShowBlockingLoadState(true, false)).toBe(true);
    expect(shouldShowBlockingLoadState(true, true)).toBe(false);
    expect(shouldShowBlockingLoadState(false, false)).toBe(false);
  });

  it('simulates overlapping loads so the older financial payload is dropped', async () => {
    const generation = createRequestGeneration();
    const applied: string[] = [];

    async function load(label: string, delayMs: number) {
      const request = generation.next();
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (!generation.isCurrent(request)) {
        return;
      }
      applied.push(label);
    }

    await Promise.all([load('stale', 20), load('latest', 5)]);

    expect(applied).toEqual(['latest']);
    expect(generation.current()).toBe(2);
  });
});
