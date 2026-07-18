import type { AssistantActionDefinition, AssistantActionSuggestion } from '../actions';
import type { AssistantCircleContext, AuthorityValue } from '../context';
import { domainId, type CircleId, type EventId, type HandId, type MembershipId, type PayoutPositionId, type UserId } from '../../../domain/ids';
import { money } from '../../../domain/money';

const userId = domainId<'UserId'>('user-1') as UserId;
const circleId = domainId<'CircleId'>('circle-1') as CircleId;
const membershipId = domainId<'MembershipId'>('membership-1') as MembershipId;
const handId = domainId<'HandId'>('hand-1') as HandId;

function context(): AssistantCircleContext {
  return {
    schemaVersion: 'assistant-circle-context.v1',
    generatedAt: '2026-07-17T12:00:00.000Z',
    expiresAt: '2026-07-17T12:05:00.000Z',
    scope: { userId, circleId, membershipId },
    facts: {
      circle: {
        id: circleId,
        name: 'Family Circle',
        lifecycleStatus: 'setup',
        contributionPerHand: { authority: 'backend_authoritative', value: money(10_000) },
        participatingHandCount: { authority: 'backend_authoritative', value: 2 },
        totalRounds: { authority: 'client_estimate', value: 2 },
        potPerRound: { authority: 'unavailable', value: null, reason: 'Backend value not supplied.' },
      },
      viewerMembership: {
        id: membershipId,
        circleId,
        userId,
        role: 'organizer',
        lifecycleStatus: 'active',
        workspaceAccessStatus: 'active',
      },
      visibleMemberships: [],
      visibleHands: [{
        id: handId,
        circleId,
        membershipId,
        handNumber: 1,
        participationStatus: 'participating',
        claimStatus: 'claimed',
        origin: 'initial',
      }],
      payoutPositions: [{
        id: domainId<'PayoutPositionId'>('position-1') as PayoutPositionId,
        circleId,
        handId,
        position: 1,
        roundId: null,
      }],
      recentEvents: [{
        id: domainId<'EventId'>('event-1') as EventId,
        schemaVersion: 1,
        eventType: 'circle.created',
        actor: { type: 'user', userId },
        circleId,
        occurredAt: '2026-07-17T11:00:00.000Z',
        recordedAt: '2026-07-17T11:00:00.000Z',
        idempotencyKey: 'circle-created-1',
        metadata: {},
      }],
    },
    derived: { explanations: [], pendingActions: [] },
    navigationSuggestions: [{
      actionId: 'view_circle_setup',
      reason: 'Continue setup in the normal application flow.',
      assistantExecutable: false,
    }],
    restrictions: {
      assistantMayExecuteActions: false,
      financialTruthSource: 'circusave_backend',
    },
  };
}

describe('assistant contracts', () => {
  test('distinguishes authoritative, estimated, and unavailable financial values', () => {
    const values: AuthorityValue<number>[] = [
      { authority: 'backend_authoritative', value: 2 },
      { authority: 'client_estimate', value: 2 },
      { authority: 'unavailable', value: null, reason: 'Not provided.' },
    ];
    expect(values.map((item) => item.authority)).toEqual([
      'backend_authoritative',
      'client_estimate',
      'unavailable',
    ]);
  });

  test('serialized context excludes secret and credential fields', () => {
    const serialized = JSON.stringify(context()).toLowerCase();
    for (const forbidden of ['authtoken', 'bearertoken', 'claimtoken', 'password', 'paymentcredential', 'bankaccount']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test('suggested actions and definitions are explicitly non-executable', () => {
    const suggestion: AssistantActionSuggestion = {
      actionId: 'view_pending_requests',
      reason: 'Requests are waiting for review.',
      assistantExecutable: false,
    };
    const definition: AssistantActionDefinition = {
      id: 'view_pending_requests',
      label: 'View pending requests',
      destination: { routeId: 'circle.people' },
      requiredPermission: 'canViewMembers',
      assistantExecutable: false,
    };

    expect(suggestion.assistantExecutable).toBe(false);
    expect(definition.assistantExecutable).toBe(false);
    expect(context().restrictions.assistantMayExecuteActions).toBe(false);
  });
});
