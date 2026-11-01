import { isOrganizer } from '../platform/permissions';

const CLOSED_STATUSES = ['completed', 'archived', 'closed'];

/** A circle the person organizes and that is still running. */
export function isOpenOrganizerCircle(circle: {
  userRole?: string | null;
  status?: string | null;
}): boolean {
  return (
    isOrganizer(circle.userRole) &&
    !CLOSED_STATUSES.includes(String(circle.status || '').toLowerCase())
  );
}
