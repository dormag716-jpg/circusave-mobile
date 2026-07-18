/**
 * Lifecycle copy helpers for setup vs live circle language.
 * Phase checks use startCircleReadiness (status / startedAt / isStarted only).
 */

import {
  getCircleLifecyclePhase,
  isCircleNotStarted,
  isCircleSetupState,
  type StartCircleDetailLike,
} from './startCircleReadiness';

export type LifecycleMemberLike = {
  id: string;
  userId?: string | null;
  name?: string | null;
  full_name?: string | null;
  displayLabel?: string | null;
  handNumber?: number | null;
  hand_number?: number | null;
  handLabel?: string | null;
};

export {
  getCircleLifecyclePhase,
  isCircleNotStarted,
  isCircleSetupState,
  isCircleStarted,
  isCircleCompleted,
} from './startCircleReadiness';

export type { CircleLifecyclePhase, StartCircleDetailLike } from './startCircleReadiness';

export function isUnclaimedHand(member: LifecycleMemberLike): boolean {
  return !String(member.userId || '').trim();
}

export function handClaimStatusLabel(member: LifecycleMemberLike): 'Awaiting claim' | 'Connected' {
  return isUnclaimedHand(member) ? 'Awaiting claim' : 'Connected';
}

export function roundUnstartedTitle(): string {
  return 'Circle not started';
}

export function roundUnstartedSubtitle(): string {
  return 'Complete membership and payout order before starting the circle. Contributions begin after Start Circle.';
}

export function roundCompletedTitle(): string {
  return 'Circle completed';
}

export function roundCompletedSubtitle(): string {
  return 'This circle has finished. Review historical rounds and records below.';
}

export function peopleHandsSectionTitle(): string {
  return 'Hands';
}

export function peoplePendingSectionTitle(): string {
  return 'Pending requests';
}

export function formatHandsPeopleMetrics(input: {
  handCount?: number | null;
  memberCount?: number | null;
  uniqueMemberCount?: number | null;
  fallbackHandCount?: number;
}): string {
  const hands =
    typeof input.handCount === 'number'
      ? input.handCount
      : typeof input.memberCount === 'number'
        ? input.memberCount
        : Number(input.fallbackHandCount || 0);
  const people =
    typeof input.uniqueMemberCount === 'number' ? input.uniqueMemberCount : null;

  const handLabel = `${hands} hand${hands === 1 ? '' : 's'}`;
  if (people === null) {
    return handLabel;
  }
  const peopleLabel = `${people} ${people === 1 ? 'person' : 'people'}`;
  return `${handLabel} · ${peopleLabel}`;
}

/** Structural action visibility from lifecycle only. */
export function canShowStructuralSetupActions(input: {
  isOrganizer: boolean;
  circle: StartCircleDetailLike;
}): boolean {
  return input.isOrganizer && isCircleSetupState(input.circle);
}
