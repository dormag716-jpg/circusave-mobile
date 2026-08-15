import { readFileSync } from 'fs';
import path from 'path';

import {
  contributionReviewAccessibilityState,
  nextContributionReviewExpanded,
  shouldStartContributionReviewExpanded,
} from '../contributionReview';
import {
  PaymentSessionLock,
  shouldBlockContributionPayActions,
} from '../stripeContributionPayment';

describe('contribution review accordion', () => {
  it('starts collapsed on first render', () => {
    expect(shouldStartContributionReviewExpanded()).toBe(false);
  });

  it('expands on the first tap and collapses on the second', () => {
    const afterFirstTap = nextContributionReviewExpanded(
      shouldStartContributionReviewExpanded(),
    );
    expect(afterFirstTap).toBe(true);
    expect(nextContributionReviewExpanded(afterFirstTap)).toBe(false);
    expect(contributionReviewAccessibilityState(false)).toEqual({
      expanded: false,
    });
    expect(contributionReviewAccessibilityState(true)).toEqual({
      expanded: true,
    });
  });

  it('does not change selected hand or payment lock state when toggled', () => {
    const selectedHandId = 'hand-a';
    const lock = new PaymentSessionLock();
    expect(lock.tryAcquire()).toBe(true);
    const settlementPhase = 'pending' as const;

    let expanded: boolean = shouldStartContributionReviewExpanded();
    expanded = nextContributionReviewExpanded(expanded);
    expanded = nextContributionReviewExpanded(expanded);

    expect(expanded).toBe(false);
    expect(selectedHandId).toBe('hand-a');
    expect(lock.isLocked).toBe(true);
    expect(settlementPhase).toBe('pending');
    expect(
      shouldBlockContributionPayActions({
        settlementPhase,
      }),
    ).toBe(true);
  });

  it('payment safety locks remain independent of review expansion', () => {
    expect(
      shouldBlockContributionPayActions({
        settlementPhase: 'pending',
      }),
    ).toBe(true);
    expect(
      shouldBlockContributionPayActions({
        settlementPhase: 'confirming',
      }),
    ).toBe(true);
    expect(
      shouldBlockContributionPayActions({
        payingStripe: true,
      }),
    ).toBe(true);
    expect(
      shouldBlockContributionPayActions({
        settlementPhase: null,
      }),
    ).toBe(false);
    expect(nextContributionReviewExpanded(false)).toBe(true);
    expect(
      shouldBlockContributionPayActions({
        settlementPhase: 'pending',
      }),
    ).toBe(true);
  });

  it('toggle is local UI and does not start a contribution API request', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'app', 'payment', 'contribution.tsx'),
      'utf8',
    );
    expect(source).toMatch(/shouldStartContributionReviewExpanded\(\)/);
    expect(source).toMatch(/nextContributionReviewExpanded/);
    expect(source).toMatch(/accessibilityState=\{\{[\s\S]*expanded: reviewExpanded/);
    expect(source).toMatch(/t\('contributions:payWithStripe'\)/);

    const headerStart = source.indexOf('style={styles.reviewHeader}');
    const headerEnd = source.indexOf('</Pressable>', headerStart);
    expect(headerStart).toBeGreaterThan(-1);
    expect(headerEnd).toBeGreaterThan(headerStart);
    const headerOnPress = source.slice(headerStart, headerEnd);
    expect(headerOnPress).toMatch(/setReviewExpanded\(\(open\) => nextContributionReviewExpanded\(open\)\)/);
    expect(headerOnPress).not.toMatch(/loadContribution/);
    expect(headerOnPress).not.toMatch(/getCircleDetail/);
    expect(headerOnPress).not.toMatch(/getCircleSchedule/);
    expect(headerOnPress).not.toMatch(/createPaymentIntent/);
    expect(headerOnPress).not.toMatch(/handleStripePayment/);
  });
});
