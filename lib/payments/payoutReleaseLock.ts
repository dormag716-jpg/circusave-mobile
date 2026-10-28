/**
 * Synchronous payout-release lock. Acquire before any Alert so double taps
 * and duplicate confirm callbacks cannot start a second mutation.
 * Frozen selection is used for the in-flight request; backend remains source
 * of truth after the write.
 */
export type PayoutReleaseSelection = {
  recipientId: string;
  amount: number;
  roundNumber?: number;
};

export class PayoutReleaseLock {
  private locked = false;
  private submitting = false;
  private frozen: PayoutReleaseSelection | null = null;

  tryAcquire(selection: PayoutReleaseSelection): PayoutReleaseSelection | null {
    const recipientId = String(selection.recipientId || '').trim();
    const amount = Number(selection.amount);
    if (!recipientId || !Number.isFinite(amount)) {
      return null;
    }
    if (this.locked) {
      return null;
    }
    this.locked = true;
    this.submitting = false;
    this.frozen = {
      recipientId,
      amount,
      roundNumber: selection.roundNumber,
    };
    return this.frozen;
  }

  beginSubmit(): PayoutReleaseSelection | null {
    if (!this.locked || this.submitting || !this.frozen) {
      return null;
    }
    this.submitting = true;
    return this.frozen;
  }

  get isLocked(): boolean {
    return this.locked;
  }

  get isSubmitting(): boolean {
    return this.submitting;
  }

  get frozenSelection(): PayoutReleaseSelection | null {
    return this.frozen;
  }

  release(): void {
    this.locked = false;
    this.submitting = false;
    this.frozen = null;
  }
}

/**
 * Consume the acquired lock once. A second immediate call returns `skipped`
 * without mutating and without releasing the in-flight owner's lock.
 */
export async function executeLockedPayoutRelease(input: {
  lock: PayoutReleaseLock;
  mutate: (frozen: PayoutReleaseSelection) => Promise<unknown>;
}): Promise<'completed' | 'skipped'> {
  const frozen = input.lock.beginSubmit();
  if (!frozen) {
    return 'skipped';
  }
  try {
    await input.mutate(frozen);
    return 'completed';
  } finally {
    input.lock.release();
  }
}
