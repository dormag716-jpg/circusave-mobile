/**
 * Pure routing rules for a tapped push notification. No React Native imports,
 * so they run in Jest.
 *
 * The backend sends two payload shapes:
 *  - chat pushes: `{ screen, circleId, conversationId, notification_type }`
 *  - everything else: `{ link, circle_id, member_id, notification_type }`
 * A target is only a request to open a circle. The caller still has to check,
 * with the backend, that the signed-in user may open it.
 */

export type NotificationWorkspaceTab = 'round' | 'chat' | 'people' | 'records';

export type NotificationTarget = {
  screen: string;
  circleId: string;
  tab?: NotificationWorkspaceTab;
  conversationId?: string;
};

const WORKSPACE_TABS = new Set<string>(['round', 'chat', 'people', 'records']);

/** Backend ids look like `c_ab12cd34ef`. Anything else is not followed. */
const SAFE_CIRCLE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const TAB_BY_LINK_SEGMENT: Record<string, NotificationWorkspaceTab> = {
  round: 'round',
  members: 'people',
  chat: 'chat',
};

/** Used only when the link has no tab segment (for example `/groups/{id}`). */
const TAB_BY_TYPE: Record<string, NotificationWorkspaceTab> = {
  swap_request: 'people',
  join_request_pending: 'people',
  new_chat_message: 'chat',
  chat_message: 'chat',
  payment_submitted: 'round',
  payment_confirmed: 'round',
  payment_rejected: 'round',
  payment_reminder: 'round',
  payment_instructions_updated: 'round',
  round_started: 'round',
  next_round_started: 'round',
  round_completed: 'round',
  payout_sent: 'round',
  payout_ready: 'round',
  payout_completed: 'round',
};

export function conversationIdFromNotificationLink(link: string | null) {
  if (!link) return null;
  const match = link.match(/[?&]conversationId=([^&]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseGroupLink(link: string | null): {
  circleId: string | null;
  tab: NotificationWorkspaceTab | null;
} {
  if (!link) return { circleId: null, tab: null };
  const match = link.split('?')[0].match(/^\/groups\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!match) return { circleId: null, tab: null };
  return {
    circleId: match[1],
    tab: match[2] ? TAB_BY_LINK_SEGMENT[match[2]] ?? null : null,
  };
}

export function resolveNotificationTarget(
  data: Record<string, unknown> | null | undefined,
): NotificationTarget | null {
  if (!data) return null;

  const link = readString(data.link);
  const fromLink = parseGroupLink(link);
  const circleId =
    readString(data.circleId) ?? readString(data.circle_id) ?? fromLink.circleId;
  if (!circleId || !SAFE_CIRCLE_ID.test(circleId)) return null;

  const conversationId =
    readString(data.conversationId) ??
    conversationIdFromNotificationLink(link) ??
    undefined;

  // Explicit routing (chat pushes, local notifications): keep as sent.
  const screen = readString(data.screen);
  if (screen) {
    return { screen, circleId, conversationId };
  }

  const type = readString(data.type) ?? readString(data.notification_type);
  const tab = fromLink.tab ?? (type ? TAB_BY_TYPE[type] : undefined);
  if (!tab || !WORKSPACE_TABS.has(tab)) {
    // Known circle, no specific tab (invite, join approved, unknown type).
    return { screen: 'workspace', circleId, conversationId };
  }
  return { screen: 'workspace', circleId, tab, conversationId };
}

/**
 * Remembers which tapped notifications were already followed. The listener is
 * set up again whenever auth state changes, and a cold-start response stays
 * available until cleared, so without this one tap could navigate repeatedly.
 */
export function createHandledResponseTracker(limit = 50) {
  const seen: string[] = [];
  return {
    /** Returns true the first time a key is seen, false afterwards. */
    markHandled(key: string): boolean {
      if (seen.includes(key)) return false;
      seen.push(key);
      if (seen.length > limit) seen.shift();
      return true;
    },
  };
}
