export type AssistantActionId =
  | 'view_circle_setup'
  | 'view_pending_requests'
  | 'view_hand_details'
  | 'view_round_status'
  | 'view_contribution_status'
  | 'view_payout_order'
  | 'view_activity'
  | 'review_memory_settings';

export type AssistantDestination = Readonly<{
  routeId: string;
  params?: Readonly<Record<string, string>>;
}>;

/** Navigation metadata only. It never carries a callback, command, or API path. */
export type AssistantActionDefinition = Readonly<{
  id: AssistantActionId;
  label: string;
  destination: AssistantDestination;
  requiredPermission: string | null;
  assistantExecutable: false;
}>;

export type AssistantActionSuggestion = Readonly<{
  actionId: AssistantActionId;
  reason: string;
  assistantExecutable: false;
}>;
