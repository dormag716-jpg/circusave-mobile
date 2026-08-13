import { createRequestGeneration, type RequestGeneration } from './requestGeneration';

/**
 * Contribution screen loads and Stripe settlement polls are independent
 * request streams. Sharing one generation lets polling invalidate an
 * in-flight screen load (and the reverse).
 */
export type ContributionRequestStreams = {
  contributionLoad: RequestGeneration;
  settlementStatus: RequestGeneration;
};

export function createContributionRequestStreams(): ContributionRequestStreams {
  return {
    contributionLoad: createRequestGeneration(),
    settlementStatus: createRequestGeneration(),
  };
}

export function applyContributionLoadResult(input: {
  streams: ContributionRequestStreams;
  loadGeneration: number;
  apply: () => void;
}): boolean {
  if (!input.streams.contributionLoad.isCurrent(input.loadGeneration)) {
    return false;
  }
  input.apply();
  return true;
}

/**
 * Always returns this fetch's status for the payment poller.
 * Only the current settlement generation may write the on-screen snapshot.
 */
export function resolveSettlementHandStatus(input: {
  streams: ContributionRequestStreams;
  settlementGeneration: number;
  fetchedStatus: string;
  applySnapshot: () => void;
}): string {
  if (input.streams.settlementStatus.isCurrent(input.settlementGeneration)) {
    input.applySnapshot();
  }
  return input.fetchedStatus;
}
