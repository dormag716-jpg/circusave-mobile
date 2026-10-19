import { ApiError } from '@/lib/platform/networkErrors';

export type AccountDeletionBlock =
  | { kind: 'manage_billing' }
  | { kind: 'manage_google_play_billing' }
  | { kind: 'settle_circle_obligations'; circleCount: number }
  | { kind: 'close_organized_circles'; circleCount: number };

/** True when the backend rejected the password typed to confirm deletion. */
export function isDeletionPasswordRejected(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    Boolean(error.payload) &&
    typeof error.payload === 'object' &&
    (error.payload as Record<string, unknown>).action === 'password_incorrect'
  );
}

/**
 * The backend refuses deletion with a 409 and an `action` field when billing
 * or an open organized circle still depends on the account. Returns that
 * reason, or null for any other failure (network, 5xx, unknown 409).
 */
export function readAccountDeletionBlock(error: unknown): AccountDeletionBlock | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }
  const payload = error.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  switch (record.action) {
    case 'manage_billing':
      return { kind: 'manage_billing' };
    case 'manage_google_play_billing':
      return { kind: 'manage_google_play_billing' };
    case 'close_organized_circles':
    case 'settle_circle_obligations': {
      const count = Number(record.circleCount);
      return {
        kind: record.action,
        circleCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
      };
    }
    default:
      return null;
  }
}
