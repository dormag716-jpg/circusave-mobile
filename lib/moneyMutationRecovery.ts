/**
 * Lost-response recovery for money CTAs.
 *
 * Backend money conflicts currently return HTTP 400/409 plus `{ error, message }`.
 * They do not yet send a dedicated `code` on every path. This helper therefore:
 *  1. honors a stable `code` / `errorCode` / `error_code` / `status` when present
 *  2. otherwise reloads authoritative snapshot fields (contribution status,
 *     payoutReleased, circle started) after 400/409/422
 *
 * Unrelated conflicts (version retry, 403, 5xx, offline) stay errors.
 * English message substrings are never used.
 */
import { ApiError } from './networkErrors';

export const MONEY_ALREADY_COMPLETED_CODES = [
  'already_submitted',
  'already_confirmed',
  'already_rejected',
  'already_paid',
  'already_paid_out',
  'already_released',
  'already_started',
  'already_finalized',
  'duplicate',
  'idempotent_replay',
] as const;

export type MoneyAlreadyCompletedCode =
  (typeof MONEY_ALREADY_COMPLETED_CODES)[number];

export type MoneyMutationGoal =
  | 'submitted'
  | 'confirmed'
  | 'rejected'
  | 'paid_out'
  | 'started';

export type AuthoritativeMoneyState = {
  contributionStatus?: string | null;
  payoutReleased?: boolean | null;
  payoutStatus?: string | null;
  circleStatus?: string | null;
  circleStarted?: boolean | null;
};

const CODE_SET = new Set<string>(MONEY_ALREADY_COMPLETED_CODES);

const CODE_GOALS: Record<MoneyAlreadyCompletedCode, MoneyMutationGoal[]> = {
  already_submitted: ['submitted'],
  already_confirmed: ['submitted', 'confirmed'],
  already_rejected: ['rejected'],
  already_paid: ['submitted', 'confirmed'],
  already_paid_out: ['paid_out'],
  already_released: ['paid_out'],
  already_started: ['started'],
  already_finalized: ['started'],
  duplicate: ['submitted', 'confirmed', 'rejected', 'paid_out', 'started'],
  idempotent_replay: ['submitted', 'confirmed', 'rejected', 'paid_out', 'started'],
};

export function readStableErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.payload || typeof error.payload !== 'object') {
    return null;
  }
  const payload = error.payload as Record<string, unknown>;
  const raw = payload.code ?? payload.errorCode ?? payload.error_code ?? payload.status;
  const code = String(raw ?? '').trim().toLowerCase();
  return code || null;
}

export function stableCodeMatchesGoal(
  code: string | null,
  goal: MoneyMutationGoal,
): boolean {
  if (!code || !CODE_SET.has(code)) {
    return false;
  }
  return CODE_GOALS[code as MoneyAlreadyCompletedCode].includes(goal);
}

export function shouldInspectAuthoritativeMoneyState(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  if (error.status === 401 || error.status === 403 || error.status === 429) {
    return false;
  }
  if (error.status >= 500 || error.status === 0) {
    return false;
  }
  return error.status === 400 || error.status === 409 || error.status === 422;
}

export function extractAuthoritativeMoneyState(input: {
  contributions?: Array<{
    memberId?: string | null;
    status?: string | null;
  }> | null;
  memberId?: string | null;
  payoutReleased?: boolean | null;
  currentRoundStatus?: string | null;
  circleStatus?: string | null;
  circleStarted?: boolean | null;
  startedAt?: string | null;
}): AuthoritativeMoneyState {
  const memberId = String(input.memberId || '').trim();
  const contribution = memberId
    ? (input.contributions || []).find(
        (row) => String(row.memberId || '').trim() === memberId,
      )
    : undefined;
  const circleStatus = String(input.circleStatus || '').trim().toLowerCase();
  let circleStarted = input.circleStarted ?? null;
  if (circleStarted == null) {
    if (input.startedAt) {
      circleStarted = true;
    } else if (
      ['active', 'completed', 'paused', 'closed'].includes(circleStatus)
    ) {
      circleStarted = true;
    } else if (circleStatus) {
      circleStarted = false;
    }
  }
  return {
    contributionStatus: contribution?.status ?? null,
    payoutReleased: input.payoutReleased ?? null,
    payoutStatus: input.currentRoundStatus ?? null,
    circleStatus: input.circleStatus ?? null,
    circleStarted,
  };
}

export function authoritativeStateMeetsGoal(
  state: AuthoritativeMoneyState,
  goal: MoneyMutationGoal,
): boolean {
  const contribution = String(state.contributionStatus || '')
    .trim()
    .toLowerCase();
  const payoutStatus = String(state.payoutStatus || '')
    .trim()
    .toLowerCase();
  const circleStatus = String(state.circleStatus || '')
    .trim()
    .toLowerCase();

  if (goal === 'submitted') {
    return ['submitted', 'late', 'confirmed'].includes(contribution);
  }
  if (goal === 'confirmed') {
    return contribution === 'confirmed';
  }
  if (goal === 'rejected') {
    return contribution === 'rejected';
  }
  if (goal === 'paid_out') {
    return (
      state.payoutReleased === true ||
      ['released', 'paid', 'completed', 'paid_out'].includes(payoutStatus)
    );
  }
  return (
    state.circleStarted === true ||
    circleStatus === 'active' ||
    circleStatus === 'completed'
  );
}

export async function runMoneyMutation(input: {
  mutate: () => Promise<unknown>;
  goal: MoneyMutationGoal;
  loadAuthoritativeState: () => Promise<AuthoritativeMoneyState>;
}): Promise<'completed' | 'already_completed'> {
  try {
    await input.mutate();
    try {
      await input.loadAuthoritativeState();
    } catch {
      // Mutation succeeded; display uses the caller's reload.
    }
    return 'completed';
  } catch (error) {
    if (!shouldInspectAuthoritativeMoneyState(error)) {
      throw error;
    }
    const code = readStableErrorCode(error);
    let state: AuthoritativeMoneyState = {};
    try {
      state = await input.loadAuthoritativeState();
    } catch {
      if (stableCodeMatchesGoal(code, input.goal)) {
        return 'already_completed';
      }
      throw error;
    }
    if (
      authoritativeStateMeetsGoal(state, input.goal) ||
      stableCodeMatchesGoal(code, input.goal)
    ) {
      return 'already_completed';
    }
    throw error;
  }
}
