const SETUP_CIRCLE_STATUSES = new Set(['draft', 'setup', 'forming']);

/** Classification for persisted circle summaries returned by the backend. */
export function isSetupCircleStatus(status: string | null | undefined): boolean {
  return SETUP_CIRCLE_STATUSES.has(String(status || '').trim().toLowerCase());
}

export function getViewerPayoutPosition(
  detail: {
    members?: ReadonlyArray<{ id: string; userId?: string | null }> | null;
    turnOrder?: ReadonlyArray<string> | null;
  },
  userId: string,
): number | null {
  const members = Array.isArray(detail.members) ? detail.members : [];
  const turnOrder = Array.isArray(detail.turnOrder) ? detail.turnOrder : [];
  const ordered = [...members].sort((a, b) => {
    const posA = turnOrder.indexOf(a.id);
    const posB = turnOrder.indexOf(b.id);
    return (posA === -1 ? 9999 : posA) - (posB === -1 ? 9999 : posB);
  });
  const viewerIndex = ordered.findIndex((member) => member.userId === userId);
  return viewerIndex === -1 ? null : viewerIndex + 1;
}
