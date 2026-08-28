import { readFileSync } from 'fs';
import path from 'path';

import { ApiError } from '../networkErrors';
import {
  MONEY_ALREADY_COMPLETED_CODES,
  authoritativeStateMeetsGoal,
  extractAuthoritativeMoneyState,
  readStableErrorCode,
  runMoneyMutation,
  shouldInspectAuthoritativeMoneyState,
  stableCodeMatchesGoal,
  type MoneyAlreadyCompletedCode,
  type MoneyMutationGoal,
} from '../moneyMutationRecovery';

function apiError(
  status: number,
  payload?: Record<string, unknown>,
  message = 'conflict',
): ApiError {
  return new ApiError(message, status, payload);
}

const GOAL_FOR_CODE: Record<MoneyAlreadyCompletedCode, MoneyMutationGoal> = {
  already_submitted: 'submitted',
  already_confirmed: 'confirmed',
  already_rejected: 'rejected',
  already_paid: 'confirmed',
  already_paid_out: 'paid_out',
  already_released: 'paid_out',
  already_started: 'started',
  already_finalized: 'started',
  duplicate: 'submitted',
  idempotent_replay: 'confirmed',
};

describe('stable already-completed codes', () => {
  test('every catalogued code matches its money goal', () => {
    for (const code of MONEY_ALREADY_COMPLETED_CODES) {
      expect(stableCodeMatchesGoal(code, GOAL_FOR_CODE[code])).toBe(true);
    }
  });

  test('readStableErrorCode uses code fields, not English messages', () => {
    expect(
      readStableErrorCode(
        apiError(409, {
          code: 'already_confirmed',
          message: 'That contribution is already confirmed.',
        }),
      ),
    ).toBe('already_confirmed');
    expect(
      readStableErrorCode(
        apiError(400, { errorCode: 'Already_Submitted' }, 'already submitted'),
      ),
    ).toBe('already_submitted');
    expect(
      readStableErrorCode(
        new Error('This contribution already has confirmed pot funding recorded.'),
      ),
    ).toBeNull();
    expect(
      readStableErrorCode(
        apiError(400, {}, 'Only due, missed, or rejected contributions can be submitted.'),
      ),
    ).toBeNull();
  });
});

describe('runMoneyMutation inspect-and-reload', () => {
  test.each(MONEY_ALREADY_COMPLETED_CODES)(
    '%s reloads authoritative state as already-completed',
    async (code) => {
      const goal = GOAL_FOR_CODE[code];
      const loadAuthoritativeState = jest.fn(async () =>
        extractAuthoritativeMoneyState({
          contributions: [{ memberId: 'hand-1', status: 'due' }],
          memberId: 'hand-1',
        }),
      );
      const result = await runMoneyMutation({
        mutate: async () => {
          throw apiError(409, { code });
        },
        goal,
        loadAuthoritativeState,
      });
      expect(result).toBe('already_completed');
      expect(loadAuthoritativeState).toHaveBeenCalled();
    },
  );

  test('400 without a code succeeds only when snapshot already meets the goal', async () => {
    const result = await runMoneyMutation({
      mutate: async () => {
        throw apiError(
          400,
          {},
          'Only due, missed, or rejected contributions can be submitted.',
        );
      },
      goal: 'submitted',
      loadAuthoritativeState: async () =>
        extractAuthoritativeMoneyState({
          contributions: [{ memberId: 'hand-1', status: 'submitted' }],
          memberId: 'hand-1',
        }),
    });
    expect(result).toBe('already_completed');
  });

  test('unrelated 409 version conflict with still-due snapshot stays an error', async () => {
    const error = apiError(
      409,
      { code: 'version_conflict' },
      'Circle was modified by another request. Please retry.',
    );
    await expect(
      runMoneyMutation({
        mutate: async () => {
          throw error;
        },
        goal: 'confirmed',
        loadAuthoritativeState: async () =>
          extractAuthoritativeMoneyState({
            contributions: [{ memberId: 'hand-1', status: 'due' }],
            memberId: 'hand-1',
          }),
      }),
    ).rejects.toBe(error);
  });

  test('unrelated 422 does not convert to success', async () => {
    const error = apiError(422, { code: 'invalid_reference' }, 'Payment reference is invalid.');
    await expect(
      runMoneyMutation({
        mutate: async () => {
          throw error;
        },
        goal: 'submitted',
        loadAuthoritativeState: async () =>
          extractAuthoritativeMoneyState({
            contributions: [{ memberId: 'hand-1', status: 'due' }],
            memberId: 'hand-1',
          }),
      }),
    ).rejects.toBe(error);
  });

  test('403, 5xx, and offline never inspect snapshot', async () => {
    const loadAuthoritativeState = jest.fn(async () =>
      extractAuthoritativeMoneyState({
        contributions: [{ memberId: 'hand-1', status: 'confirmed' }],
        memberId: 'hand-1',
      }),
    );
    for (const status of [403, 500, 0]) {
      const error = apiError(status, { code: 'already_confirmed' });
      await expect(
        runMoneyMutation({
          mutate: async () => {
            throw error;
          },
          goal: 'confirmed',
          loadAuthoritativeState,
        }),
      ).rejects.toBe(error);
    }
    expect(loadAuthoritativeState).not.toHaveBeenCalled();
    expect(shouldInspectAuthoritativeMoneyState(apiError(403))).toBe(false);
    expect(shouldInspectAuthoritativeMoneyState(apiError(500))).toBe(false);
    expect(shouldInspectAuthoritativeMoneyState(apiError(0))).toBe(false);
  });

  test('English already-done messages without a code or snapshot stay errors', async () => {
    const error = new Error('This contribution already has confirmed pot funding recorded.');
    await expect(
      runMoneyMutation({
        mutate: async () => {
          throw error;
        },
        goal: 'confirmed',
        loadAuthoritativeState: async () =>
          extractAuthoritativeMoneyState({
            contributions: [{ memberId: 'hand-1', status: 'confirmed' }],
            memberId: 'hand-1',
          }),
      }),
    ).rejects.toBe(error);
  });

  test('money CTAs reload via runMoneyMutation instead of English matching', () => {
    const workspace = readFileSync(
      path.join(__dirname, '../../app/circle/workspace.tsx'),
      'utf8',
    );
    const contribution = readFileSync(
      path.join(__dirname, '../../app/payment/contribution.tsx'),
      'utf8',
    );
    const agreementReview = readFileSync(
      path.join(__dirname, '../../app/circle/agreement-review.tsx'),
      'utf8',
    );
    expect(workspace).toContain("goal: 'submitted'");
    expect(workspace).toContain("goal: 'confirmed'");
    expect(workspace).toContain("goal: 'rejected'");
    expect(workspace).toContain("goal: 'paid_out'");
    expect(workspace).toContain("goal: 'started'");
    expect(workspace).toContain('executeLockedPayoutRelease');
    expect(contribution).toContain('runMoneyMutation');
    expect(contribution).toContain("goal: 'submitted'");
    expect(contribution).toContain('runStripeContributionPayment');
    expect(agreementReview).toContain('runMoneyMutation');
    expect(agreementReview).toContain("goal: 'started'");
    expect(workspace).not.toMatch(/message\.includes\(/);
    expect(contribution).not.toMatch(/message\.includes\(/);
  });

  test('payout and start snapshot fields satisfy already-completed goals', () => {
    expect(
      authoritativeStateMeetsGoal(
        extractAuthoritativeMoneyState({ payoutReleased: true }),
        'paid_out',
      ),
    ).toBe(true);
    expect(
      authoritativeStateMeetsGoal(
        extractAuthoritativeMoneyState({
          circleStatus: 'active',
          startedAt: '2026-04-01T00:00:00Z',
        }),
        'started',
      ),
    ).toBe(true);
    expect(
      authoritativeStateMeetsGoal(
        extractAuthoritativeMoneyState({ circleStatus: 'draft' }),
        'started',
      ),
    ).toBe(false);
  });
});
