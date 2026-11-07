import { getCircleListLifecycle } from '@/lib/circles/circleSummary';

/**
 * Whether the organizer should be offered "Archive circle" on a circle that has
 * already started.
 *
 * Circles still in setup have their own clear/delete action. Finished, closed or
 * already archived circles are history and need nothing. Only circles that are
 * running (or paused) keep an organizer from deleting their account, so those are
 * the ones that need a way out. The server does the real work and checks that
 * the caller is the organizer; this only decides what to show.
 */
export function canOrganizerArchiveStartedCircle(
  isOrganizer: boolean,
  status: string | null | undefined,
  potStatus?: string | null | undefined,
): boolean {
  if (!isOrganizer) return false;
  const lifecycle = getCircleListLifecycle(status, potStatus);
  return lifecycle === 'active' || lifecycle === 'paused';
}
