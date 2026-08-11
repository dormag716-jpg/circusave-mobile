/**
 * Maps assistant-response.v2 navigationSuggestions to in-app routes.
 * Suggestions are never executable by the model — the client navigates only.
 *
 * Uses plain Href objects (no expo-linking import) so unit tests stay pure.
 */
import type { Href } from 'expo-router';

import type { AssistantActionIdV2 } from '@/lib/contracts/assistant/actionsV2';

export type AssistantNavTarget = {
  actionId: AssistantActionIdV2;
  href: Href;
  labelKey: string;
  fallbackLabel: string;
};

function workspaceHref(circleId: string, tab?: string): Href {
  return {
    pathname: '/circle/workspace',
    params: tab ? { circleId, tab } : { circleId },
  };
}

/**
 * Resolve a non-executable suggestion to a real screen for this circle.
 * Returns null if the action is unknown or not routable yet.
 */
export function hrefForAssistantAction(
  actionId: string,
  circleId: string,
): AssistantNavTarget | null {
  const id = String(actionId || '').trim() as AssistantActionIdV2;
  if (!circleId) return null;

  // Workspace tabs today: round | chat | people | records (see workspace.tsx).
  switch (id) {
    case 'view_circle_setup':
      return {
        actionId: id,
        href: workspaceHref(circleId, 'round'),
        labelKey: 'assistant:nav.view_circle_setup',
        fallbackLabel: 'Circle setup',
      };
    case 'view_pending_requests':
      return {
        actionId: id,
        href: workspaceHref(circleId, 'people'),
        labelKey: 'assistant:nav.view_pending_requests',
        fallbackLabel: 'Pending requests',
      };
    case 'view_hand_details':
      return {
        actionId: id,
        href: workspaceHref(circleId, 'people'),
        labelKey: 'assistant:nav.view_hand_details',
        fallbackLabel: 'Hand details',
      };
    case 'view_round_status':
      return {
        actionId: id,
        href: workspaceHref(circleId, 'round'),
        labelKey: 'assistant:nav.view_round_status',
        fallbackLabel: 'Round status',
      };
    case 'view_contribution_status':
      return {
        actionId: id,
        href: {
          pathname: '/payment/contribution',
          params: { circleId },
        },
        labelKey: 'assistant:nav.view_contribution_status',
        fallbackLabel: 'Contribution status',
      };
    case 'view_payout_order':
      return {
        actionId: id,
        href: workspaceHref(circleId, 'records'),
        labelKey: 'assistant:nav.view_payout_order',
        fallbackLabel: 'Payout order',
      };
    case 'view_activity':
      return {
        actionId: id,
        href: {
          pathname: '/circle/history',
          params: { circleId },
        },
        labelKey: 'assistant:nav.view_activity',
        fallbackLabel: 'Activity',
      };
    case 'upgrade_to_premium':
      return {
        actionId: id,
        href: '/subscription' as Href,
        labelKey: 'assistant:nav.upgrade_to_premium',
        fallbackLabel: 'View plan',
      };
    default:
      return null;
  }
}

/** Labels used when i18n keys are not loaded yet. */
export function labelForAssistantAction(actionId: string): string {
  const labels: Record<string, string> = {
    view_circle_setup: 'Circle setup',
    view_pending_requests: 'Pending requests',
    view_hand_details: 'Hand details',
    view_round_status: 'Round status',
    view_contribution_status: 'Contributions',
    view_payout_order: 'Payout order',
    view_activity: 'Activity',
    upgrade_to_premium: 'View plan',
  };
  return labels[actionId] || actionId;
}

