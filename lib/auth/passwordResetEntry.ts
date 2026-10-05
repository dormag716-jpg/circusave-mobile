/**
 * Password-reset steps shared by Security and Login.
 * The backend verifies only the latest open email code, so the code step
 * must not call /auth/forgot-password/request.
 */

export type PasswordResetPhase = 'request' | 'code' | 'password';

export function passwordResetPhase(input: {
  codeEntryReady: boolean;
  codeVerified: boolean;
}): PasswordResetPhase {
  if (input.codeVerified) {
    return 'password';
  }
  if (input.codeEntryReady) {
    return 'code';
  }
  return 'request';
}

/** The request step is the only step that emails a new code. */
export function passwordResetRequestsReplacementCode(phase: PasswordResetPhase): boolean {
  return phase === 'request';
}

export function openExistingRecoveryCode(input: {
  email: string;
}): { codeEntryReady: true } | { error: 'missing_email' } {
  if (!input.email.trim()) {
    return { error: 'missing_email' };
  }
  return { codeEntryReady: true };
}

/** Matches the backend default OTP lifetime. */
export const PASSWORD_RESET_CODE_ENTRY_MAX_AGE_MS = 5 * 60 * 1000;

export type StagedPasswordResetCode = {
  email: string;
  sentAt: number;
};

let staged: StagedPasswordResetCode | null = null;

export function stagePasswordResetCodeEntry(email: string, sentAt = Date.now()): void {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    staged = null;
    return;
  }
  staged = { email: normalized, sentAt };
}

export function readFreshPasswordResetCodeEntry(
  now = Date.now(),
): StagedPasswordResetCode | null {
  if (!staged) {
    return null;
  }
  if (now - staged.sentAt > PASSWORD_RESET_CODE_ENTRY_MAX_AGE_MS) {
    staged = null;
    return null;
  }
  return { email: staged.email, sentAt: staged.sentAt };
}

export function acknowledgePasswordResetCodeEntry(): void {
  staged = null;
}
