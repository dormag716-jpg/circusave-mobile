import type { TFunction } from 'i18next';

import { buildMemberContributionCardModel } from '../memberContributionCard';
import {
  canStartMarkAsSentSubmit,
  isAlreadyReportedSubmissionError,
  reportableContributionHands,
  resolveMarkAsSentContributionHrefHandId,
  resolveMarkAsSentTarget,
  shouldSubmitMarkAsSentFromWorkspace,
} from '../markContributionSent';

const t = ((key: string) => key) as TFunction;

function cardWithStatuses(statusByHandId: Record<string, string>) {
  return buildMemberContributionCardModel({
    hands: Object.keys(statusByHandId).map((handId, index) => ({
      id: handId,
      handNumber: index + 1,
      isParticipating: true,
      userId: 'usr_1',
    })),
    statusByHandId,
    contributionAmount: 1000,
    t,
  });
}

describe('resolveMarkAsSentTarget', () => {
  test('single reportable hand uses that exact hand id', () => {
    const card = cardWithStatuses({ hand_a: 'due' });
    expect(resolveMarkAsSentTarget(card)).toEqual({
      handId: 'hand_a',
      amount: 1000,
      handNumber: 1,
    });
  });

  test('multiple reportable hands never submit from workspace', () => {
    const card = cardWithStatuses({ hand_a: 'due', hand_b: 'missed' });
    expect(shouldSubmitMarkAsSentFromWorkspace(card)).toBe(false);
    expect(resolveMarkAsSentTarget(card)).toBeNull();
    expect(resolveMarkAsSentTarget(card, 'hand_a')).toBeNull();
    expect(resolveMarkAsSentTarget(card, 'hand_b')).toBeNull();
    expect(
      canStartMarkAsSentSubmit({
        canSubmit: true,
        target: resolveMarkAsSentTarget(card, 'hand_a'),
        inflightHandId: null,
      }),
    ).toBe(false);
  });

  test('cannot target a non-reportable or unknown hand', () => {
    const card = cardWithStatuses({ hand_a: 'submitted', hand_b: 'due' });
    expect(shouldSubmitMarkAsSentFromWorkspace(card)).toBe(true);
    expect(resolveMarkAsSentTarget(card, 'hand_a')).toBeNull();
    expect(resolveMarkAsSentTarget(card, 'missing')).toBeNull();
    expect(resolveMarkAsSentTarget(card, 'hand_b')?.handId).toBe('hand_b');
  });

  test('rejected and missed remain independently reportable but do not workspace-submit together', () => {
    const card = cardWithStatuses({ hand_a: 'rejected', hand_b: 'missed' });
    expect(reportableContributionHands(card).map((hand) => hand.handId)).toEqual(
      ['hand_a', 'hand_b'],
    );
    expect(shouldSubmitMarkAsSentFromWorkspace(card)).toBe(false);
    expect(resolveMarkAsSentTarget(card, 'hand_a')).toBeNull();
    expect(resolveMarkAsSentTarget(card, 'hand_b')).toBeNull();
  });

  test('multiple destinations navigate even when only one hand is reportable', () => {
    const card = cardWithStatuses({ hand_a: 'due' });
    expect(shouldSubmitMarkAsSentFromWorkspace(card, 2)).toBe(false);
    expect(resolveMarkAsSentContributionHrefHandId(card, 'hand_a', 2)).toBe(
      'hand_a',
    );
    expect(shouldSubmitMarkAsSentFromWorkspace(card, 1)).toBe(true);
    expect(resolveMarkAsSentContributionHrefHandId(card, 'hand_a', 1)).toBeNull();
  });

  test('a single rejected or missed hand can still submit from workspace', () => {
    expect(
      resolveMarkAsSentTarget(cardWithStatuses({ hand_a: 'rejected' }))?.handId,
    ).toBe('hand_a');
    expect(
      resolveMarkAsSentTarget(cardWithStatuses({ hand_a: 'missed' }))?.handId,
    ).toBe('hand_a');
  });
});

describe('resolveMarkAsSentContributionHrefHandId', () => {
  test('single reportable hand stays on the workspace submit path', () => {
    const card = cardWithStatuses({ hand_a: 'due' });
    expect(shouldSubmitMarkAsSentFromWorkspace(card)).toBe(true);
    expect(resolveMarkAsSentContributionHrefHandId(card, 'hand_a')).toBeNull();
    expect(resolveMarkAsSentContributionHrefHandId(card)).toBeNull();
  });

  test('multiple reportable hands navigate the exact chosen hand only', () => {
    const card = cardWithStatuses({ hand_a: 'due', hand_b: 'missed' });
    expect(resolveMarkAsSentContributionHrefHandId(card)).toBeNull();
    expect(resolveMarkAsSentContributionHrefHandId(card, 'hand_a')).toBe(
      'hand_a',
    );
    expect(resolveMarkAsSentContributionHrefHandId(card, 'hand_b')).toBe(
      'hand_b',
    );
    expect(resolveMarkAsSentContributionHrefHandId(card, 'hand_a')).not.toBe(
      'hand_b',
    );
    expect(resolveMarkAsSentContributionHrefHandId(card, 'hand_submitted')).toBeNull();
  });
});

describe('canStartMarkAsSentSubmit', () => {
  const target = { handId: 'hand_a', amount: 1000, handNumber: 1 };

  test('backend capability remains authoritative', () => {
    expect(
      canStartMarkAsSentSubmit({
        canSubmit: false,
        target,
        inflightHandId: null,
      }),
    ).toBe(false);
    expect(
      canStartMarkAsSentSubmit({
        canSubmit: true,
        target,
        inflightHandId: null,
      }),
    ).toBe(true);
  });

  test('inflight lock blocks another submit', () => {
    expect(
      canStartMarkAsSentSubmit({
        canSubmit: true,
        target,
        inflightHandId: 'hand_a',
      }),
    ).toBe(false);
    expect(
      canStartMarkAsSentSubmit({
        canSubmit: true,
        target,
        inflightHandId: 'hand_other',
      }),
    ).toBe(false);
  });

  test('missing target cannot submit', () => {
    expect(
      canStartMarkAsSentSubmit({
        canSubmit: true,
        target: null,
        inflightHandId: null,
      }),
    ).toBe(false);
  });
});

describe('isAlreadyReportedSubmissionError', () => {
  test('recognizes backend already-submitted and already-funded messages', () => {
    expect(
      isAlreadyReportedSubmissionError(
        new Error('Only due, missed, or rejected contributions can be submitted.'),
      ),
    ).toBe(true);
    expect(
      isAlreadyReportedSubmissionError(
        new Error('This contribution already has sufficient recognized funding recorded.'),
      ),
    ).toBe(true);
    expect(isAlreadyReportedSubmissionError(new Error('network down'))).toBe(
      false,
    );
  });
});
