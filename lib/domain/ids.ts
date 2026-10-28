/** Opaque identifiers for the intended normalized domain model. */
declare const domainIdBrand: unique symbol;

export type DomainId<Name extends string> = string & {
  readonly [domainIdBrand]: Name;
};

export type UserId = DomainId<'UserId'>;
export type CircleId = DomainId<'CircleId'>;
export type MembershipId = DomainId<'MembershipId'>;
export type HandId = DomainId<'HandId'>;
export type PayoutPositionId = DomainId<'PayoutPositionId'>;
export type RequestId = DomainId<'RequestId'>;
export type EventId = DomainId<'EventId'>;
export type RoundId = DomainId<'RoundId'>;

/**
 * Explicit constructor for already-validated identifiers.
 * This does not validate current mobile API relationships or convert API models.
 */
export function domainId<Name extends string>(value: string): DomainId<Name> {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('Domain identifiers must not be empty.');
  }
  return normalized as DomainId<Name>;
}
