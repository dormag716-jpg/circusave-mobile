export type AssistantActionIdV2 =
  | 'view_circle_setup'
  | 'view_pending_requests'
  | 'view_hand_details'
  | 'view_round_status'
  | 'view_contribution_status'
  | 'view_payout_order'
  | 'view_activity'
  | 'upgrade_to_premium';

export type AssistantActionSuggestionV2 = Readonly<{
  actionId: AssistantActionIdV2;
  reason: string;
  assistantExecutable: false;
}>;

