/**
 * Agreement-review circle detail fetch.
 * getCircleDetail contract is (token, circleId) — never reverse these.
 */
export function loadAgreementReviewCircleDetail<T>(
  getCircleDetail: (token: string, circleId: string) => Promise<T>,
  token: string,
  circleId: string,
): Promise<T> {
  return getCircleDetail(token, circleId);
}
