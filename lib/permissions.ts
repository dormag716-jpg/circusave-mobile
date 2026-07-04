import type { MembershipRole } from './types';

/**
 * Pure role check used for UI rendering decisions (e.g. showing organizer
 * controls or member-specific views).
 */
export function isOrganizer(
  role?: string | null,
): role is Extract<MembershipRole, 'organizer'> {
  return role === 'organizer';
}
