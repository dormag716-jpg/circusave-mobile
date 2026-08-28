import { readFileSync } from 'fs';
import path from 'path';

import { ApiError } from '../networkErrors';
import { runMoneyMutation } from '../moneyMutationRecovery';
import {
  PayoutReleaseLock,
  executeLockedPayoutRelease,
} from '../payoutReleaseLock';

const selection = { recipientId: 'hand-recipient', amount: 250, roundNumber: 2 };

describe('workspace payout lock wiring', () => {
  test('acquires the lock before any Alert can fire a second request', () => {
    const source = readFileSync(
      path.join(__dirname, '../../app/circle/workspace.tsx'),
      'utf8',
    );
    const start = source.indexOf('async function handleReleasePayout');
    const fn = source.slice(start, source.indexOf('async function runMemberAction'));
    expect(fn.indexOf('isLocked')).toBeGreaterThan(0);
    expect(fn.indexOf('isLocked')).toBeLessThan(fn.indexOf('tryAcquire'));
    expect(fn.indexOf('tryAcquire')).toBeGreaterThan(0);
    expect(fn.indexOf('tryAcquire')).toBeLessThan(fn.indexOf('executeBackendRelease'));
    expect(fn.indexOf('tryAcquire')).toBeLessThan(fn.indexOf('promptConfirmRelease'));
    expect(fn).toContain('executeLockedPayoutRelease');
    expect(fn).toContain('releasePayoutFlowLock');
    expect(fn).toContain("goal: 'paid_out'");
  });
});

describe('PayoutReleaseLock', () => {
  test('acquire before confirm blocks a second tap', () => {
    const lock = new PayoutReleaseLock();
    expect(lock.tryAcquire(selection)).toEqual(selection);
    expect(lock.tryAcquire(selection)).toBeNull();
    expect(lock.isLocked).toBe(true);
    expect(lock.frozenSelection).toEqual(selection);
  });

  test('cancel releases the lock so a later attempt can acquire', () => {
    const lock = new PayoutReleaseLock();
    expect(lock.tryAcquire(selection)).toEqual(selection);
    lock.release();
    expect(lock.isLocked).toBe(false);
    expect(lock.frozenSelection).toBeNull();
    expect(lock.tryAcquire(selection)?.recipientId).toBe('hand-recipient');
    lock.release();
  });

  test('frozen selection is used even if later UI state changes', () => {
    const lock = new PayoutReleaseLock();
    lock.tryAcquire(selection);
    expect(lock.frozenSelection).toEqual(selection);
    expect(lock.beginSubmit()).toEqual(selection);
    expect(lock.beginSubmit()).toBeNull();
    lock.release();
  });
});

describe('executeLockedPayoutRelease', () => {
  test('two immediate calls produce one API mutation', async () => {
    const lock = new PayoutReleaseLock();
    expect(lock.tryAcquire(selection)).toEqual(selection);
    const mutate = jest.fn(async () => undefined);

    const [first, second] = await Promise.all([
      executeLockedPayoutRelease({ lock, mutate }),
      executeLockedPayoutRelease({ lock, mutate }),
    ]);

    expect([first, second].sort()).toEqual(['completed', 'skipped']);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(selection);
    expect(lock.isLocked).toBe(false);
  });

  test('releases on success, failure, and already-completed recovery', async () => {
    const success = new PayoutReleaseLock();
    success.tryAcquire(selection);
    await expect(
      executeLockedPayoutRelease({
        lock: success,
        mutate: async () => undefined,
      }),
    ).resolves.toBe('completed');
    expect(success.isLocked).toBe(false);

    const failure = new PayoutReleaseLock();
    failure.tryAcquire(selection);
    const boom = new Error('network');
    await expect(
      executeLockedPayoutRelease({
        lock: failure,
        mutate: async () => {
          throw boom;
        },
      }),
    ).rejects.toBe(boom);
    expect(failure.isLocked).toBe(false);

    const recovered = new PayoutReleaseLock();
    recovered.tryAcquire(selection);
    await expect(
      executeLockedPayoutRelease({
        lock: recovered,
        mutate: (frozen) =>
          runMoneyMutation({
            mutate: async () => {
              throw new ApiError('already paid out', 409, {
                code: 'already_released',
              });
            },
            goal: 'paid_out',
            loadAuthoritativeState: async () => ({
              payoutReleased: true,
            }),
          }).then(() => frozen),
      }),
    ).resolves.toBe('completed');
    expect(recovered.isLocked).toBe(false);
  });
});
