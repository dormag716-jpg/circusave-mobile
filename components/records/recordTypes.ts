export type RecordKind = 'contribution' | 'payout' | 'round';

/** A record the user opened: its kind and its formal record number. */
export type OpenRecord = { kind: RecordKind; reference: string };
