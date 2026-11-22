import type { GooglePlayBillingState } from './googlePlayBillingMachine';

type FailedState = Extract<GooglePlayBillingState, { status: 'failed' }>;

/** What the screen offers the user next after a Google Play failure. */
export type PlayFailureAction =
  | 'reload'
  | 'restore'
  | 'retry_completion'
  | 'none';

export type PlayFailureCopy = {
  titleKey: string;
  bodyKey: string;
  action: PlayFailureAction;
};

/**
 * Picks the message and the next step for a failed Google Play operation.
 * A failure after the user may have paid never offers a fresh purchase; it
 * points to Restore, so nobody is asked to pay twice.
 */
export function playFailureCopy(state: FailedState): PlayFailureCopy {
  switch (state.code) {
    case 'transaction_completion_failed':
      return {
        titleKey: 'playCompletionPendingTitle',
        bodyKey: 'playCompletionPendingBody',
        action: 'retry_completion',
      };
    case 'purchase_failed':
      return {
        titleKey: 'playPurchaseFailedTitle',
        bodyKey: 'playPurchaseFailedBody',
        action: 'reload',
      };
    case 'purchase_invalid':
    case 'verification_failed':
    case 'verification_not_entitled':
    case 'entitlement_refresh_failed':
      return {
        titleKey: 'playConfirmFailedTitle',
        bodyKey: 'playConfirmFailedBody',
        action: 'restore',
      };
    case 'restore_failed':
    case 'partial_restore_failed':
      return {
        titleKey: 'playRestoreFailedTitle',
        bodyKey: 'playRestoreFailedBody',
        action: 'restore',
      };
    default:
      return {
        titleKey: 'playUnavailableTitle',
        bodyKey: 'playUnavailableBody',
        action: state.retryable ? 'reload' : 'none',
      };
  }
}
