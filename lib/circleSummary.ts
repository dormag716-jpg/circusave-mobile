const SETUP_CIRCLE_STATUSES = new Set(['draft', 'setup', 'forming']);

/** Classification for persisted circle summaries returned by the backend. */
export function isSetupCircleStatus(status: string | null | undefined): boolean {
  return SETUP_CIRCLE_STATUSES.has(String(status || '').trim().toLowerCase());
}
