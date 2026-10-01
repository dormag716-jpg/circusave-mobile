/**
 * Planned-hand claim acknowledgment (CS-006).
 *
 * Provisional ownership of one existing hand — not final agreement acceptance
 * and not payment authorization. Version must match the backend constant.
 */

export const PLANNED_HAND_CLAIM_ACK_VERSION = '2026-08-01-v1';

export const PLANNED_HAND_CLAIM_CLIENT_IDENTIFIER = 'circusave-expo-mobile-v1';

export type PlannedHandClaimAckPayload = {
  acknowledgmentAccepted: true;
  acknowledgmentVersion: string;
  language: 'en' | 'es' | 'ht';
  clientIdentifier: string;
};

export function buildPlannedHandClaimAcknowledgment(input: {
  language: string;
  checked: boolean;
}): PlannedHandClaimAckPayload | null {
  if (!input.checked) return null;
  const code = String(input.language || 'en').toLowerCase().split('-')[0];
  const language = code === 'es' || code === 'ht' ? code : 'en';
  return {
    acknowledgmentAccepted: true,
    acknowledgmentVersion: PLANNED_HAND_CLAIM_ACK_VERSION,
    language,
    clientIdentifier: PLANNED_HAND_CLAIM_CLIENT_IDENTIFIER,
  };
}

export function canSubmitPlannedHandClaim(input: {
  checked: boolean;
  busy: boolean;
}): boolean {
  return input.checked && !input.busy;
}
