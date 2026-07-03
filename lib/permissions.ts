import type { CircleRole } from './types';

/**
 * Pure role check used for UI rendering decisions (e.g. showing organizer
 * actions on the dashboard and circles list). This does NOT gate backend
 * operations — those are controlled exclusively by the backend's
 * viewerPermissions object returned in the round workspace response.
 */
export function isOrganizer(
  role: CircleRole | null | undefined,
): role is Extract<CircleRole, 'organizer' | 'admin'> {
  return role === 'organizer' || role === 'admin';
}
