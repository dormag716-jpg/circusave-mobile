import {
  applyContributionLoadResult,
  createContributionRequestStreams,
  resolveSettlementHandStatus,
} from '../contributionRequestStreams';

describe('contribution request streams', () => {
  it('keeps an in-flight screen load current when settlement polls increment', () => {
    const streams = createContributionRequestStreams();
    const loadGeneration = streams.contributionLoad.next();

    streams.settlementStatus.next();
    streams.settlementStatus.next();

    expect(streams.contributionLoad.isCurrent(loadGeneration)).toBe(true);
    expect(streams.contributionLoad.current()).toBe(1);
    expect(streams.settlementStatus.current()).toBe(2);
  });

  it('keeps an in-flight settlement write current when the screen reloads', () => {
    const streams = createContributionRequestStreams();
    const settlementGeneration = streams.settlementStatus.next();

    streams.contributionLoad.next();
    streams.contributionLoad.next();

    expect(streams.settlementStatus.isCurrent(settlementGeneration)).toBe(true);
    expect(streams.settlementStatus.current()).toBe(1);
    expect(streams.contributionLoad.current()).toBe(2);
  });

  it('applies a late contribution load after overlapping settlement polls', () => {
    const streams = createContributionRequestStreams();
    const loadGeneration = streams.contributionLoad.next();
    const applied: string[] = [];

    streams.settlementStatus.next();
    streams.settlementStatus.next();

    const appliedLoad = applyContributionLoadResult({
      streams,
      loadGeneration,
      apply: () => {
        applied.push('contribution-load');
      },
    });

    expect(appliedLoad).toBe(true);
    expect(applied).toEqual(['contribution-load']);
  });

  it('returns the fetched settlement status even when a newer poll owns the UI', () => {
    const streams = createContributionRequestStreams();
    const firstPoll = streams.settlementStatus.next();
    streams.settlementStatus.next();
    const writes: string[] = [];

    const returned = resolveSettlementHandStatus({
      streams,
      settlementGeneration: firstPoll,
      fetchedStatus: 'confirmed',
      applySnapshot: () => {
        writes.push('snapshot');
      },
    });

    expect(returned).toBe('confirmed');
    expect(writes).toEqual([]);
  });

  it('does not let a newer contribution load block a current settlement snapshot write', () => {
    const streams = createContributionRequestStreams();
    const settlementGeneration = streams.settlementStatus.next();
    streams.contributionLoad.next();
    const writes: string[] = [];

    const returned = resolveSettlementHandStatus({
      streams,
      settlementGeneration,
      fetchedStatus: 'submitted',
      applySnapshot: () => {
        writes.push('snapshot');
      },
    });

    expect(returned).toBe('submitted');
    expect(writes).toEqual(['snapshot']);
  });

  it('drops a stale contribution load without touching settlement generation', () => {
    const streams = createContributionRequestStreams();
    const staleLoad = streams.contributionLoad.next();
    streams.contributionLoad.next();
    const settlementBefore = streams.settlementStatus.current();
    const applied: string[] = [];

    const appliedLoad = applyContributionLoadResult({
      streams,
      loadGeneration: staleLoad,
      apply: () => {
        applied.push('stale');
      },
    });

    expect(appliedLoad).toBe(false);
    expect(applied).toEqual([]);
    expect(streams.settlementStatus.current()).toBe(settlementBefore);
  });
});
