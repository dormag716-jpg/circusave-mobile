import type { CircleEvent } from '../../domain/event';
import type { Hand, PayoutPosition } from '../../domain/hand';
import type { CircleId, MembershipId, UserId } from '../../domain/ids';
import type { CircleMembership } from '../../domain/membership';
import type { Money } from '../../domain/money';
import type { CircleLifecycleStatus } from '../../domain/statuses';
import type { AssistantActionSuggestion } from './actions';

export type ValueAuthority = 'backend_authoritative' | 'client_estimate' | 'unavailable';

export type AuthorityValue<T> =
  | Readonly<{ authority: 'backend_authoritative' | 'client_estimate'; value: T }>
  | Readonly<{ authority: 'unavailable'; value: null; reason: string }>;

export type DeterministicExplanation = Readonly<{
  code: string;
  summary: string;
  factRefs: readonly string[];
}>;

export type PendingActionSummary = Readonly<{
  code: string;
  count: number;
  description: string;
  suggestedActionId?: AssistantActionSuggestion['actionId'];
}>;

/**
 * Backend-built, permission-filtered, read-only context for one user and circle.
 * Tokens, credentials, callbacks, commands, and member contact details are omitted by design.
 */
export type AssistantCircleContext = Readonly<{
  schemaVersion: 'assistant-circle-context.v1';
  generatedAt: string;
  expiresAt: string;
  scope: Readonly<{
    userId: UserId;
    circleId: CircleId;
    membershipId: MembershipId;
  }>;
  facts: Readonly<{
    circle: Readonly<{
      id: CircleId;
      name: string;
      lifecycleStatus: CircleLifecycleStatus;
      contributionPerHand: AuthorityValue<Money>;
      participatingHandCount: AuthorityValue<number>;
      totalRounds: AuthorityValue<number>;
      potPerRound: AuthorityValue<Money>;
    }>;
    viewerMembership: CircleMembership;
    visibleMemberships: readonly CircleMembership[];
    visibleHands: readonly Hand[];
    payoutPositions: readonly PayoutPosition[];
    recentEvents: readonly CircleEvent[];
  }>;
  derived: Readonly<{
    explanations: readonly DeterministicExplanation[];
    pendingActions: readonly PendingActionSummary[];
  }>;
  navigationSuggestions: readonly AssistantActionSuggestion[];
  restrictions: Readonly<{
    assistantMayExecuteActions: false;
    financialTruthSource: 'circusave_backend';
  }>;
}>;
