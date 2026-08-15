import {
  buildManualContributionSubmitPayload,
  claimedPaymentMethodLabelKey,
  ORGANIZER_RECORDED_PAID_NOTE,
  paymentMethodForDestination,
  presentClaimedContributionPayment,
} from '../contributionClaim';

describe('paymentMethodForDestination', () => {
  test('maps destination methods onto existing submit paymentMethod values', () => {
    expect(
      paymentMethodForDestination({ method: 'zelle', destination: 'a@b.com' }),
    ).toBe('zelle');
    expect(
      paymentMethodForDestination({ method: 'cash', destination: '' }),
    ).toBe('cash');
    expect(
      paymentMethodForDestination({ method: 'bank', destination: 'Acct 1234' }),
    ).toBe('other');
  });
});

describe('buildManualContributionSubmitPayload', () => {
  test('omits fields when the member did not select a destination', () => {
    expect(buildManualContributionSubmitPayload(null)).toEqual({});
    expect(buildManualContributionSubmitPayload(undefined)).toEqual({});
  });

  test('sends method and destination handle on the existing submit body', () => {
    expect(
      buildManualContributionSubmitPayload({
        method: 'cashapp',
        destination: '$greg',
        memo: 'Include your name',
      }),
    ).toEqual({
      paymentMethod: 'cashapp',
      note: '$greg',
    });
    expect(
      buildManualContributionSubmitPayload(
        { method: 'zelle', destination: 'a@b.com' },
        '  REF-1  ',
      ),
    ).toEqual({
      paymentMethod: 'zelle',
      note: 'a@b.com',
      paymentReference: 'REF-1',
    });
  });

  test('cash without a handle still reports the method', () => {
    expect(
      buildManualContributionSubmitPayload({ method: 'cash', destination: '' }),
    ).toEqual({ paymentMethod: 'cash' });
  });
});

describe('presentClaimedContributionPayment', () => {
  test('shows method and destination claimed without inventing either', () => {
    expect(
      presentClaimedContributionPayment({
        paymentMethod: 'zelle',
        note: 'organizer@email.com',
      }),
    ).toEqual({
      method: 'zelle',
      destination: 'organizer@email.com',
      reference: null,
    });
    expect(
      presentClaimedContributionPayment({
        paymentMethod: null,
        note: null,
      }),
    ).toEqual({ method: null, destination: null, reference: null });
  });

  test('does not treat organizer Record paid note as a claimed destination', () => {
    expect(
      presentClaimedContributionPayment({
        paymentMethod: 'cash',
        note: ORGANIZER_RECORDED_PAID_NOTE,
      }),
    ).toEqual({ method: 'cash', destination: null, reference: null });
  });
});

describe('claimedPaymentMethodLabelKey', () => {
  test('uses Payment Setup method labels and skips Stripe', () => {
    expect(claimedPaymentMethodLabelKey('zelle')).toBe('paymentSetup.methods.zelle');
    expect(claimedPaymentMethodLabelKey('stripe')).toBeNull();
    expect(claimedPaymentMethodLabelKey(null)).toBeNull();
  });
});
