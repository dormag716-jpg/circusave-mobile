import { ApiError } from '@/lib/platform/networkErrors';
import { isDeletionPasswordRejected, readAccountDeletionBlock } from '../accountDeletionBlock';

describe('readAccountDeletionBlock', () => {
  it('reads each backend refusal reason from a 409', () => {
    expect(
      readAccountDeletionBlock(new ApiError('x', 409, { action: 'manage_billing' })),
    ).toEqual({ kind: 'manage_billing' });
    expect(
      readAccountDeletionBlock(
        new ApiError('x', 409, { action: 'manage_google_play_billing' }),
      ),
    ).toEqual({ kind: 'manage_google_play_billing' });
    expect(
      readAccountDeletionBlock(
        new ApiError('x', 409, { action: 'close_organized_circles', circleCount: 3 }),
      ),
    ).toEqual({ kind: 'close_organized_circles', circleCount: 3 });
  });

  it('reads the unsettled-payments refusal', () => {
    expect(
      readAccountDeletionBlock(
        new ApiError('x', 409, { action: 'settle_circle_obligations', circleCount: 2 }),
      ),
    ).toEqual({ kind: 'settle_circle_obligations', circleCount: 2 });
  });

  it('recognizes a rejected confirmation password', () => {
    expect(
      isDeletionPasswordRejected(new ApiError('x', 403, { action: 'password_incorrect' })),
    ).toBe(true);
    expect(isDeletionPasswordRejected(new ApiError('x', 403, { action: 'other' }))).toBe(false);
    expect(isDeletionPasswordRejected(new ApiError('x', 401))).toBe(false);
    expect(isDeletionPasswordRejected(new Error('x'))).toBe(false);
  });

  it('defaults a missing or bad circle count to one', () => {
    expect(
      readAccountDeletionBlock(
        new ApiError('x', 409, { action: 'close_organized_circles', circleCount: 'no' }),
      ),
    ).toEqual({ kind: 'close_organized_circles', circleCount: 1 });
  });

  it('returns null for other failures', () => {
    expect(readAccountDeletionBlock(new ApiError('x', 409, { action: 'other' }))).toBeNull();
    expect(readAccountDeletionBlock(new ApiError('x', 409))).toBeNull();
    expect(
      readAccountDeletionBlock(new ApiError('x', 500, { action: 'manage_billing' })),
    ).toBeNull();
    expect(readAccountDeletionBlock(new Error('offline'))).toBeNull();
    expect(readAccountDeletionBlock(null)).toBeNull();
  });
});
