import { readFileSync } from 'fs';
import path from 'path';

import {
  PaymentSessionLock,
  isContributionConfirmedStatus,
  pollHandUntilConfirmed,
  sanitizePaymentUserMessage,
  shouldBlockContributionPayActions,
  shouldClearPendingSettlement,
  shouldHoldPaymentLockAfterOutcome,
} from '../stripeContributionPayment';

describe('PaymentSessionLock', () => {
  test('tryAcquire blocks concurrent sessions and release frees the lock', () => {
    const lock = new PaymentSessionLock();
    expect(lock.tryAcquire()).toBe(true);
    expect(lock.tryAcquire()).toBe(false);
    expect(lock.isLocked).toBe(true);
    lock.release();
    expect(lock.isLocked).toBe(false);
    expect(lock.tryAcquire()).toBe(true);
    lock.release();
  });

  test('release on cancel/error path is re-entrant safe', () => {
    const lock = new PaymentSessionLock();
    expect(lock.tryAcquire()).toBe(true);
    lock.release();
    lock.release();
    expect(lock.tryAcquire()).toBe(true);
    lock.release();
  });
});

describe('pollHandUntilConfirmed', () => {
  test('stops when status becomes confirmed without creating extra intents', async () => {
    const statuses = ['due', 'submitted', 'confirmed'];
    let calls = 0;
    const result = await pollHandUntilConfirmed({
      handId: 'hand-1',
      loadHandStatus: async () => {
        const status = statuses[Math.min(calls, statuses.length - 1)];
        calls += 1;
        return status;
      },
      intervalMs: 1,
      maxAttempts: 5,
      sleep: async () => undefined,
    });
    expect(result).toBe('confirmed');
    expect(calls).toBe(3);
  });

  test('stops after timeout without confirming', async () => {
    let calls = 0;
    const result = await pollHandUntilConfirmed({
      handId: 'hand-1',
      loadHandStatus: async () => {
        calls += 1;
        return 'submitted';
      },
      intervalMs: 1,
      maxAttempts: 3,
      sleep: async () => undefined,
    });
    expect(result).toBe('timeout');
    expect(calls).toBe(3);
  });
});

describe('pending settlement pay lock', () => {
  test('holds the session lock only after pending settlement', () => {
    expect(shouldHoldPaymentLockAfterOutcome('pending_settlement')).toBe(true);
    expect(shouldHoldPaymentLockAfterOutcome('confirmed')).toBe(false);
    expect(shouldHoldPaymentLockAfterOutcome('canceled')).toBe(false);
    expect(shouldHoldPaymentLockAfterOutcome('error')).toBe(false);
  });

  test('blocks pay and manual submit while confirming or pending', () => {
    expect(
      shouldBlockContributionPayActions({ settlementPhase: 'pending' }),
    ).toBe(true);
    expect(
      shouldBlockContributionPayActions({ settlementPhase: 'confirming' }),
    ).toBe(true);
    expect(shouldBlockContributionPayActions({ payingStripe: true })).toBe(true);
    expect(shouldBlockContributionPayActions({ submitting: true })).toBe(true);
    expect(shouldBlockContributionPayActions({ settlementPhase: null })).toBe(
      false,
    );
  });

  test('clears pending only when a fresh status is confirmed', () => {
    expect(shouldClearPendingSettlement('confirmed')).toBe(true);
    expect(shouldClearPendingSettlement('due')).toBe(false);
    expect(shouldClearPendingSettlement('submitted')).toBe(false);
  });
});

describe('in-app contribution payment is removed', () => {
  const stripeSource = readFileSync(
    path.join(__dirname, '..', 'stripeContributionPayment.ts'),
    'utf8',
  );
  const contributionSource = readFileSync(
    path.join(__dirname, '..', '..', 'app', 'payment', 'contribution.tsx'),
    'utf8',
  );

  test('does not export Stripe PaymentSheet orchestration', () => {
    expect(stripeSource).not.toContain('runStripeContributionPayment');
    expect(stripeSource).not.toContain('recoverStripeCreateConflict');
    expect(stripeSource).not.toContain('initPaymentSheet');
    expect(stripeSource).not.toContain('presentPaymentSheet');
    expect(stripeSource).not.toContain('STRIPE_RETURN_URL');
    expect(contributionSource).not.toContain('runStripeContributionPayment');
    expect(contributionSource).not.toContain('createPaymentIntent');
  });
});

describe('helpers', () => {
  test('isContributionConfirmedStatus', () => {
    expect(isContributionConfirmedStatus('confirmed')).toBe(true);
    expect(isContributionConfirmedStatus('CONFIRMED')).toBe(true);
    expect(isContributionConfirmedStatus('submitted')).toBe(false);
  });

  test('sanitizePaymentUserMessage strips secrets', () => {
    expect(
      sanitizePaymentUserMessage(
        new Error('bad client_secret=cs_test_123'),
        'fallback',
      ),
    ).toBe('fallback');
    expect(
      sanitizePaymentUserMessage(new Error('Hand not found for this user'), 'fallback'),
    ).toBe('Hand not found for this user');
  });
});
