import { type BackendLinkedAccount } from './chat';
import { requestJson } from './http';

export function approveContribution(
  token: string,
  circleId: string,
  memberId: string,
): Promise<unknown> {
  return requestJson<unknown>(`/contributions/${circleId}/${memberId}/approve`, {
    method: 'POST',
    token,
  });
}

export function rejectContribution(
  token: string,
  circleId: string,
  memberId: string,
  input: { reason?: string; reasonCode?: string } = {},
): Promise<unknown> {
  return requestJson<unknown>(`/contributions/${circleId}/${memberId}/reject`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export function submitContribution(
  token: string,
  circleId: string,
  memberId: string,
  input: { note?: string; paymentMethod?: string; paymentReference?: string } = {},
): Promise<unknown> {
  return requestJson<unknown>(`/contributions/${circleId}/${memberId}/submit`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export function sendContributionReminder(
  token: string,
  circleId: string,
  memberId?: string,
): Promise<unknown> {
  return requestJson<unknown>(`/groups/${circleId}/reminders/contributions`, {
    method: 'POST',
    token,
    body: JSON.stringify(memberId ? { memberId } : {}),
  });
}

export async function createFinancialConnectionsSession(token: string): Promise<{ clientSecret: string }> {
  return requestJson<{ clientSecret: string }>('/wallet/stripe/financial-connections', {
    method: 'POST',
    token,
  });
}

export async function createPaymentIntent(
  token: string,
  circleId: string,
  roundNumber: number,
  memberId?: string,
): Promise<{
  clientSecret: string;
  paymentIntentId: string;
  memberId?: string;
  handId?: string;
  handNumber?: number;
  amountCents?: number;
  reused?: boolean;
}> {
  return requestJson<{
    clientSecret: string;
    paymentIntentId: string;
    memberId?: string;
    handId?: string;
    handNumber?: number;
    amountCents?: number;
    reused?: boolean;
  }>('/wallet/stripe/payment-intent', {
    method: 'POST',
    body: JSON.stringify({
      circleId,
      roundNumber,
      memberId: memberId || undefined,
      handId: memberId || undefined,
    }),
    token,
  });
}

export async function getLinkedAccounts(token: string): Promise<BackendLinkedAccount[]> {
  const res = await requestJson<{ accounts: BackendLinkedAccount[] }>('/wallet/stripe/accounts', {
    token,
  });
  return res.accounts;
}
