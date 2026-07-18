import {
  buildCircleSetupProgress,
  deriveOrganizerParticipates,
  isPayoutOrderComplete,
  orderedParticipatingHands,
  setupStepStatusLabel,
  splitWaitlistRequests,
} from '../circleSetupProgress';

/** Organizer membership id differs from organizer user id (proven API shape). */
const ORG_MEMBERSHIP_ID = 'm_org_hand';
const ORG_USER_ID = 'usr_org_user';

const baseMembers = [
  {
    id: ORG_MEMBERSHIP_ID,
    isParticipating: true,
    userId: ORG_USER_ID,
    name: 'Organizer',
  },
  { id: 'm_peer', isParticipating: true, userId: null, name: 'Peer Planned' },
];

function draftCircle(overrides: Record<string, unknown> = {}) {
  return {
    status: 'draft' as const,
    circleCode: 'ABCD12',
    contributionAmount: 100,
    handCount: 2,
    uniqueMemberCount: 1,
    totalRounds: 2,
    organizerId: ORG_MEMBERSHIP_ID,
    turnOrder: [ORG_MEMBERSHIP_ID, 'm_peer'],
    ...overrides,
  };
}

describe('circleSetupProgress', () => {
  test('returns null when circle is not in setup', () => {
    expect(
      buildCircleSetupProgress({
        circle: {
          status: 'active',
          isStarted: true,
          turnOrder: [ORG_MEMBERSHIP_ID, 'm_peer'],
        },
        members: baseMembers,
        waitlist: [],
      }),
    ).toBeNull();
  });

  test('builds seven ordered setup steps during setup', () => {
    const progress = buildCircleSetupProgress({
      circle: draftCircle(),
      members: baseMembers,
      waitlist: [],
    });
    expect(progress).not.toBeNull();
    expect(progress!.phase).toBe('setup');
    expect(progress!.steps.map((s) => s.id)).toEqual([
      'invite_members',
      'review_claims_joins',
      'confirm_member_access',
      'review_additional_hands',
      'verify_structure',
      'finalize_payout_order',
      'review_and_start',
    ]);
  });

  test('invite can be complete while hands remain unclaimed', () => {
    const progress = buildCircleSetupProgress({
      circle: draftCircle(),
      members: baseMembers, // peer still unclaimed
      waitlist: [],
    });
    expect(progress!.counts.unclaimedHands).toBe(1);
    expect(progress!.steps.find((s) => s.id === 'invite_members')!.status).toBe(
      'complete',
    );
  });

  test('join review can be complete while hands remain unclaimed', () => {
    const progress = buildCircleSetupProgress({
      circle: draftCircle(),
      members: baseMembers,
      waitlist: [],
    });
    expect(progress!.counts.unclaimedHands).toBe(1);
    expect(
      progress!.steps.find((s) => s.id === 'review_claims_joins')!.status,
    ).toBe('complete');
  });

  test('confirm access remains waiting for unclaimed hands', () => {
    const progress = buildCircleSetupProgress({
      circle: draftCircle(),
      members: baseMembers,
      waitlist: [],
    });
    const access = progress!.steps.find((s) => s.id === 'confirm_member_access')!;
    expect(access.status).toBe('waiting');
    expect(access.reason).toMatch(/unclaimed/i);
    expect(access.reason).toMatch(/cash/i);
    expect(access.reason).not.toMatch(/claimed workspace access/i);
  });

  test('join requests require action and block start', () => {
    const progress = buildCircleSetupProgress({
      circle: draftCircle(),
      members: [
        {
          id: ORG_MEMBERSHIP_ID,
          isParticipating: true,
          userId: ORG_USER_ID,
          name: 'Organizer',
        },
        { id: 'm_peer', isParticipating: true, userId: 'u_peer', name: 'Peer' },
      ],
      waitlist: [{ id: 'w1', userId: 'u_new', handNumber: 1 }],
    });
    const joinStep = progress!.steps.find((s) => s.id === 'review_claims_joins')!;
    expect(joinStep.status).toBe('action_required');
    expect(progress!.startBlockReason).toMatch(/join request/i);
    expect(progress!.steps.find((s) => s.id === 'review_and_start')!.status).toBe(
      'blocked',
    );
  });

  test('additional-hand requests are separate from join requests', () => {
    const { joinRequests, additionalHandRequests } = splitWaitlistRequests([
      { id: 'j1', handNumber: 1 },
      { id: 'a1', handNumber: 2, isAdditionalHand: true },
      { id: 'a2', hand_number: 3 },
    ]);
    expect(joinRequests).toHaveLength(1);
    expect(additionalHandRequests).toHaveLength(2);

    const progress = buildCircleSetupProgress({
      circle: draftCircle({ status: 'setup' }),
      members: [
        {
          id: ORG_MEMBERSHIP_ID,
          isParticipating: true,
          userId: ORG_USER_ID,
          name: 'Organizer',
        },
        { id: 'm_peer', isParticipating: true, userId: 'u_peer', name: 'Peer' },
      ],
      waitlist: [
        {
          id: 'a1',
          handNumber: 2,
          isAdditionalHand: true,
          userId: 'u_peer',
        },
      ],
    });
    const addStep = progress!.steps.find((s) => s.id === 'review_additional_hands')!;
    expect(addStep.status).toBe('action_required');
    expect(progress!.counts.pendingAdditionalHandRequests).toBe(1);
    expect(progress!.counts.pendingJoinRequests).toBe(0);
  });

  test('member access complete only when all hands claimed', () => {
    const complete = buildCircleSetupProgress({
      circle: draftCircle(),
      members: [
        {
          id: ORG_MEMBERSHIP_ID,
          isParticipating: true,
          userId: ORG_USER_ID,
          name: 'Organizer',
        },
        { id: 'm_peer', isParticipating: true, userId: 'u_peer', name: 'Peer' },
      ],
      waitlist: [],
    });
    expect(
      complete!.steps.find((s) => s.id === 'confirm_member_access')!.status,
    ).toBe('complete');
  });

  test('structure summary uses hands for pot and rounds', () => {
    const progress = buildCircleSetupProgress({
      circle: draftCircle({
        handCount: 3,
        uniqueMemberCount: 2,
        totalRounds: 3,
        turnOrder: [ORG_MEMBERSHIP_ID, 'm_a', 'm_b'],
      }),
      members: [
        {
          id: ORG_MEMBERSHIP_ID,
          isParticipating: true,
          userId: ORG_USER_ID,
          name: 'Org',
        },
        { id: 'm_a', isParticipating: true, userId: 'u_a', name: 'A' },
        { id: 'm_b', isParticipating: true, userId: 'u_a', name: 'A Hand 2' },
      ],
      waitlist: [],
    });
    expect(progress!.structure.handCount).toBe(3);
    expect(progress!.structure.peopleCount).toBe(2);
    expect(progress!.structure.potPerRound).toBe(300);
    expect(progress!.structure.totalRounds).toBe(3);
    expect(progress!.structure.organizerParticipates).toBe(true);
    expect(progress!.steps.find((s) => s.id === 'verify_structure')!.status).toBe(
      'complete',
    );
  });

  test('complete payout order does not automatically mean reviewed', () => {
    expect(
      isPayoutOrderComplete({
        members: baseMembers,
        turnOrder: [ORG_MEMBERSHIP_ID, 'm_peer'],
      }),
    ).toBe(true);

    const notReviewed = buildCircleSetupProgress({
      circle: draftCircle(),
      members: [
        {
          id: ORG_MEMBERSHIP_ID,
          isParticipating: true,
          userId: ORG_USER_ID,
          name: 'Organizer',
        },
        { id: 'm_peer', isParticipating: true, userId: 'u_peer', name: 'Peer' },
      ],
      waitlist: [],
      // payoutOrderReviewed omitted → false
    });
    expect(notReviewed!.payoutOrderComplete).toBe(true);
    expect(notReviewed!.payoutOrderReviewed).toBe(false);
    expect(notReviewed!.reviewRequired).toBe(true);
    expect(
      notReviewed!.steps.find((s) => s.id === 'finalize_payout_order')!.status,
    ).toBe('action_required');
    expect(
      notReviewed!.steps.find((s) => s.id === 'finalize_payout_order')!.reason,
    ).toMatch(/not confirmed/i);

    const reviewed = buildCircleSetupProgress({
      circle: draftCircle(),
      members: [
        {
          id: ORG_MEMBERSHIP_ID,
          isParticipating: true,
          userId: ORG_USER_ID,
          name: 'Organizer',
        },
        { id: 'm_peer', isParticipating: true, userId: 'u_peer', name: 'Peer' },
      ],
      waitlist: [],
      payoutOrderReviewed: true,
    });
    expect(reviewed!.payoutOrderReviewed).toBe(true);
    expect(reviewed!.reviewRequired).toBe(false);
    expect(
      reviewed!.steps.find((s) => s.id === 'finalize_payout_order')!.status,
    ).toBe('complete');
  });

  test('organizer participation uses membership id, not unlike user id', () => {
    // Proven: organizerId is membership id; user id differs.
    expect(
      deriveOrganizerParticipates({
        members: baseMembers,
        organizerId: ORG_MEMBERSHIP_ID,
      }),
    ).toBe(true);

    // organizerId wrongly set to user id must NOT match membership id.
    expect(
      deriveOrganizerParticipates({
        members: baseMembers,
        organizerId: ORG_USER_ID,
      }),
    ).toBe(false);

    // Explicit user-id field matches member.userId.
    expect(
      deriveOrganizerParticipates({
        members: baseMembers,
        organizerId: 'totally-wrong-membership',
        organizerUserId: ORG_USER_ID,
      }),
    ).toBe(true);

    // Explicit backend flag wins.
    expect(
      deriveOrganizerParticipates({
        members: baseMembers,
        organizerId: ORG_USER_ID,
        organizerParticipates: false,
      }),
    ).toBe(false);
    expect(
      deriveOrganizerParticipates({
        members: [
          {
            id: ORG_MEMBERSHIP_ID,
            isParticipating: false,
            userId: ORG_USER_ID,
            name: 'Organizer',
          },
          { id: 'm_peer', isParticipating: true, userId: 'u_peer', name: 'Peer' },
        ],
        organizerId: ORG_MEMBERSHIP_ID,
      }),
    ).toBe(false);

    const progress = buildCircleSetupProgress({
      circle: draftCircle({
        // Simulates mistaken user-id-as-organizerId with correct organizerUserId.
        organizerId: ORG_USER_ID,
        organizerUserId: ORG_USER_ID,
      }),
      members: baseMembers,
      waitlist: [],
    });
    expect(progress!.structure.organizerParticipates).toBe(true);
  });

  test('orderedParticipatingHands flags hands missing from turnOrder', () => {
    const rows = orderedParticipatingHands({
      members: baseMembers,
      turnOrder: [ORG_MEMBERSHIP_ID],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].inOrder).toBe(true);
    expect(rows[1].id).toBe('m_peer');
    expect(rows[1].inOrder).toBe(false);
  });

  test('status labels match product copy', () => {
    expect(setupStepStatusLabel('complete')).toBe('Complete');
    expect(setupStepStatusLabel('action_required')).toBe('Action required');
    expect(setupStepStatusLabel('waiting')).toBe('Waiting on member');
    expect(setupStepStatusLabel('blocked')).toBe('Blocked');
  });

  test('nextAction prefers first action_required step', () => {
    const progress = buildCircleSetupProgress({
      circle: draftCircle(),
      members: [
        {
          id: ORG_MEMBERSHIP_ID,
          isParticipating: true,
          userId: ORG_USER_ID,
          name: 'Organizer',
        },
        { id: 'm_peer', isParticipating: true, userId: 'u_peer', name: 'Peer' },
      ],
      waitlist: [{ id: 'w1', handNumber: 1 }],
    });
    expect(progress!.nextAction).toMatch(/join request/i);
  });
});
