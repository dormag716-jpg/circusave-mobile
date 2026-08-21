import {
  PaymentSessionLock,
  isContributionConfirmedStatus,
  pollHandUntilConfirmed,
  runStripeContributionPayment,
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

describe('runStripeContributionPayment', () => {
  const baseInput = {
    token: 'tok',
    circleId: 'circle-1',
    roundNumber: 2,
    handId: 'hand-selected',
    contributionPaymentsEnabled: true,
  };

  test('missing capability fails closed before any Stripe dependency runs', async () => {
    const createPaymentIntent = jest.fn();
    const initPaymentSheet = jest.fn();
    const presentPaymentSheet = jest.fn();
    const outcome = await runStripeContributionPayment(
      {
        token: 'tok',
        circleId: 'circle-1',
        roundNumber: 2,
        handId: 'hand-selected',
      },
      {
        createPaymentIntent,
        initPaymentSheet,
        presentPaymentSheet,
        loadHandStatus: jest.fn(),
      },
    );
    expect(outcome).toEqual({ kind: 'disabled' });
    expect(createPaymentIntent).not.toHaveBeenCalled();
    expect(initPaymentSheet).not.toHaveBeenCalled();
    expect(presentPaymentSheet).not.toHaveBeenCalled();
  });

  test('disabled capability blocks direct navigation orchestration', async () => {
    const createPaymentIntent = jest.fn();
    const initPaymentSheet = jest.fn();
    const presentPaymentSheet = jest.fn();
    const outcome = await runStripeContributionPayment(
      { ...baseInput, contributionPaymentsEnabled: false },
      {
        createPaymentIntent,
        initPaymentSheet,
        presentPaymentSheet,
        loadHandStatus: jest.fn(),
      },
    );
    expect(outcome).toEqual({ kind: 'disabled' });
    expect(createPaymentIntent).not.toHaveBeenCalled();
    expect(initPaymentSheet).not.toHaveBeenCalled();
    expect(presentPaymentSheet).not.toHaveBeenCalled();
  });

  test('backend disabled response revokes before PaymentSheet initialization', async () => {
    const initPaymentSheet = jest.fn();
    const presentPaymentSheet = jest.fn();
    const outcome = await runStripeContributionPayment(baseInput, {
      createPaymentIntent: jest.fn(async () => {
        throw {
          status: 503,
          payload: { code: 'contribution_payments_disabled' },
        };
      }),
      initPaymentSheet,
      presentPaymentSheet,
      loadHandStatus: jest.fn(),
    });

    expect(outcome).toEqual({ kind: 'disabled' });
    expect(initPaymentSheet).not.toHaveBeenCalled();
    expect(presentPaymentSheet).not.toHaveBeenCalled();
  });

  test('rapid double acquire means only one createPaymentIntent when orchestrated with lock', async () => {
    const lock = new PaymentSessionLock();
    let createCalls = 0;
    let presentCalls = 0;

    const deps = {
      createPaymentIntent: jest.fn(async () => {
        createCalls += 1;
        return {
          clientSecret: 'cs_test',
          paymentIntentId: 'pi_test',
          memberId: 'hand-selected',
          handId: 'hand-selected',
        };
      }),
      initPaymentSheet: jest.fn(async () => ({})),
      presentPaymentSheet: jest.fn(async () => {
        presentCalls += 1;
        return {};
      }),
      loadHandStatus: jest.fn(async () => 'confirmed'),
      sleep: async () => undefined,
      pollIntervalMs: 1,
      pollMaxAttempts: 1,
    };

    const run = async () => {
      if (!lock.tryAcquire()) {
        return { kind: 'skipped' as const };
      }
      try {
        return await runStripeContributionPayment(baseInput, deps);
      } finally {
        lock.release();
      }
    };

    const [first, second] = await Promise.all([run(), run()]);
    const outcomes = [first, second];
    expect(outcomes.filter((o) => o.kind === 'skipped')).toHaveLength(1);
    expect(outcomes.some((o) => o.kind === 'confirmed')).toBe(true);
    expect(createCalls).toBe(1);
    expect(presentCalls).toBe(1);
  });

  test('PaymentSheet presents once per successful lock acquisition', async () => {
    const presentPaymentSheet = jest.fn(async () => ({}));
    const outcome = await runStripeContributionPayment(baseInput, {
      createPaymentIntent: async () => ({
        clientSecret: 'cs_test',
        paymentIntentId: 'pi_test',
        handId: 'hand-selected',
      }),
      initPaymentSheet: async () => ({}),
      presentPaymentSheet,
      loadHandStatus: async () => 'confirmed',
      sleep: async () => undefined,
      pollMaxAttempts: 1,
    });
    expect(outcome.kind).toBe('confirmed');
    expect(presentPaymentSheet).toHaveBeenCalledTimes(1);
  });

  test('cancel releases caller lock and does not claim confirmed', async () => {
    const lock = new PaymentSessionLock();
    expect(lock.tryAcquire()).toBe(true);
    const createPaymentIntent = jest.fn(async () => ({
      clientSecret: 'cs_test',
      paymentIntentId: 'pi_test',
      handId: 'hand-selected',
    }));
    try {
      const outcome = await runStripeContributionPayment(baseInput, {
        createPaymentIntent,
        initPaymentSheet: async () => ({}),
        presentPaymentSheet: async () => ({
          error: { code: 'Canceled', message: 'Canceled' },
        }),
        loadHandStatus: jest.fn(async () => 'due'),
      });
      expect(outcome).toEqual({ kind: 'canceled' });
      expect(createPaymentIntent).toHaveBeenCalledTimes(1);
    } finally {
      lock.release();
    }
    expect(lock.tryAcquire()).toBe(true);
    lock.release();
  });

  test('error releases caller lock and sanitizes secrets', async () => {
    const lock = new PaymentSessionLock();
    expect(lock.tryAcquire()).toBe(true);
    try {
      const outcome = await runStripeContributionPayment(baseInput, {
        createPaymentIntent: async () => {
          throw new Error('secret pi_abc_secret_xyz leaked');
        },
        initPaymentSheet: async () => ({}),
        presentPaymentSheet: async () => ({}),
        loadHandStatus: async () => 'due',
      });
      expect(outcome.kind).toBe('error');
      if (outcome.kind === 'error') {
        expect(outcome.message).not.toMatch(/secret|pi_/i);
        expect(outcome.handId).toBe('hand-selected');
      }
    } finally {
      lock.release();
    }
    expect(lock.isLocked).toBe(false);
  });

  test('success does not immediately claim confirmed without poll', async () => {
    let statusCalls = 0;
    const outcome = await runStripeContributionPayment(baseInput, {
      createPaymentIntent: async () => ({
        clientSecret: 'cs_test',
        paymentIntentId: 'pi_test',
        handId: 'hand-selected',
      }),
      initPaymentSheet: async () => ({}),
      presentPaymentSheet: async () => ({}),
      loadHandStatus: async () => {
        statusCalls += 1;
        return 'due';
      },
      sleep: async () => undefined,
      pollMaxAttempts: 2,
      pollIntervalMs: 1,
    });
    expect(outcome.kind).toBe('pending_settlement');
    expect(statusCalls).toBeGreaterThanOrEqual(1);
  });

  test('polling stops when confirmed and does not create another PaymentIntent', async () => {
    const createPaymentIntent = jest.fn(async () => ({
      clientSecret: 'cs_test',
      paymentIntentId: 'pi_test',
      handId: 'hand-selected',
    }));
    let statusCalls = 0;
    const outcome = await runStripeContributionPayment(baseInput, {
      createPaymentIntent,
      initPaymentSheet: async () => ({}),
      presentPaymentSheet: async () => ({}),
      loadHandStatus: async () => {
        statusCalls += 1;
        return statusCalls >= 2 ? 'confirmed' : 'submitted';
      },
      sleep: async () => undefined,
      pollMaxAttempts: 5,
      pollIntervalMs: 1,
    });
    expect(outcome).toEqual({ kind: 'confirmed', handId: 'hand-selected' });
    expect(createPaymentIntent).toHaveBeenCalledTimes(1);
    expect(createPaymentIntent).toHaveBeenCalledWith(
      'tok',
      'circle-1',
      2,
      'hand-selected',
    );
  });

  test('selected hand ID is sent and sibling hand is never loaded for settlement', async () => {
    const createPaymentIntent = jest.fn(async () => ({
      clientSecret: 'cs_test',
      paymentIntentId: 'pi_test',
      handId: 'hand-a',
      memberId: 'hand-a',
    }));
    const loaded: string[] = [];
    await runStripeContributionPayment(
      { ...baseInput, handId: 'hand-a' },
      {
        createPaymentIntent,
        initPaymentSheet: async () => ({}),
        presentPaymentSheet: async () => ({}),
        loadHandStatus: async (handId) => {
          loaded.push(handId);
          return 'confirmed';
        },
        pollMaxAttempts: 1,
      },
    );
    const firstCall = createPaymentIntent.mock.calls[0] as unknown as [
      string,
      string,
      number,
      string,
    ];
    expect(firstCall[3]).toBe('hand-a');
    expect(loaded.every((id) => id === 'hand-a')).toBe(true);
    expect(loaded).not.toContain('hand-b');
  });

  test('rejects intent that echoes a different hand id', async () => {
    const outcome = await runStripeContributionPayment(baseInput, {
      createPaymentIntent: async () => ({
        clientSecret: 'cs_test',
        paymentIntentId: 'pi_test',
        handId: 'hand-other',
        memberId: 'hand-other',
      }),
      initPaymentSheet: jest.fn(async () => ({})),
      presentPaymentSheet: jest.fn(async () => ({})),
      loadHandStatus: jest.fn(async () => 'due'),
    });
    expect(outcome.kind).toBe('error');
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
