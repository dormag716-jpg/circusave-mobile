import {
  buildPayoutOrderReviewLines,
  buildStartCircleConfirmations,
  canShowStartCircleAction,
  getStartCircleBlockReason,
  getStartCircleReviewHints,
  getUnclaimedParticipatingHands,
  isCircleSetupState,
  requiresUnclaimedStartConfirmation,
} from '../startCircleReadiness';

const members = [
  { id: 'm1', isParticipating: true, userId: 'u1', name: 'Organizer' },
  { id: 'm2', isParticipating: true, userId: 'u2', name: 'Peer' },
];

describe('startCircleReadiness', () => {
  test('setup is startable', () => {
    expect(isCircleSetupState({ status: 'setup' })).toBe(true);
    expect(
      canShowStartCircleAction({
        isOrganizer: true,
        circle: { status: 'setup' },
      }),
    ).toBe(true);
  });

  test('draft is startable', () => {
    expect(isCircleSetupState({ status: 'draft' })).toBe(true);
    expect(
      canShowStartCircleAction({
        isOrganizer: true,
        circle: { status: 'draft' },
      }),
    ).toBe(true);
  });

  test('forming is startable', () => {
    expect(isCircleSetupState({ status: 'forming' })).toBe(true);
    expect(
      canShowStartCircleAction({
        isOrganizer: true,
        circle: { status: 'forming' },
      }),
    ).toBe(true);
  });

  test('paused is not startable', () => {
    expect(isCircleSetupState({ status: 'paused' })).toBe(false);
    expect(
      canShowStartCircleAction({
        isOrganizer: true,
        circle: { status: 'paused' },
      }),
    ).toBe(false);
  });

  test('active is not startable', () => {
    expect(isCircleSetupState({ status: 'active' })).toBe(false);
    expect(
      canShowStartCircleAction({
        isOrganizer: true,
        circle: { status: 'active', isStarted: true },
      }),
    ).toBe(false);
  });

  test('completed is not startable', () => {
    expect(isCircleSetupState({ status: 'completed' })).toBe(false);
    expect(
      canShowStartCircleAction({
        isOrganizer: true,
        circle: { status: 'completed', isStarted: true },
      }),
    ).toBe(false);
  });

  test('closed is not startable', () => {
    expect(isCircleSetupState({ status: 'closed' })).toBe(false);
    expect(
      canShowStartCircleAction({
        isOrganizer: true,
        circle: { status: 'closed' },
      }),
    ).toBe(false);
  });

  test('any circle with startedAt is not startable', () => {
    expect(
      isCircleSetupState({
        status: 'draft',
        startedAt: '2026-08-01T00:00:00Z',
      }),
    ).toBe(false);
    expect(
      canShowStartCircleAction({
        isOrganizer: true,
        circle: {
          status: 'setup',
          startedAt: '2026-08-01T00:00:00Z',
        },
      }),
    ).toBe(false);
    expect(
      isCircleSetupState({
        status: 'forming',
        startedAt: '2026-08-01T00:00:00Z',
      }),
    ).toBe(false);
  });

  test('isStarted false keeps draft startable', () => {
    expect(
      isCircleSetupState({
        status: 'draft',
        startedAt: null,
        isStarted: false,
      }),
    ).toBe(true);
  });

  test('non-organizer does not see start action', () => {
    expect(
      canShowStartCircleAction({
        isOrganizer: false,
        circle: { status: 'setup' },
      }),
    ).toBe(false);
  });

  test('pending join request blocks starting', () => {
    const reason = getStartCircleBlockReason({
      circle: { status: 'draft', turnOrder: ['m1', 'm2'] },
      members,
      waitlist: [
        {
          id: 'w1',
          userId: 'u-new',
          handNumber: 1,
          isAdditionalHand: false,
        },
      ],
    });
    expect(reason).toMatch(/pending join/i);
  });

  test('pending additional-hand request blocks starting', () => {
    const reason = getStartCircleBlockReason({
      circle: { status: 'draft', turnOrder: ['m1', 'm2'] },
      members,
      waitlist: [
        {
          id: 'w2',
          userId: 'u1',
          handNumber: 2,
          isAdditionalHand: true,
        },
      ],
    });
    expect(reason).toMatch(/additional-hand/i);
  });

  test('ready circle has no block reason', () => {
    expect(
      getStartCircleBlockReason({
        circle: { status: 'setup', turnOrder: ['m1', 'm2'] },
        members,
        waitlist: [],
      }),
    ).toBeNull();
  });

  test('incomplete payout order blocks starting', () => {
    expect(
      getStartCircleBlockReason({
        circle: { status: 'draft', turnOrder: ['m1'] },
        members,
        waitlist: [],
      }),
    ).toMatch(/payout order/i);
  });

  test('fewer than two hands blocks starting', () => {
    expect(
      getStartCircleBlockReason({
        circle: { status: 'draft', turnOrder: ['m1'] },
        members: [{ id: 'm1', isParticipating: true }],
        waitlist: [],
      }),
    ).toMatch(/2 participating hands/i);
  });

  test('unclaimed hands are listed but do not hard-block start', () => {
    const roster = [
      { id: 'm1', isParticipating: true, userId: 'u1', name: 'Organizer' },
      { id: 'm2', isParticipating: true, userId: null, name: 'Amina' },
    ];
    expect(getUnclaimedParticipatingHands(roster)).toHaveLength(1);
    expect(requiresUnclaimedStartConfirmation(roster)).toBe(true);
    expect(
      getStartCircleBlockReason({
        circle: { status: 'draft', turnOrder: ['m1', 'm2'] },
        members: roster,
        waitlist: [],
      }),
    ).toBeNull();
  });

  test('payout order review lines follow turn order', () => {
    const lines = buildPayoutOrderReviewLines({
      members: [
        { id: 'm1', name: 'First', isParticipating: true },
        { id: 'm2', name: 'Second', isParticipating: true },
      ],
      turnOrder: ['m2', 'm1'],
    });
    expect(lines[0]).toMatch(/1\. Second/);
    expect(lines[1]).toMatch(/2\. First/);
  });

  test('review hints mention unclaimed hands', () => {
    const hints = getStartCircleReviewHints({
      members: [
        { id: 'm1', userId: 'u1', isParticipating: true },
        { id: 'm2', userId: null, isParticipating: true, name: 'Amina' },
      ],
    });
    expect(hints.some((h) => h.id === 'unclaimed_hands')).toBe(true);
    expect(hints.some((h) => h.id === 'payout_order')).toBe(true);
  });

  test('start confirmations require unclaimed ack when needed', () => {
    const roster = [
      { id: 'm1', userId: 'u1', isParticipating: true },
      { id: 'm2', userId: null, isParticipating: true },
    ];
    expect(
      buildStartCircleConfirmations({
        members: roster,
        payoutOrderReviewed: true,
        unclaimedManagedConfirmed: false,
      }),
    ).toEqual({ confirmPayoutOrder: true, confirmUnclaimedHands: false });
    expect(
      buildStartCircleConfirmations({
        members: roster,
        payoutOrderReviewed: true,
        unclaimedManagedConfirmed: true,
      }),
    ).toEqual({ confirmPayoutOrder: true, confirmUnclaimedHands: true });
  });
});
