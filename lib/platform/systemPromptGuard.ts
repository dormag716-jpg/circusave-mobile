/**
 * Android shows its own permission dialog (for example notifications) in a separate
 * window, which the app sees as leaving the foreground. App Lock counts time away from
 * the app, so a person who took more than a few seconds on that dialog came back to a
 * lock screen right after signing in. While one of these system prompts is open, the lock
 * ignores the app leaving the foreground.
 *
 * Bounded on purpose: the guard expires after MAX_PROMPT_MS, so it cannot keep the app
 * unlocked if a prompt never reports back.
 */

const MAX_PROMPT_MS = 60_000;
/** A leave or return event can arrive just after the prompt promise settles. */
const SETTLE_MS = 1_500;

let openCount = 0;
let openedAtMs = 0;
let closedAtMs = 0;

export async function runSystemPrompt<T>(prompt: () => Promise<T>, nowMs: () => number = Date.now): Promise<T> {
  if (openCount === 0) {
    openedAtMs = nowMs();
  }
  openCount += 1;
  try {
    return await prompt();
  } finally {
    openCount -= 1;
    closedAtMs = nowMs();
  }
}

export function isSystemPromptActive(nowMs: number = Date.now()): boolean {
  if (openCount > 0) {
    return nowMs - openedAtMs < MAX_PROMPT_MS;
  }
  return closedAtMs > 0 && nowMs - closedAtMs < SETTLE_MS;
}

/** Test helper. */
export function resetSystemPromptGuard(): void {
  openCount = 0;
  openedAtMs = 0;
  closedAtMs = 0;
}
