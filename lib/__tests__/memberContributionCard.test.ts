import type { TFunction } from 'i18next';

import {
  buildMemberContributionCardModel,
  collectViewerParticipatingHands,
  formatContributionReportedAt,
} from '../memberContributionCard';
import { presentManualContribution } from '../i18n/financial-presentation';

const t = ((key: string) => key) as TFunction;

describe('collectViewerParticipatingHands', () => {
  test('uses circle viewerHands when present and keeps hands separate', () => {
    const hands = collectViewerParticipatingHands({
      userId: 'usr_1',
      members: [
        { id: 'm1', userId: 'usr_1', handNumber: 1, isParticipating: true },
        { id: 'm2', userId: 'usr_1', handNumber: 2, isParticipating: true },
      ],
      viewerHands: [
        { id: 'm2', handNumber: 2, isParticipating: true },
        { id: 'm1', handNumber: 1, isParticipating: true },
      ],
    });
    expect(hands.map((hand) => hand.id)).toEqual(['m1', 'm2']);
  });

  test('falls back to members matching userId and skips non-participating hands', () => {
    const hands = collectViewerParticipatingHands({
      userId: 'usr_1',
      members: [
        { id: 'm1', userId: 'usr_1', handNumber: 1, isParticipating: true },
        { id: 'm-out', userId: 'usr_1', handNumber: 2, isParticipating: false },
        { id: 'm-other', userId: 'usr_2', handNumber: 1, isParticipating: true },
      ],
    });
    expect(hands).toHaveLength(1);
    expect(hands[0].id).toBe('m1');
  });
});

describe('buildMemberContributionCardModel', () => {
  const hands = [
    { id: 'm1', handNumber: 1, isParticipating: true, userId: 'usr_1' },
    { id: 'm2', handNumber: 2, isParticipating: true, userId: 'usr_1' },
  ];

  test('shows saved paymentInstructions without parsing', () => {
    const model = buildMemberContributionCardModel({
      hands: [hands[0]],
      contributionAmount: 1000,
      paymentInstructions: 'Zelle: organizer@email.com\nInclude your name',
      t,
    });
    expect(model.hasInstructions).toBe(true);
    expect(model.instructions).toBe(
      'Zelle: organizer@email.com\nInclude your name',
    );
  });

  test('structured destinations appear without parsing free text', () => {
    const model = buildMemberContributionCardModel({
      hands: [hands[0]],
      contributionAmount: 1000,
      paymentInstructions: 'Legacy ignored when destinations exist',
      paymentDestinations: [
        { method: 'zelle', destination: 'organizer@email.com', memo: 'Include your name' },
        { method: 'cashapp', destination: '$greg' },
      ],
      t,
    });
    expect(model.hasInstructions).toBe(true);
    expect(model.destinations).toEqual([
      { method: 'zelle', destination: 'organizer@email.com', memo: 'Include your name' },
      { method: 'cashapp', destination: '$greg' },
    ]);
    expect(model.instructions).toBe(
      'Zelle: organizer@email.com\nInclude your name\nCash App: $greg',
    );
  });

  test('missing instructions are an honest empty state, not contact-organizer copy', () => {
    const model = buildMemberContributionCardModel({
      hands: [hands[0]],
      contributionAmount: 1000,
      paymentInstructions: null,
      t,
    });
    expect(model.hasInstructions).toBe(false);
    expect(model.instructions).toBeNull();
  });

  test('submitted is payment reported and waiting, not confirmed', () => {
    const model = buildMemberContributionCardModel({
      hands: [hands[0]],
      contributions: [
        {
          memberId: 'm1',
          round: 6,
          status: 'submitted',
          submittedAt: '2026-08-15T12:42:00.000Z',
        },
      ],
      currentRoundNumber: 6,
      contributionAmount: 1000,
      t,
    });
    const hand = model.hands[0];
    expect(hand.presentation.primaryLabel).toBe(
      presentManualContribution('submitted', t).primaryLabel,
    );
    expect(hand.presentation.secondaryLabel).toBe(
      presentManualContribution('submitted', t).secondaryLabel,
    );
    expect(hand.presentation.awaitingOrganizer).toBe(true);
    expect(hand.presentation.isConfirmed).toBe(false);
    expect(hand.statusRaw).toBe('submitted');
    expect(hand.presentation.primaryLabel.toLowerCase()).not.toBe('submitted');
    expect(model.anyReportable).toBe(false);
  });

  test('late remains waiting for organizer', () => {
    const model = buildMemberContributionCardModel({
      hands: [hands[0]],
      statusByHandId: { m1: 'late' },
      contributionAmount: 1000,
      t,
    });
    expect(model.hands[0].presentation.semanticState).toBe('reported_late');
    expect(model.hands[0].presentation.awaitingOrganizer).toBe(true);
    expect(model.hands[0].presentation.isConfirmed).toBe(false);
  });

  test('confirmed is confirmed and not reportable', () => {
    const model = buildMemberContributionCardModel({
      hands: [hands[0]],
      statusByHandId: { m1: 'confirmed' },
      contributionAmount: 1000,
      t,
    });
    expect(model.hands[0].presentation.isConfirmed).toBe(true);
    expect(model.anyReportable).toBe(false);
    expect(model.allConfirmed).toBe(true);
  });

  test('rejected needs attention and keeps organizer note', () => {
    const model = buildMemberContributionCardModel({
      hands: [hands[0]],
      contributions: [
        {
          memberId: 'm1',
          round: 6,
          status: 'rejected',
          note: 'Wrong amount',
        },
      ],
      currentRoundNumber: 6,
      contributionAmount: 1000,
      t,
    });
    expect(model.hands[0].presentation.needsAttention).toBe(true);
    expect(model.hands[0].presentation.canReportPayment).toBe(true);
    expect(model.hands[0].note).toBe('Wrong amount');
    expect(model.anyReportable).toBe(true);
  });

  test('multi-hand totals are presentation-only and statuses stay per hand', () => {
    const model = buildMemberContributionCardModel({
      hands,
      statusByHandId: { m1: 'due', m2: 'submitted' },
      contributionAmount: 1000,
      t,
    });
    expect(model.showHandRows).toBe(true);
    expect(model.hands).toHaveLength(2);
    expect(model.hands[0].statusRaw).toBe('due');
    expect(model.hands[1].statusRaw).toBe('submitted');
    expect(model.totalDue).toBe(1000);
    expect(model.reportableHandCount).toBe(1);
    expect(model.awaitingHandCount).toBe(1);
    expect(model.hands[0].handId).not.toBe(model.hands[1].handId);
  });
});

describe('formatContributionReportedAt', () => {
  test('returns null when submittedAt is missing', () => {
    expect(formatContributionReportedAt(null, 'en')).toBeNull();
    expect(formatContributionReportedAt('', 'en')).toBeNull();
  });

  test('formats an existing submittedAt timestamp', () => {
    const formatted = formatContributionReportedAt(
      '2026-08-15T12:42:00.000Z',
      'en',
    );
    expect(formatted).toBeTruthy();
    expect(formatted).toMatch(/Aug/);
    expect(formatted).toMatch(/15/);
  });
});
