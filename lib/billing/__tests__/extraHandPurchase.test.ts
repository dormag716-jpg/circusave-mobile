import { ApiError } from '../../platform/networkErrors';
import {
  extraHandErrorCode,
  runExtraHandPurchase,
  type ExtraHandPurchaseDeps,
  type ExtraHandQuote,
} from '../extraHandPurchase';

const quote: ExtraHandQuote = {
  reservationId: 'xh_1',
  circleId: 'c1',
  handNumber: 2,
  productId: 'extra_hand',
  packageName: 'com.circusave.mobile',
  obfuscatedAccountId: 'acct',
  obfuscatedProfileId: 'xh_1',
  expiresAt: null,
  handsIncluded: 1,
  maxHandsPerPerson: 3,
};
const result = {
  reservationId: 'xh_1',
  circleId: 'c1',
  handNumber: 2,
  status: 'consumed',
  membershipId: 'm1',
  consumed: true,
};
const apiError = (code: string, status = 409) =>
  new ApiError('x', status, { code });

function deps(over: Partial<ExtraHandPurchaseDeps> = {}): ExtraHandPurchaseDeps {
  return {
    quote: jest.fn().mockResolvedValue(quote),
    pay: jest.fn().mockResolvedValue({ kind: 'purchased', purchaseToken: 'tok' }),
    verify: jest.fn().mockResolvedValue(result),
    ...over,
  };
}

describe('runExtraHandPurchase', () => {
  it('quotes, pays, verifies, and finishes', async () => {
    const d = deps();
    const phases: string[] = [];
    const final = await runExtraHandPurchase(d, (s) => phases.push(s.phase));
    expect(final).toEqual({ phase: 'done', result });
    expect(phases).toEqual(['quoting', 'paying', 'verifying', 'done']);
    expect(d.verify).toHaveBeenCalledWith({ purchaseToken: 'tok', reservationId: 'xh_1' });
  });

  it.each([
    ['extra_hands_unavailable', { phase: 'not_offered', reason: 'unavailable' }],
    ['hand_included', { phase: 'not_offered', reason: 'included' }],
    ['hand_limit_reached', { phase: 'limit_reached' }],
  ])('never opens payment when the quote says %s', async (code, expected) => {
    const d = deps({ quote: jest.fn().mockRejectedValue(apiError(code)) });
    expect(await runExtraHandPurchase(d)).toEqual(expected);
    expect(d.pay).not.toHaveBeenCalled();
  });

  it('treats a 404 quote as not offered and other errors as failed', async () => {
    const notFound = deps({ quote: jest.fn().mockRejectedValue(new ApiError('x', 404)) });
    expect(await runExtraHandPurchase(notFound)).toEqual({
      phase: 'not_offered',
      reason: 'unavailable',
    });
    const down = deps({ quote: jest.fn().mockRejectedValue(new ApiError('x', 500)) });
    expect(await runExtraHandPurchase(down)).toEqual({ phase: 'failed', reason: 'quote' });
  });

  it('does not verify when the person cancels or payment fails', async () => {
    const d = deps({ pay: jest.fn().mockResolvedValue({ kind: 'canceled' }) });
    expect(await runExtraHandPurchase(d)).toEqual({
      phase: 'failed',
      reason: 'payment_canceled',
      quote,
    });
    expect(d.verify).not.toHaveBeenCalled();
  });

  it('stays pending while Google Play is still taking the payment', async () => {
    const d = deps({ pay: jest.fn().mockResolvedValue({ kind: 'pending' }) });
    expect(await runExtraHandPurchase(d)).toEqual({ phase: 'pending', quote });
    expect(d.verify).not.toHaveBeenCalled();
  });

  it('keeps the token when verify fails so only verify is retried', async () => {
    const d = deps({ verify: jest.fn().mockRejectedValue(new ApiError('x', 500)) });
    const failed = await runExtraHandPurchase(d);
    expect(failed).toEqual({ phase: 'failed', reason: 'verify', quote, purchaseToken: 'tok' });

    const retry = deps();
    const again = await runExtraHandPurchase(retry, undefined, {
      quote,
      purchaseToken: 'tok',
    });
    expect(again).toEqual({ phase: 'done', result });
    expect(retry.quote).not.toHaveBeenCalled();
    expect(retry.pay).not.toHaveBeenCalled();
  });

  it('maps backend pending and needs-review answers', async () => {
    const pending = deps({ verify: jest.fn().mockRejectedValue(apiError('purchase_pending')) });
    expect(await runExtraHandPurchase(pending)).toEqual({ phase: 'pending', quote });
    const review = deps({
      verify: jest.fn().mockRejectedValue(apiError('purchase_needs_review')),
    });
    expect(await runExtraHandPurchase(review)).toMatchObject({
      phase: 'failed',
      reason: 'needs_review',
    });
  });
});

describe('extraHandErrorCode', () => {
  it('reads top-level and nested codes, and falls back to unknown', () => {
    expect(extraHandErrorCode(apiError('hand_included'))).toBe('hand_included');
    expect(
      extraHandErrorCode(new ApiError('x', 400, { details: { code: 'purchase_not_valid' } })),
    ).toBe('purchase_not_valid');
    expect(extraHandErrorCode(apiError('something_else'))).toBe('unknown');
    expect(extraHandErrorCode(null)).toBe('unknown');
  });
});
