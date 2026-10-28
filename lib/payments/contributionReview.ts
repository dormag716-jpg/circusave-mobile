/**
 * Contribution Review accordion. Local UI only — never a payment or network event.
 */

export function shouldStartContributionReviewExpanded(): false {
  return false;
}

export function nextContributionReviewExpanded(
  currentlyExpanded: boolean,
): boolean {
  return currentlyExpanded !== true;
}

export function contributionReviewAccessibilityState(expanded: boolean): {
  expanded: boolean;
} {
  return { expanded: expanded === true };
}
