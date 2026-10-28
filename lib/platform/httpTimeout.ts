/**
 * Central HTTP timeouts for CircuSave mobile.
 *
 * JSON APIs use a 20s budget so login, join, and workspace calls fail closed
 * instead of hanging on airplane mode. PDF generation can legitimately take
 * longer, so statements use 90s and must not share the JSON budget.
 */
export const HTTP_JSON_TIMEOUT_MS = 20_000;
export const HTTP_PDF_TIMEOUT_MS = 90_000;

export type TimedRequestOutcome = 'completed' | 'timeout' | 'cancelled';

export class TimedRequestAbortError extends Error {
  readonly outcome: Exclude<TimedRequestOutcome, 'completed'>;

  constructor(outcome: Exclude<TimedRequestOutcome, 'completed'>) {
    super(outcome === 'timeout' ? 'Request timed out.' : 'Request was cancelled.');
    this.name = 'TimedRequestAbortError';
    this.outcome = outcome;
  }
}

export function isTimedRequestAbortError(
  error: unknown,
): error is TimedRequestAbortError {
  return error instanceof TimedRequestAbortError;
}

export function isAbortLikeError(error: unknown): boolean {
  if (isTimedRequestAbortError(error)) {
    return true;
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = 'name' in error ? String(error.name || '') : '';
  const message = 'message' in error ? String(error.message || '') : '';
  return (
    name === 'AbortError' ||
    message === 'Aborted' ||
    /aborted|abort/i.test(message)
  );
}

/**
 * Race `run(signal)` against a timeout while preserving a caller AbortSignal.
 * Timers and abort listeners are always removed — success, failure, or abort.
 */
export async function runWithTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal | null;
  },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? HTTP_JSON_TIMEOUT_MS;
  const callerSignal = options?.signal ?? undefined;
  const controller = new AbortController();
  let outcome: TimedRequestOutcome = 'completed';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectPending: ((error: TimedRequestAbortError) => void) | undefined;

  const abortFromTimeout = () => {
    if (outcome !== 'completed') {
      return;
    }
    outcome = 'timeout';
    controller.abort();
    rejectPending?.(new TimedRequestAbortError('timeout'));
  };

  const abortFromCaller = () => {
    if (outcome !== 'completed') {
      return;
    }
    outcome = 'cancelled';
    controller.abort();
    rejectPending?.(new TimedRequestAbortError('cancelled'));
  };

  if (callerSignal?.aborted) {
    throw new TimedRequestAbortError('cancelled');
  }

  if (callerSignal) {
    callerSignal.addEventListener('abort', abortFromCaller);
  }

  const cleanup = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (callerSignal) {
      callerSignal.removeEventListener('abort', abortFromCaller);
    }
  };

  try {
    const runPromise = run(controller.signal);
    const abortPromise = new Promise<never>((_, reject) => {
      rejectPending = reject;
      if (timeoutMs > 0) {
        timer = setTimeout(abortFromTimeout, timeoutMs);
      }
    });
    const result = await Promise.race([runPromise, abortPromise]);
    void runPromise.catch(() => undefined);
    return result;
  } catch (error) {
    const timed = isTimedRequestAbortError(error)
      ? error
      : outcome === 'completed'
        ? null
        : new TimedRequestAbortError(outcome);
    if (timed?.outcome === 'timeout') {
      throw new TimedRequestAbortError('timeout');
    }
    if (timed?.outcome === 'cancelled' || callerSignal?.aborted) {
      throw new TimedRequestAbortError('cancelled');
    }
    throw error;
  } finally {
    cleanup();
  }
}
