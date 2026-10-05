/**
 * Local greeting for a signed-in user. No model request.
 * One show per successful unlock, and one show on the first unlocked
 * authenticated entry. Navigation and rerenders do not arm another greeting.
 * Organizer Pro does not control whether the greeting appears.
 */

export type ProGreetingState = {
  userId: string | null;
  epoch: number;
  dismissedEpoch: number;
  entryArmed: boolean;
};

export type ProGreetingInput = {
  userId: string | null;
  authenticated: boolean;
  locked: boolean;
  lockReady: boolean;
  /** Organizer Pro selects the higher allowance. It does not hide this greeting. */
  pro: boolean;
  entitlementsReady: boolean;
};

export const initialProGreetingState: ProGreetingState = {
  userId: null,
  epoch: 0,
  dismissedEpoch: 0,
  entryArmed: false,
};

export function settleProGreeting(
  state: ProGreetingState,
  input: ProGreetingInput,
): ProGreetingState {
  if (!input.authenticated || !input.userId) {
    return initialProGreetingState;
  }

  const switched = state.userId !== input.userId;
  let next: ProGreetingState = switched
    ? { ...initialProGreetingState, userId: input.userId }
    : { ...state, userId: input.userId };

  if (!input.lockReady || input.locked) {
    if (input.locked) {
      next = { ...next, entryArmed: false };
    }
    return next;
  }

  if (!next.entryArmed) {
    next = { ...next, epoch: next.epoch + 1, entryArmed: true };
  }

  return next;
}

export function dismissProGreeting(state: ProGreetingState): ProGreetingState {
  return { ...state, dismissedEpoch: state.epoch };
}

export function proGreetingVisible(
  state: ProGreetingState,
  input: ProGreetingInput,
): boolean {
  return (
    input.authenticated &&
    Boolean(input.userId) &&
    state.userId === input.userId &&
    input.lockReady &&
    !input.locked &&
    input.entitlementsReady &&
    state.epoch > state.dismissedEpoch
  );
}

export function proGreetingInputSignature(input: ProGreetingInput): string {
  return [
    input.userId || '',
    input.authenticated ? '1' : '0',
    input.locked ? '1' : '0',
    input.lockReady ? '1' : '0',
    input.pro ? '1' : '0',
    input.entitlementsReady ? '1' : '0',
  ].join('|');
}

export type ProGreetingTarget =
  | { kind: 'assistant'; circleId: string }
  | { kind: 'circles' };

/** One authorized circle opens its assistant. Several circles stay on the circle list. */
export function proGreetingAssistantTarget(
  circleIds: readonly string[],
): ProGreetingTarget {
  const ids = circleIds.map((id) => String(id || '').trim()).filter(Boolean);
  if (ids.length === 1) {
    return {
      kind: 'assistant',
      circleId: ids[0],
    };
  }
  return { kind: 'circles' };
}

/** Full-page href for deep links; sheet-from-home is the primary open path. */
export function assistantPageHref(circleId: string): `/circle/assistant?circleId=${string}` {
  return `/circle/assistant?circleId=${encodeURIComponent(circleId)}`;
}
