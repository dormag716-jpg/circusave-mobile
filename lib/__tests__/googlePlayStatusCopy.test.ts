import { playFailureCopy } from '../billing/googlePlayStatusCopy';
import type { GooglePlayBillingFailureCode } from '../billing/googlePlayBillingMachine';

function failed(code: GooglePlayBillingFailureCode, retryable = true) {
  return { status: 'failed' as const, operation: 'purchase' as const, code, retryable };
}

describe('playFailureCopy', () => {
  test('a purchase Google Play rejected can be tried again', () => {
    expect(playFailureCopy(failed('purchase_failed'))).toEqual({
      titleKey: 'playPurchaseFailedTitle',
      bodyKey: 'playPurchaseFailedBody',
      action: 'reload',
    });
  });

  test.each([
    'purchase_invalid',
    'verification_failed',
    'verification_not_entitled',
    'entitlement_refresh_failed',
  ] as const)('%s after payment points to Restore, never a new purchase', (code) => {
    const copy = playFailureCopy(failed(code));
    expect(copy.titleKey).toBe('playConfirmFailedTitle');
    expect(copy.action).toBe('restore');
  });

  test.each(['restore_failed', 'partial_restore_failed'] as const)(
    '%s offers restore again',
    (code) => {
      expect(playFailureCopy(failed(code))).toMatchObject({
        titleKey: 'playRestoreFailedTitle',
        action: 'restore',
      });
    },
  );

  test('finalization failures keep the retry-finalization step', () => {
    expect(playFailureCopy(failed('transaction_completion_failed')).action).toBe(
      'retry_completion',
    );
  });

  test('plan loading failures only offer try again when retryable', () => {
    expect(playFailureCopy(failed('status_failed', true))).toMatchObject({
      titleKey: 'playUnavailableTitle',
      action: 'reload',
    });
    expect(
      playFailureCopy(failed('product_configuration_unavailable', false)).action,
    ).toBe('none');
  });
});
