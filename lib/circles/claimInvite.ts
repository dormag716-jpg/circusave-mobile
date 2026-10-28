/**
 * Position-specific claim invite helpers (token share links + messages).
 * Pure functions for unit tests without React Native.
 */

export function getWebAppBaseUrl(): string {
  const configured = String(process.env.EXPO_PUBLIC_WEB_APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  return configured || 'https://circusave.com';
}

/**
 * Deep/web invite URL that lands on the mobile claim flow with claimToken.
 */
export function buildClaimInviteUrl(
  circleId: string,
  claimToken: string,
  baseUrl: string = getWebAppBaseUrl(),
): string {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '') || 'https://circusave.com';
  const id = encodeURIComponent(String(circleId || '').trim());
  const token = encodeURIComponent(String(claimToken || '').trim());
  return `${base}/invite/${id}?claimToken=${token}`;
}

export function buildClaimInviteShareMessage(input: {
  circleName?: string | null;
  handName?: string | null;
  claimUrl: string;
  formatMessage?: (values: {
    circleName: string;
    handName: string;
    claimUrl: string;
  }) => string;
}): string {
  const circle = String(input.circleName || '').trim() || 'my savings circle';
  const hand = String(input.handName || '').trim() || 'your hand';
  if (input.formatMessage) {
    return input.formatMessage({
      circleName: circle,
      handName: hand,
      claimUrl: input.claimUrl,
    });
  }
  return (
    `Claim ${hand} in "${circle}" on CircuSave.\n\n` +
    `This link is for your planned payout position:\n${input.claimUrl}`
  );
}

export function buildGenericCircleInviteShareMessage(input: {
  circleName?: string | null;
  circleId: string;
  circleCode?: string | null;
  baseUrl?: string;
  formatMessage?: (values: {
    circleName: string;
    circleCode: string;
    inviteUrl: string;
  }) => string;
}): string {
  const circle = String(input.circleName || '').trim() || 'my savings circle';
  const base = (input.baseUrl || getWebAppBaseUrl()).replace(/\/+$/, '');
  const code = String(input.circleCode || '').trim();
  const link = `${base}/invite/${encodeURIComponent(input.circleId)}`;
  if (input.formatMessage) {
    return input.formatMessage({
      circleName: circle,
      circleCode: code,
      inviteUrl: link,
    });
  }
  if (code) {
    return (
      `Join my savings circle "${circle}" on CircuSave!\n\n` +
      `Code: ${code}\n\n` +
      `Or open: ${link}`
    );
  }
  return `Join my savings circle "${circle}" on CircuSave!\n\n${link}`;
}
