/**
 * A round that has a payout recorded can no longer have its contributions
 * recorded, confirmed, rejected or changed. The backend enforces this
 * ("This round has already been paid out and cannot be changed."); the app uses
 * the same signal to stop offering actions that are certain to be refused and to
 * say why.
 *
 * This only ever restricts: a local condition may further limit what the
 * backend's viewerPermissions allow, never grant more.
 */
export type RoundPayoutState =
  | {
      payoutRecorded?: boolean | null;
      payoutReleased?: boolean | null;
    }
  | null
  | undefined;

/** True when any of the given views of the current round says its payout exists. */
export function isRoundPayoutLocked(...states: RoundPayoutState[]): boolean {
  return states.some(
    (state) => state?.payoutRecorded === true || state?.payoutReleased === true,
  );
}

/**
 * Hero status chip for the current round. A recorded payout that is not yet
 * marked released must not keep the in-progress "Collecting" label. Released
 * still wins, and this never grants a financial action.
 */
export type RoundHeroChip = 'released' | 'recorded' | 'ready' | 'collecting';

export function roundHeroCollectionChip(input: {
  payoutReleased: boolean;
  payoutLocked: boolean;
  payoutReady: boolean;
}): RoundHeroChip {
  if (input.payoutReleased) return 'released';
  if (input.payoutLocked) return 'recorded';
  if (input.payoutReady) return 'ready';
  return 'collecting';
}
