import enInvite from '../i18n/locales/en/invite.json';
import enJoin from '../i18n/locales/en/joinCircle.json';
import esInvite from '../i18n/locales/es/invite.json';
import esJoin from '../i18n/locales/es/joinCircle.json';
import htInvite from '../i18n/locales/ht/invite.json';
import htJoin from '../i18n/locales/ht/joinCircle.json';
import {
  buildPlannedHandClaimAcknowledgment,
  canSubmitPlannedHandClaim,
  PLANNED_HAND_CLAIM_ACK_VERSION,
  PLANNED_HAND_CLAIM_CLIENT_IDENTIFIER,
} from '../circles/plannedHandClaim';
import { requestJoin } from '../api';

describe('planned hand claim acknowledgment (CS-006)', () => {
  it('keeps checkbox gate off until checked', () => {
    expect(canSubmitPlannedHandClaim({ checked: false, busy: false })).toBe(false);
    expect(canSubmitPlannedHandClaim({ checked: true, busy: false })).toBe(true);
    expect(canSubmitPlannedHandClaim({ checked: true, busy: true })).toBe(false);
  });

  it('builds exact acknowledgment fields only when checked', () => {
    expect(
      buildPlannedHandClaimAcknowledgment({ language: 'en', checked: false }),
    ).toBeNull();
    expect(
      buildPlannedHandClaimAcknowledgment({ language: 'es-MX', checked: true }),
    ).toEqual({
      acknowledgmentAccepted: true,
      acknowledgmentVersion: PLANNED_HAND_CLAIM_ACK_VERSION,
      language: 'es',
      clientIdentifier: PLANNED_HAND_CLAIM_CLIENT_IDENTIFIER,
    });
  });

  it('localized disclosure keys exist for en, es, and ht', () => {
    for (const pack of [enJoin, esJoin, htJoin, enInvite, esInvite, htInvite]) {
      const body = String(pack.claimDisclosureBody || '');
      const ack = String(pack.claimAckLabel || '');
      expect(body.length).toBeGreaterThan(40);
      expect(ack).toMatch(
        /provisional|provizwa|final acceptance|aceptación final|akseptasyon final/i,
      );
      // Explicit non-authorization of payment.
      expect(body.toLowerCase()).toMatch(
        /does not authorize a payment|no autoriza un pago|pa otorize yon peman/,
      );
      // Must not claim final agreement is already accepted.
      expect(body.toLowerCase()).not.toMatch(
        /already accepted the final|ya aceptaste el acuerdo final|deja aksepte akò final/,
      );
    }
  });

  it('includes no payment-authorization implication in English disclosure', () => {
    expect(enJoin.claimDisclosureBody).toMatch(/does not authorize a payment/i);
    expect(enJoin.claimDisclosureBody).toMatch(/payout order is not final/i);
    expect(enJoin.claimAckLabel).toMatch(/provisional/i);
    expect(enJoin.claimAckLabel).toMatch(/not a final agreement/i);
  });

  it('does not promise an acceptance step the backend never requires before start', () => {
    // The backend starts a circle on the organizer's own checks and confirmations;
    // it does not wait for members to accept anything. The pre-start claim copy
    // must describe what is true: a provisional claim, a payout order that can
    // still change, and details a member can review.
    const promises =
      /final acceptance|will be required|review and accept|revisar[áa]s y aceptar[áa]s|se requerir|aceptaci[oó]n final|revize epi aksepte|akseptasyon final|ap obligatwa/i;
    for (const pack of [enJoin, esJoin, htJoin, enInvite, esInvite, htInvite]) {
      expect(String(pack.claimDisclosureBody || '')).not.toMatch(promises);
      expect(String(pack.claimAckLabel || '')).not.toMatch(promises);
      // It still says the claim is provisional and not a final agreement.
      expect(String(pack.claimAckLabel || '')).toMatch(
        /not a final agreement|no es un acuerdo final|pa yon ak[òo] final/i,
      );
    }
  });
});

describe('requestJoin acknowledgment payload', () => {
  const originalFetch = global.fetch;
  const originalApiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const globalWithDev = globalThis as typeof globalThis & { __DEV__?: boolean };

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:5000';
    globalWithDev.__DEV__ = false;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ joinOutcome: 'claimed' }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBase;
  });

  function body() {
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    return JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
  }

  it('sends acknowledgment on join-code claim path', async () => {
    const ack = buildPlannedHandClaimAcknowledgment({ language: 'en', checked: true })!;
    await requestJoin('token', 'circle-1', ack);
    expect(body()).toEqual({
      acknowledgmentAccepted: true,
      acknowledgmentVersion: PLANNED_HAND_CLAIM_ACK_VERSION,
      language: 'en',
      clientIdentifier: PLANNED_HAND_CLAIM_CLIENT_IDENTIFIER,
    });
  });

  it('sends acknowledgment on invite claim path with claimToken', async () => {
    const ack = buildPlannedHandClaimAcknowledgment({ language: 'ht', checked: true })!;
    await requestJoin('token', 'circle-1', { claimToken: 'tok-1', ...ack });
    expect(body()).toEqual({
      claimToken: 'tok-1',
      acknowledgmentAccepted: true,
      acknowledgmentVersion: PLANNED_HAND_CLAIM_ACK_VERSION,
      language: 'ht',
      clientIdentifier: PLANNED_HAND_CLAIM_CLIENT_IDENTIFIER,
    });
  });
});

import { plannedHandClaimStage, resolveJoinPreviewCounts } from '../circles/plannedHandClaim';

describe('plannedHandClaimStage', () => {
  it('uses before-start wording only for circles that have not started', () => {
    expect(plannedHandClaimStage('draft')).toBe('beforeStart');
    expect(plannedHandClaimStage('setup')).toBe('beforeStart');
    expect(plannedHandClaimStage('Active')).toBe('afterStart');
    expect(plannedHandClaimStage('paused')).toBe('afterStart');
    expect(plannedHandClaimStage('completed')).toBe('afterStart');
  });
});

describe('resolveJoinPreviewCounts', () => {
  it('separates joined people from unclaimed hands', () => {
    expect(
      resolveJoinPreviewCounts({
        joinedMembersCount: 1,
        plannedHandsCount: 2,
        unclaimedHandsCount: 1,
        membersCount: 2,
      }),
    ).toEqual({ kind: 'split', joined: 1, hands: 2, unclaimed: 1 });
  });

  it('keeps the legacy total when the backend has no split', () => {
    expect(resolveJoinPreviewCounts({ membersCount: 2 })).toEqual({ kind: 'legacy', total: 2 });
    expect(resolveJoinPreviewCounts({})).toEqual({ kind: 'legacy', total: null });
  });
});
