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

/** Statuses where the circle's rounds have not begun, so the claim is made before the circle starts. */
const PRE_START_STATUSES = new Set(['draft', 'setup', 'pending', '']);

/**
 * Which claim wording applies. An unknown or missing status is treated as
 * before start only when it is empty; anything else (active, paused, completed)
 * has already started, so "before the circle starts" copy would be wrong.
 */
export function plannedHandClaimStage(status: unknown): 'beforeStart' | 'afterStart' {
  const normalized = String(status ?? '').trim().toLowerCase();
  return PRE_START_STATUSES.has(normalized) ? 'beforeStart' : 'afterStart';
}

export type JoinPreviewCounts =
  | { kind: 'split'; joined: number; hands: number; unclaimed: number }
  | { kind: 'legacy'; total: number | null };

/** Separates joined people from planned hands when the backend provides both; otherwise keeps the legacy total. */
export function resolveJoinPreviewCounts(preview: {
  joinedMembersCount?: number;
  plannedHandsCount?: number;
  unclaimedHandsCount?: number;
  membersCount?: number;
  members_count?: number;
}): JoinPreviewCounts {
  const { joinedMembersCount, plannedHandsCount, unclaimedHandsCount } = preview;
  if (
    typeof joinedMembersCount === 'number' &&
    typeof plannedHandsCount === 'number' &&
    typeof unclaimedHandsCount === 'number'
  ) {
    return {
      kind: 'split',
      joined: joinedMembersCount,
      hands: plannedHandsCount,
      unclaimed: unclaimedHandsCount,
    };
  }
  const total = preview.membersCount ?? preview.members_count;
  return { kind: 'legacy', total: typeof total === 'number' ? total : null };
}
