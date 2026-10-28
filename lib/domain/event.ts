import type { CircleId, EventId, HandId, MembershipId, RoundId, UserId } from './ids';

export type EventActor =
  | Readonly<{ type: 'user'; userId: UserId }>
  | Readonly<{ type: 'service'; service: 'scheduler' | 'payments' | 'admin' }>
  | Readonly<{ type: 'external'; provider: string; externalReference?: string }>;

export type CircleEvent = Readonly<{
  id: EventId;
  schemaVersion: 1;
  eventType: string;
  actor: EventActor;
  circleId: CircleId;
  membershipId?: MembershipId;
  handId?: HandId;
  roundId?: RoundId;
  occurredAt: string;
  recordedAt: string;
  idempotencyKey: string;
  metadata: Readonly<Record<string, unknown>>;
}>;
